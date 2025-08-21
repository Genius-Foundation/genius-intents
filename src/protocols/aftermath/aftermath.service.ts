import axios from 'axios';
import { SuiClient } from '@mysten/sui/client';

import {
  AftermathConfig,
  AftermathPriceResponse,
  AftermathSwapParams,
  AftermathTransactionData,
} from './aftermath.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';

let logger: ILogger;

/**
 * Service class for interacting with the Aftermath protocol on the Sui blockchain.
 * Implements the `IIntentProtocol` interface to provide price and quote fetching functionality.
 *
 * @remarks
 * - Only supports the Sui network.
 * - Uses Aftermath API endpoints for price and transaction data.
 * - Handles configuration, logging, and Sui client initialization.
 *
 * @example
 * ```typescript
 * const aftermathService = new AftermathService(config);
 * const price = await aftermathService.fetchPrice(params);
 * const quote = await aftermathService.fetchQuote(params);
 * ```
 *
 * @param config - Configuration object combining GeniusIntentsSDKConfig and AftermathConfig.
 *
 * @method isCorrectConfig - Type guard to validate configuration object.
 * @method fetchPrice - Fetches price data from Aftermath API.
 * @method fetchQuote - Fetches quote and transaction data from Aftermath API, estimates gas.
 * @method isAftermathPriceResponse - Type guard for Aftermath price response.
 */
export class AftermathService implements IIntentProtocol {
  /**
   * The protocol enum value for Aftermath.
   */
  public readonly protocol = ProtocolEnum.AFTERMATH;

  /**
   * The supported chain IDs for Aftermath.
   */
  public readonly chains = [ChainIdEnum.SUI];

  /**
   * Indicates single chain support (true).
   */
  public readonly singleChain = true;

  /**
   * Indicates multi-chain support (false).
   */
  public readonly multiChain = false;

  /**
   * The base URL for Aftermath API.
   */
  public readonly baseUrl: string;

  /**
   * Sui client instance for interacting with the Sui blockchain.
   */
  protected readonly suiClient: SuiClient;

  /**
   * Optional overrides for quote responses
   */
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

  public isCorrectConfig<T extends { [key: string]: string }>(config: {
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
