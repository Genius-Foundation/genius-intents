import { AxiosError } from 'axios';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';

import {
  JupiterConfig,
  JupiterDynamicSlippageReport,
  JupiterPriceParamsToRequestParams,
  JupiterPriceResponse,
  JupiterPriceUrlParams,
  JupiterSwapUrlParams,
  JupiterTransactionData,
} from './jupiter.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { NATIVE_SOL, WRAPPED_SOL } from '../../utils/constants';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';

let logger: ILogger;

/**
 * The `JupiterService` class implements the IIntentProtocol interface for token swaps
 * on the Solana blockchain using the Jupiter aggregator. It provides functionality for
 * fetching price quotes and generating transaction data for token swaps on Solana.
 *
 * @implements {IIntentProtocol}
 */
export class JupiterService implements IIntentProtocol {
  /**
   * The protocol identifier for Jupiter.
   */
  public readonly protocol = ProtocolEnum.JUPITER;

  /**
   * The list of blockchain networks supported by the Jupiter service.
   * Currently only supports the Solana blockchain.
   */
  public readonly chains = [ChainIdEnum.SOLANA];

  /**
   * Indicates that the service operates only on a single blockchain.
   */
  public readonly singleChain = true;

  /**
   * Indicates that the service does not support cross-chain operations.
   */
  public readonly multiChain = false;

  /**
   * The Solana connection instance for interacting with the Solana blockchain.
   */
  protected readonly connection: Connection | undefined;

  /**
   * Default parameter overrides for price requests to the Jupiter API.
   */
  protected readonly priceParamOverrides: Partial<JupiterPriceUrlParams> = {
    restrictIntermediateTokens: true,
    onlyDirectRoutes: false,
    dynamicSlippage: true,
  };

  /**
   * Default parameter overrides for quote requests to the Jupiter API.
   */
  protected readonly quoteParamOverrides: Partial<JupiterSwapUrlParams> = {
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    skipUserAccountsRpcCalls: false,
  };

  /**
   * The base URL for the Jupiter API.
   */
  baseUrl: string = 'https://quote-api.jup.ag/v6';

  /**
   * The endpoint for price quote requests.
   */
  public readonly priceEndpoint: string = '/quote';

  /**
   * The endpoint for transaction quote requests.
   */
  public readonly quoteEndpoint: string = '/swap-instructions';

  /**
   * The endpoint for transaction assembly.
   */
  public readonly assemblyEndpoint: string = '/swap';

  /**
   * Creates a new instance of the JupiterService.
   *
   * @param {SDKConfig & JupiterConfig} config - Configuration parameters for the service.
   */
  constructor(config?: GeniusIntentsSDKConfig & JupiterConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    if (config?.rpcUrls) {
      const solanaRpcUrl = config.rpcUrls[ChainIdEnum.SOLANA];
      if (solanaRpcUrl) this.connection = new Connection(solanaRpcUrl, 'confirmed');
    }

    // Jupiter API endpoint
    if (config?.privateUrl) {
      this.baseUrl = config.privateUrl;
    }
    // Apply configuration overrides with defaults
    this.priceParamOverrides = {
      ...this.priceParamOverrides,
      ...(config?.priceParamOverrides || {}),
    };

    this.quoteParamOverrides = {
      ...this.quoteParamOverrides,
      ...(config?.quoteParamOverrides || {}),
    };
  }

