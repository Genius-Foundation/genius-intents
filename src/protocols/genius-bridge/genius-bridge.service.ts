import {
  Authority,
  GeniusBridgePriceRequestParams,
  GeniusBrdidgeQuoteRequestParams,
} from './genius-bridge.types';
import {
  validateAndChecksumEvmAddress,
  validateSolanaAddress,
} from '../../utils/address-validation';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { isNative } from '../../utils/is-native';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { isEVMNetwork, isSolanaNetwork } from '../../utils/check-vm';
import { createErrorMessage } from '../../utils/create-error-message';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';
import { GeniusBridgePriceResponse, GeniusBridgeQuoteResponse } from 'genius-bridge-sdk';

let logger: ILogger;

/**
 * The `GeniusBridgeService` class implements the IIntentProtocol interface for cross-chain
 * token swaps using the Genius Bridge protocol. It provides functionality for fetching price
 * quotes and generating transaction data for token transfers across multiple supported
 * blockchain networks.
 *
 * @implements {IIntentProtocol}
 */
export class GeniusBridgeService implements IIntentProtocol {
  /**
   * RPC URLs for each supported blockchain network.
   */
  protected readonly rpcUrls: Record<number, string | string[]> = {};

  /**
   * The protocol identifier for Genius Bridge.
   */
  public readonly protocol = ProtocolEnum.GENIUS_BRIDGE;

