import axios from 'axios';
import bs58 from 'bs58';
import { AxiosError } from 'axios';
import { VersionedTransaction } from '@solana/web3.js';

import {
  JupiterConfig,
  JupiterPriceResponse,
  JupiterPriceUrlParams,
  JupiterTransactionData,
} from './jupiter.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { WRAPPED_SOL } from '../../utils/constants';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import { isNative } from '../../utils/is-native';

let logger: ILogger;

/**
 * Service class for interacting with the Jupiter protocol on the Solana blockchain.
 * Implements the IIntentProtocol interface to provide price and quote fetching functionalities.
 *
 * @remarks
 * - Only supports Solana network for both input and output.
 * - Uses configurable endpoints for price, quote, and swap assembly.
 * - Allows custom logger and debug configuration.
 *
 * @example
 * ```typescript
 * const service = new JupiterService({ debug: true });
 * const price = await service.fetchPrice({ ... });
 * const quote = await service.fetchQuote({ ... });
 * ```
 */
export class JupiterService implements IIntentProtocol {
  /**
   * The protocol identifier for Jupiter.
   */
  public readonly protocol = ProtocolEnum.JUPITER;

  /**
   * The supported blockchain networks for this protocol.
   */
  public readonly chains = [ChainIdEnum.SOLANA];

  /**
   * Indicates whether the protocol supports single-chain swaps.
   */
  public readonly singleChain = true;

  /**
   * Indicates whether the protocol supports multi-chain swaps.
   */
  public readonly multiChain = false;

  /**
   * The endpoint for fetching price quotes.
   */
  public readonly priceEndpoint: string = '/quote';

  /**
   * The endpoint for fetching swap instructions.
   */
  public readonly quoteEndpoint: string = '/swap-instructions';

  /**
   * The endpoint for fetching swap assembly instructions.
   */
  public readonly assemblyEndpoint: string = '/swap';

  /**
   * The base URL for the Jupiter API.
   */
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

  public isCorrectConfig<T extends { [key: string]: string }>(_config: {
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

      // If dynamic slippage is enabled from the override params, remove the slippageBps parameter
      if (requestParams.dynamicSlippage) delete requestParams.slippageBps;

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
        ...params,
        protocol: ProtocolEnum.JUPITER,
        amountOut: priceData.outAmount,
        priceImpact: parseFloat(priceData.priceImpactPct) * 100,
        protocolResponse: priceData,
      };

      return priceResponse;
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);
      logger.error(
        `Failed to fetch swap price from ${this.protocol}, error: ${formattedError.message}`,
      );
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch Jupiter price, error: ${formattedError.message}`,
      );
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    const { from } = params;
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

      // If dynamic slippage is enabled from the override params, remove the slippageBps parameter
      if (swapParams.dynamicSlippage) delete swapParams.slippageBps;

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
        ...params,
        amountOut: priceResponse.amountOut,
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
      inputMint: isNative(tokenIn) ? WRAPPED_SOL : tokenIn,
      outputMint: isNative(tokenOut) ? WRAPPED_SOL : tokenOut,
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
