import axios from 'axios';
import bs58 from 'bs58';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { IntentsSDKConfig } from '../../types/sdk-config';
import { NATIVE_SOL, WRAPPED_SOL } from '../../utils/constants';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { AxiosError } from 'axios';
import {
  JupiterConfig,
  JupiterPriceResponse,
  JupiterPriceUrlParams,
  JupiterSwapUrlParams,
  JupiterTransactionData,
} from './jupiter.types';
import { VersionedTransaction } from '@solana/web3.js';
import { createErrorMessage } from '../../utils/create-error-message';

let logger: ILogger;

export class JupiterService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.JUPITER;
  public readonly chains = [ChainIdEnum.SOLANA];
  public readonly singleChain = true;
  public readonly multiChain = false;

  protected readonly priceParamOverrides: Partial<JupiterPriceUrlParams> = {
    restrictIntermediateTokens: true,
    onlyDirectRoutes: false,
    // dynamicSlippage: true,
  };
  protected readonly quoteParamOverrides: Partial<JupiterSwapUrlParams> = {
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    skipUserAccountsRpcCalls: false,
  };
  public readonly priceEndpoint: string = '/quote';
  public readonly quoteEndpoint: string = '/swap-instructions';
  public readonly assemblyEndpoint: string = '/swap';

  public baseUrl: string;

  constructor(config?: IntentsSDKConfig & JupiterConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    // Jupiter API endpoint
    this.baseUrl = config?.jupiterPrivateUrl || 'https://quote-api.jup.ag/v6';
  }

  isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // Jupiter has no required config fields, all are optional
    return true;
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    if (params.networkIn !== ChainIdEnum.SOLANA || params.networkOut !== ChainIdEnum.SOLANA) {
      logger.error(`Jupiter only supports Solana network`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Jupiter only supports Solana network');
    }

    try {
      const requestParams = this.priceParamsToRequestParams({
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        slippage: params.slippage,
        from: params.from,
      });

      // Apply price parameter overrides
      const finalParams = {
        ...requestParams,
        ...this.priceParamOverrides,
      };
      if (finalParams.dynamicSlippage) {
        delete finalParams.slippageBps;
      }

      const urlParams = new URLSearchParams(finalParams as unknown as Record<string, string>);

      const endpoint = `${this.baseUrl}${this.priceEndpoint}?${urlParams.toString()}`;

      logger.debug(`Making Jupiter API price request to: ${endpoint}`);

      const response = await axios.get<JupiterPriceResponse | { error: unknown }>(endpoint);

      const priceData = response.data;

      if ('error' in priceData) {
        logger.error(`Jupiter API returned error`, new Error(JSON.stringify(priceData, null, 2)));
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          `Jupiter API returned error: ${JSON.stringify(priceData.error, null, 2)}`,
        );
      }

      const priceResponse: PriceResponse = {
        protocol: ProtocolEnum.JUPITER,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: priceData.outAmount,
        slippage: params.slippage,
        priceImpact: parseFloat(priceData.priceImpactPct) * 100,
        protocolResponse: priceData,
      };

      return priceResponse;
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch swap price from ${this.protocol}`, errorMessageError);
      logger.error(`Failed to fetch Jupiter price`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch Jupiter price, error: ${errorMessage}`,
      );
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    const { from, receiver } = params;
    let { priceResponse } = params;

    if (!priceResponse || !this.isJupiterPriceResponse(priceResponse.protocolResponse)) {
      priceResponse = await this.fetchPrice(params);
    }

    if (!this.isJupiterPriceResponse(priceResponse.protocolResponse)) {
      logger.error(`Invalid Jupiter price response`);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Invalid Jupiter price response: ${JSON.stringify(priceResponse)}`,
      );
    }

    try {
      logger.debug(`Making Jupiter API quote request for swap instructions`);

      const swapParams = {
        quoteResponse: priceResponse.protocolResponse,
        userPublicKey: from,
        ...this.quoteParamOverrides,
      };

      const swapTransactionResponse = await axios.post<JupiterTransactionData>(
        `${this.baseUrl}${this.assemblyEndpoint}`,
        swapParams,
      );

      //will throw if transaction is too large
      swapTransactionResponse.data.swapTransaction = bs58.encode(
        VersionedTransaction.deserialize(
          Buffer.from(swapTransactionResponse.data.swapTransaction, 'base64'),
        ).serialize(),
      );

      if (
        this.quoteParamOverrides.dynamicSlippage &&
        !swapTransactionResponse?.data?.dynamicSlippageReport
      ) {
        throw new Error('Dynamic slippage report is not available');
      }
      //@ts-ignore // will never be undefined if dynamic slippage is enabled
      if (
        this.quoteParamOverrides.dynamicSlippage &&
        swapTransactionResponse.data.dynamicSlippageReport &&
        swapTransactionResponse.data.dynamicSlippageReport.slippageBps > params.slippage * 100
      ) {
        throw new Error(
          `Dynamic slippage is higher than expected. Reported: ${swapTransactionResponse?.data?.dynamicSlippageReport?.slippageBps}bps, Max Tolerance: ${params.slippage * 100}bps`,
        );
      }

      const quoteResponse: QuoteResponse = {
        protocol: ProtocolEnum.JUPITER,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: priceResponse.tokenIn,
        tokenOut: priceResponse.tokenOut,
        amountIn: priceResponse.amountIn,
        amountOut: priceResponse.amountOut,
        from,
        receiver: receiver || from,
        //@ts-ignore // will never be undefined if dynamic slippage is enabled
        slippage:
          this.quoteParamOverrides.dynamicSlippage &&
          swapTransactionResponse?.data?.dynamicSlippageReport?.slippageBps
            ? swapTransactionResponse?.data?.dynamicSlippageReport?.slippageBps / 100
            : priceResponse.slippage,
        priceImpact: priceResponse.priceImpact,
        executionPayload: {
          transactionData: [
            {
              ...swapTransactionResponse.data,
              transaction: swapTransactionResponse.data.swapTransaction,
            },
          ],
        },
        protocolResponse: { transactions: [] },
      };
      return quoteResponse;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof AxiosError
          ? error?.response?.data?.error ||
            error?.response?.data?.detail ||
            error?.response?.data?.message
          : error instanceof Error
            ? error.message
            : String(error);
      logger.error(`Failed to fetch Jupiter quote`, errorMessage);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch Jupiter quote, error: ${errorMessage}`,
      );
    }
  }

  protected priceParamsToRequestParams(params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippage: number;
    from?: string;
  }): JupiterPriceUrlParams {
    const { tokenIn, tokenOut, amountIn, slippage } = params;
    const requestParams: JupiterPriceUrlParams = {
      inputMint: tokenIn === NATIVE_SOL ? WRAPPED_SOL : tokenIn,
      outputMint: tokenOut === NATIVE_SOL ? WRAPPED_SOL : tokenOut,
      amount: parseInt(amountIn),
      slippageBps: Math.round(slippage * 100),
    };
    return requestParams;
  }

  protected isJupiterPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is JupiterPriceResponse {
    return (
      response && 'inputMint' in response && 'outputMint' in response && 'outAmount' in response
    );
  }
}