  /**
   * The list of blockchain networks supported by the Genius Bridge service.
   */
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
    ChainIdEnum.SOLANA,
  ];

  /**
   * Indicates that the service does not operate only on a single blockchain.
   */
  public readonly singleChain = false;

  /**
   * Indicates that the service supports cross-chain operations.
   */
  public readonly multiChain = true;

  /**
   * The base URL for the Genius Bridge API.
   */
  public readonly baseUrl: string;

  /**
   * The endpoint for price quote requests.
   */
  private readonly _priceEndpoint: string | undefined;

  /**
   * The endpoint for transaction quote requests.
   */
  private readonly _quoteEndpoint: string | undefined;

  /**
   * Creates a new instance of the GeniusBridgeService.
   *
   * @param {GeniusIntentsSDKConfig & {geniusBridgeBaseUrl?: string; geniusBridgePriceEndpoint?: string; geniusBridgeQuoteEndpoint?: string}} config -
   * Configuration parameters for the service, including optional custom API endpoints.
   *
   * @throws {SdkError} If no RPC URLs are provided for the supported blockchains.
   */
  constructor(
    config?: GeniusIntentsSDKConfig & {
      geniusBridgeBaseUrl?: string;
      geniusBridgePriceEndpoint?: string;
      geniusBridgeQuoteEndpoint?: string;
    },
  ) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    if (config?.rpcUrls) {
      this.rpcUrls = config.rpcUrls;
    }
    if (!config?.rpcUrls) {
      logger.error('GeniusBridge Service requires RPC URLs');
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'GeniusBridge Service requires RPC URLs');
    }

    // Apply configuration with defaults
    /**
     * @samuel-videau Need to migrate this off of your personal domain
     */
    this.baseUrl = config?.geniusBridgeBaseUrl || 'https://bridge-api.tradegeniuses.net/';
    this._priceEndpoint = config?.geniusBridgePriceEndpoint || '/quoting/price';
    this._quoteEndpoint = config?.geniusBridgeQuoteEndpoint || '/quoting/quote';
  }

  /**
   * Checks if the provided configuration object matches the expected type.
   *
   * @typeParam T - The expected configuration type, extending an object with string values.
   * @param _config - The configuration object to validate.
   * @returns `true` if the configuration is considered correct. For GeniusBridge, all config fields are optional,
   * so this always returns `true`.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // GeniusBridge has no required config fields, all are optional
    return true;
  }

  /**
   * Fetches a price quote for a cross-chain token swap from the Genius Bridge API.
   *
   * @param {IntentPriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<PriceResponse>} A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - The raw response from the Genius Bridge API.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If there's an error fetching the price from Genius Bridge.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    try {
      this.validatePriceParams(params);
      const transformedParams = this.transformPriceParams(params);

      const response = await this.makeGeniusBridgePriceRequest(transformedParams);

      if (response instanceof Error) {
        throw response;
      }

      logger.debug('Successfully received price info from GeniusBridge', {
        amountOut: response.amountOut,
        tokenIn: response.tokenIn,
        tokenOut: response.tokenOut,
      });

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: response.amountOut,
        estimatedGas: '0', // GeniusBridge doesn't provide gas estimates in price response
        slippage: params.slippage,
        priceImpact: undefined, // GeniusBridge doesn't provide price impact
        protocolResponse: response,
      };
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the Genius Bridge API and builds the transaction data
   * needed to execute the cross-chain swap.
   *
   * @param {IntentQuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse>} A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the Genius Bridge API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the quote.
   */
  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    try {
      this.validateQuoteParams(params);
      const transformedParams = this.transformQuoteParams(params);

      const priceResponseRaw = await this.makeGeniusBridgePriceRequest(transformedParams);

      if (priceResponseRaw instanceof Error || !priceResponseRaw) {
        throw priceResponseRaw;
      }

      // Ensure feesDetails.swapOut and feesDetails.call are always strings
      const priceResponse = {
        ...priceResponseRaw,
        feesDetails: {
          ...priceResponseRaw.feesDetails,
          swapOut: priceResponseRaw.feesDetails.swapOut ?? '',
          call: priceResponseRaw.feesDetails.call ?? '',
        },
      };

      if (priceResponse.feesDetails.call === '') {
        // throw an error
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'Missing call fee details');
      }

      const response = await this.makeGeniusBridgeQuoteRequest({
        ...transformedParams,
        priceResponse,
        svmTokenAmountPercentage: 90,
      });

      if (response instanceof Error) {
        throw response;
      }

      const isEvm = isEVMNetwork(params.networkIn);

      logger.debug('Successfully received quote info from GeniusBridge', {
        amountOut: priceResponse.amountOut,
        minAmountOut: priceResponse.minAmountOut,
        fee: priceResponse.fee,
      });

      const executionPayloadKey = isEvm ? 'evmExecutionPayload' : 'svmExecutionPayload';

      // First, split the logic for EVM and non-EVM paths more clearly
      const executionPayload = isEvm
        ? {
            // EVM path
            transactionData: response.evmExecutionPayload
              ? {
                  data: response.evmExecutionPayload.data,
                  to: response.evmExecutionPayload.to,
                  value: response.evmExecutionPayload.value || '0',
                  gasEstimate: '0',
                  gasLimit: '0',
                }
              : undefined,
          }
        : response.svmExecutionPayload
          ? response.svmExecutionPayload // Ensure it's wrapped as a string array
          : [];

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: priceResponse.amountOut,
        estimatedGas: '0',
        slippage: params.slippage,
        priceImpact: undefined, // GeniusBridge doesn't provide price impact
        from: params.from,
        receiver: params.receiver || params.from,
        [executionPayloadKey]: executionPayload,
        protocolResponse: response,
      };
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Makes a request to the Genius Bridge API to get a price quote for a cross-chain swap.
   *
   * @param {GeniusBridgePriceRequestParams} params - The parameters for the price request.
   *
   * @returns {Promise<GeniusBridgePriceResponse | Error>} A promise that resolves to the price response or an error.
   */
  public async makeGeniusBridgePriceRequest(
    params: GeniusBridgePriceRequestParams,
  ): Promise<GeniusBridgePriceResponse | Error> {
    const url = `${this.baseUrl}${this._priceEndpoint}`;

    logger.debug('Making GeniusBridge price request', {
      networkIn: params.networkIn,
      networkOut: params.networkOut,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
    });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({ message: 'Unknown error' }))) as Error;
        throw new Error(`GeniusBridge API error: ${errorData.message || response.statusText}`);
      }

      const price = await response.json();
      return price as GeniusBridgePriceResponse;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      return sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Makes a request to the Genius Bridge API to get a transaction quote for a cross-chain swap.
   *
   * @param {GeniusBrdidgeQuoteRequestParams} params - The parameters for the quote request.
   *
   * @returns {Promise<GeniusBridgeQuoteResponse | Error>} A promise that resolves to the quote response or an error.
   */
  public async makeGeniusBridgeQuoteRequest(
    params: GeniusBrdidgeQuoteRequestParams,
  ): Promise<GeniusBridgeQuoteResponse | Error> {
    const url = `${this.baseUrl}${this._quoteEndpoint}`;

    logger.debug('Making GeniusBridge quote request', {
      networkIn: params.networkIn,
      networkOut: params.networkOut,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      to: params.to,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkIn: params.networkIn,
          networkOut: params.networkOut,
          amountIn: params.amountIn,
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          slippage: params.slippage,
          from: params.from,
          sponsor: params.sponsor || false,
          priceResponse: params.priceResponse,
          to: params.to,
          authority: params.authority,
          permit: params.permit,
          svmTokenAmountPercentage: params.svmTokenAmountPercentage,
        }),
      });

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({ message: 'Unknown error' }))) as Error;
        throw new Error(`GeniusBridge API error: ${errorData.message || response.statusText}`);
      }

      const quote = await response.json();
      return quote as GeniusBridgeQuoteResponse;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      return sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Validates the parameters for a price quote request.
   *
   * @param {IntentPriceParams} params - The parameters to validate.
   *
   * @throws {SdkError} If any of the parameters are invalid or unsupported.
   */
  protected validatePriceParams(params: IntentPriceParams): void {
    const { networkIn, networkOut, tokenIn, tokenOut, amountIn } = params;

    if (networkIn === networkOut) {
      logger.error('Single chain swaps are not supported by GeniusBridge');
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        'Single chain swaps are not supported by GeniusBridge',
      );
    }

    if (!this.chains.includes(networkIn)) {
      logger.error(`Network ${networkIn} not supported by GeniusBridge`);
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `Network ${networkIn} not supported by GeniusBridge`,
      );
    }

    if (!this.chains.includes(networkOut)) {
      logger.error(`Network ${networkOut} not supported by GeniusBridge`);
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `Network ${networkOut} not supported by GeniusBridge`,
      );
    }

    if (amountIn === '0') {
      logger.error('Amount in must be greater than 0');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Amount in must be greater than 0');
    }

    // Validate token addresses based on network type
    if (isSolanaNetwork(networkIn)) {
      try {
        validateSolanaAddress(tokenIn);
      } catch (error) {
        const formattedError = createErrorMessage(error, this.protocol);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, formattedError);
      }
    } else if (isEVMNetwork(networkIn) && !isNative(tokenIn)) {
      try {
        validateAndChecksumEvmAddress(tokenIn);
      } catch (error) {
        const formattedError = createErrorMessage(error, this.protocol);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, formattedError);
      }
    }

    if (isSolanaNetwork(networkOut)) {
      try {
        validateSolanaAddress(tokenOut);
      } catch (error) {
        const formattedError = createErrorMessage(error, this.protocol);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, formattedError);
      }
    } else if (isEVMNetwork(networkOut) && !isNative(tokenOut)) {
      try {
        validateAndChecksumEvmAddress(tokenOut);
      } catch (error) {
        const formattedError = createErrorMessage(error, this.protocol);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, formattedError);
      }
    }
  }

  /**
   * Validates the parameters for a quote request, extending the price parameters validation.
   *
   * @param {IntentQuoteParams} params - The parameters to validate.
   *
   * @throws {SdkError} If any of the parameters are invalid or missing.
   */
  protected validateQuoteParams(params: IntentQuoteParams): void {
    this.validatePriceParams(params);

    if (!params.from) {
      logger.error('From address is required for quote');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'From address is required for quote');
    }

    // Verify 'to' address if provided
    if (params.receiver) {
      if (isSolanaNetwork(params.networkOut)) {
        try {
          validateSolanaAddress(params.receiver);
        } catch (error) {
          const formattedError = createErrorMessage(error, this.protocol);
          throw sdkError(SdkErrorEnum.INVALID_PARAMS, formattedError);
        }
      } else if (isEVMNetwork(params.networkOut)) {
        try {
          validateAndChecksumEvmAddress(params.receiver);
        } catch (error) {
          const formattedError = createErrorMessage(error, this.protocol);
          throw sdkError(SdkErrorEnum.INVALID_PARAMS, formattedError);
        }
      }
    }
  }

  /**
   * Transforms the price parameters to the format expected by the Genius Bridge API.
   *
   * @param {IntentPriceParams} params - The original price parameters.
   *
   * @returns {Object} The transformed parameters ready for the Genius Bridge API, including:
   * - Network IDs for source and destination chains
   * - Token addresses
   * - Amount and slippage
   * - Source address
   * - Sponsorship flag
   */
  protected transformPriceParams(params: IntentPriceParams): IntentPriceParams {
    let { networkIn, networkOut, tokenIn, tokenOut } = params;
    const { amountIn, slippage, from } = params;

    // Handle token address transformation
    if (isEVMNetwork(networkIn) && isNative(tokenIn)) {
      tokenIn = NATIVE_ADDRESS;
    }

    if (isEVMNetwork(networkOut) && isNative(tokenOut)) {
      tokenOut = NATIVE_ADDRESS;
    }

    return {
      networkIn,
      networkOut,
      tokenIn,
      tokenOut,
      amountIn,
      slippage,
      from,
      sponsor: false,
    };
  }

  /**
   * Transforms the quote parameters to the format expected by the Genius Bridge API.
   *
   * @param {IntentQuoteParams} params - The original quote parameters.
   *
   * @returns {Object} The transformed parameters ready for the Genius Bridge API, extending
   * the price parameters with:
   * - Destination address
   * - Authority configuration
   */
  protected transformQuoteParams(params: IntentQuoteParams): {
    networkIn: number;
    networkOut: number;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    slippage: number;
    from: string;
    sponsor: boolean;
    to: string;
    authority: Authority;
  } {
    const transformedPriceParams = this.transformPriceParams(params) as IntentPriceParams;

    return {
      ...transformedPriceParams,
      sponsor: transformedPriceParams.sponsor ?? false,
      to: params.receiver || params.from,
      authority: {
        networkInAddress: params.from,
        networkOutAddress: params.receiver || params.from,
      },
    };
  }
}