  /**
   * Checks if the provided configuration object matches the expected type `T`.
   *
   * @template T - The expected configuration type, with string keys and string values.
   * @param _config - The configuration object to validate.
   * @returns `true` if the configuration is considered correct. For Jupiter, all config fields are optional, so this always returns `true`.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // Jupiter has no required config fields, all are optional
    return true;
  }

  /**
   * Fetches a price quote for a token swap from the Jupiter API.
   *
   * @param {PriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<PriceResponse>} A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - The price impact of the swap.
   * - The raw response from the Jupiter API.
   *
   * @throws {SdkError} If the networks specified are not supported.
   * @throws {SdkError} If the API returns an error response.
   * @throws {SdkError} If there's an error fetching the price.
   */
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
      const formattedError = createErrorMessage(error, this.protocol);
      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the Jupiter API and builds the transaction data
   * needed to execute the swap on Solana.
   *
   * @param {QuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse>} A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   * - The price impact of the swap.
   *
   * @throws {SdkError} If the Solana connection is not initialized.
   * @throws {SdkError} If the price response is invalid or missing.
   * @throws {SdkError} If the dynamic slippage is higher than expected.
   * @throws {SdkError} If there's an error fetching the quote.
   */
  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    if (!this.connection) {
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'Connection not initialized');
    }

    const { from, receiver } = params;
    let { priceResponse } = params;

    const slippage = params.slippage <= 4 ? 5 : params.slippage;

    if (!priceResponse || !this.isJupiterPriceResponse(priceResponse.protocolResponse)) {
      priceResponse = await this.fetchPrice({ ...params, slippage });
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

      const usePriorityFee = params?.priorityFee && BigInt(params.priorityFee) > BigInt('0');
      const swapParams = {
        quoteResponse: priceResponse.protocolResponse,
        userPublicKey: from,
        ...this.quoteParamOverrides,
      };

      // If priority fee is provided, use it as a max in the swap parameters
      if (usePriorityFee) {
        swapParams.prioritizationFeeLamports = {
          priorityLevelWithMaxLamports: {
            // Convert the priority fee to lamports
            maxLamports: Number(params.priorityFee),
            priorityLevel: 'veryHigh',
          },
        };
      }

      // If the slippage is less than or equal to 4%, enable dynamic slippage
      // if (params.slippage <= 5) {
      //   swapParams.dynamicSlippage = false;
      //   swapParams.slippageBps = Math.round(5 * 100);
      // }

      const swapTransactionResponse = await axios.post<JupiterTransactionData>(
        `${this.baseUrl}${this.assemblyEndpoint}`,
        swapParams,
      );

      //will throw if transaction is too large
      swapTransactionResponse.data.swapTransaction = bs58.encode(
        VersionedTransaction.deserialize(
          // @ts-ignore
          Buffer.from(swapTransactionResponse.data.swapTransaction, 'base64'),
        ).serialize(),
      );

      if (
        this.quoteParamOverrides.dynamicSlippage &&
        !swapTransactionResponse?.data?.dynamicSlippageReport
      ) {
        throw new Error('Dynamic slippage report is not available');
      }

      const dynamicSlippageReport = swapTransactionResponse.data
        .dynamicSlippageReport as JupiterDynamicSlippageReport;

      if (
        this.quoteParamOverrides.dynamicSlippage &&
        dynamicSlippageReport.slippageBps > params.slippage * 100
      ) {
        throw new Error(
          `Dynamic slippage is higher than expected. Reported: ${
            swapTransactionResponse?.data?.dynamicSlippageReport?.slippageBps
          }bps, Max Tolerance: ${params.slippage * 100}bps`,
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

  /**
   * Transforms the price parameters to the format expected by the Jupiter API.
   *
   * @param {Object} params - The parameters to transform.
   * @param {string} params.tokenIn - The token address to swap from.
   * @param {string} params.tokenOut - The token address to swap to.
   * @param {string} params.amountIn - The amount of input tokens to swap.
   * @param {number} params.slippage - The maximum acceptable slippage percentage.
   * @param {string} [params.from] - The address initiating the swap.
   *
   * @returns {JupiterPriceUrlParams} The transformed parameters ready for the Jupiter API.
   */
  protected priceParamsToRequestParams(
    params: JupiterPriceParamsToRequestParams,
  ): JupiterPriceUrlParams {
    const { tokenIn, tokenOut, amountIn } = params;

    const slippage = params.slippage;

    const requestParams: JupiterPriceUrlParams = {
      inputMint: tokenIn === NATIVE_SOL ? WRAPPED_SOL : tokenIn,
      outputMint: tokenOut === NATIVE_SOL ? WRAPPED_SOL : tokenOut,
      amount: parseInt(amountIn),
      slippageBps: Math.round(slippage * 100),
    };
    return requestParams;
  }

  /**
   * Type guard to check if a response is a valid Jupiter price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid Jupiter price response.
   */
  protected isJupiterPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is JupiterPriceResponse {
    return (
      response && 'inputMint' in response && 'outputMint' in response && 'outAmount' in response
    );
  }
}
