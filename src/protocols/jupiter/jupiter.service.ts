import axios from 'axios';
import bs58 from 'bs58';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { NATIVE_SOL, WRAPPED_SOL } from '../../utils/constants';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { AxiosError } from 'axios';
import {
  JupiterConfig,
  JupiterPriceResponse,
  JupiterPriceUrlParams,
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

  public readonly priceEndpoint: string = '/quote';
  public readonly quoteEndpoint: string = '/swap-instructions';
  public readonly assemblyEndpoint: string = '/swap';

  public baseUrl: string;

  constructor(config?: GeniusIntentsSDKConfig & JupiterConfig) {
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
      const requestParams = {
        ...this.priceParamsToRequestParams({
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          slippage: params.slippage,
          from: params.from,
        }),
        ...(params.overrideParamsJupiter ? params.overrideParamsJupiter : {}),
      };

      const stringParams: Record<string, string> = Object.fromEntries(
        Object.entries(requestParams).map(([k, v]) => [k, String(v)]),
      );
      const urlParams = new URLSearchParams(stringParams).toString();
      const priceUrl = `${this.baseUrl}${this.priceEndpoint}?${urlParams}`;
      // Log the full quote (swap) URL and body
      logger.debug(`Jupiter Price URL: ${priceUrl}`);

      const response = await axios.get<JupiterPriceResponse | { error: unknown }>(priceUrl);
      logger.debug(`Jupiter API response: ${JSON.stringify(response.data, null, 2)}`);

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
        ...(params.overrideParamsJupiter ? params.overrideParamsJupiter : {}),
      };

      // Log the full quote (swap) URL and body
      const quoteUrl = `${this.baseUrl}${this.assemblyEndpoint}`;
      logger.debug(`Jupiter Quote URL: ${quoteUrl}`);
      logger.debug(`Jupiter Quote Body: ${JSON.stringify(swapParams, null, 2)}`);

      const swapTransactionResponse = await axios.post<JupiterTransactionData>(
        quoteUrl,
        swapParams,
      );

      logger.debug(`Jupiter Quote Response: ${JSON.stringify(swapTransactionResponse.data)}`);

      //will throw if transaction is too large
      swapTransactionResponse.data.swapTransaction = bs58.encode(
        VersionedTransaction.deserialize(
          Buffer.from(swapTransactionResponse.data.swapTransaction, 'base64'),
        ).serialize(),
      );

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
        slippage: priceResponse.slippage,
        priceImpact: priceResponse.priceImpact,
        svmExecutionPayload: [swapTransactionResponse.data.swapTransaction],
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
