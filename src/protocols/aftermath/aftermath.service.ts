import axios from 'axios';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import {
  AftermathConfig,
  AftermathPriceResponse,
  AftermathSwapParams,
  AftermathTransactionData,
} from './aftermath.types';
import { SuiClient } from '@mysten/sui/client';
import { createErrorMessage } from '../../utils/create-error-message';

let logger: ILogger;
export class AftermathService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.AFTERMATH;
  public readonly chains = [ChainIdEnum.SUI];
  public readonly singleChain = true;
  public readonly multiChain = false;
  public readonly baseUrl: string;
  protected readonly suiClient: SuiClient;
  protected readonly quoteParamOverrides: Partial<AftermathSwapParams> = {
    isSponsoredTx: false,
  };
  constructor(config: GeniusIntentsSDKConfig & AftermathConfig) {
    if (config.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    this.suiClient = new SuiClient({ url: config.suiRpcUrl });

    // Aftermath API endpoint
    this.baseUrl = config?.privateUrl || 'https://api.aftermath.finance/v1';

    this.quoteParamOverrides = {
      ...this.quoteParamOverrides,
      ...(config?.quoteParamOverrides || {}),
    };
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['suiRpcUrl'] === 'string' && config['suiRpcUrl'].length > 0;
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    if (params.networkIn !== ChainIdEnum.SUI || params.networkOut !== ChainIdEnum.SUI) {
      logger.error(`Aftermath only supports Sui network`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Aftermath only supports Sui network');
    }

    try {
      const requestParams = {
        coinInType: params.tokenIn,
        coinOutType: params.tokenOut,
        coinInAmount: BigInt(params.amountIn),
        slippage: params.slippage,
      };

      logger.debug(
        `Making Aftermath API price request with params: ${JSON.stringify({
          ...requestParams,
          coinInAmount: requestParams.coinInAmount.toString(),
        })}`,
      );

      const response = await axios.post<AftermathPriceResponse>(`${this.baseUrl}/quote`, {
        ...requestParams,
        coinInAmount: requestParams.coinInAmount.toString(),
      });

      const priceData = response.data;

      if (!priceData || !priceData.route) {
        logger.error(
          `Aftermath API returned invalid response`,
          new Error(JSON.stringify(priceData, null, 2)),
        );
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          `Aftermath API returned invalid response: ${JSON.stringify(priceData)}`,
        );
      }

      const priceResponse: PriceResponse = {
        protocol: ProtocolEnum.AFTERMATH,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: priceData.outAmount,
        slippage: params.slippage,
        priceImpact: parseFloat(priceData.spotPrice) * 100,
        protocolResponse: priceData,
      };

      return priceResponse;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);
      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    if (!this.suiClient) {
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'Sui client not initialized');
    }

    const { from, receiver } = params;
    let { priceResponse } = params;

    if (!priceResponse || !this.isAftermathPriceResponse(priceResponse.protocolResponse)) {
      priceResponse = await this.fetchPrice(params);
    }

    if (!this.isAftermathPriceResponse(priceResponse.protocolResponse)) {
      logger.error(`Invalid Aftermath price response`);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Invalid Aftermath price response: ${JSON.stringify(priceResponse)}`,
      );
    }

    try {
      logger.debug(`Making Aftermath API quote request for swap transaction`);

      const swapParams = {
        walletAddress: from,
        completeRoute: priceResponse.protocolResponse.route,
        slippage: params.slippage,
        ...this.quoteParamOverrides,
      };

      const response = await axios.post<AftermathTransactionData>(
        `${this.baseUrl}/transaction`,
        swapParams,
      );

      if (!response.data || !response.data.transactionBlock) {
        logger.error(
          `Aftermath API returned invalid transaction data`,
          new Error(JSON.stringify(response.data, null, 2)),
        );
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `Aftermath API returned invalid transaction data: ${JSON.stringify(response.data)}`,
        );
      }

      // Get transaction bytes for gas estimation
      const txBytes = response.data.transactionBlock;

      // Estimate gas if needed
      let gasEstimate = '0';
      try {
        const dryRunResult = await this.suiClient.dryRunTransactionBlock({
          transactionBlock: txBytes,
        });

        const computationCost = dryRunResult.effects.gasUsed.computationCost;
        const storageCost = dryRunResult.effects.gasUsed.storageCost;
        const storageRebate = dryRunResult.effects.gasUsed.storageRebate;

        gasEstimate = (
          BigInt(computationCost) +
          BigInt(storageCost) -
          BigInt(storageRebate)
        ).toString();
      } catch (error) {
        logger.warn(`Failed to estimate gas for Aftermath transaction`, { error });
      }

      const quoteResponse: QuoteResponse = {
        protocol: ProtocolEnum.AFTERMATH,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: priceResponse.tokenIn,
        tokenOut: priceResponse.tokenOut,
        amountIn: priceResponse.amountIn,
        amountOut: priceResponse.amountOut,
        from,
        receiver: receiver || from,
        slippage: priceResponse.slippage,
        priceImpact: priceResponse.priceImpact,
        estimatedGas: gasEstimate,
        svmExecutionPayload: [txBytes],
        protocolResponse: { transactions: [txBytes] },
      };

      return quoteResponse;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);
      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  protected isAftermathPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is AftermathPriceResponse {
    return response && 'route' in response && 'outAmount' in response;
  }
}
