import axios from 'axios';

import {
  KyberswapConfig,
  KyberswapPriceRequestBody,
  KyberswapPriceResponse,
  KyberswapQuoteRequestBody,
  KyberswapQuoteResponse,
} from './kyberswap.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { formatAddress } from '../../utils/address';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';

let logger: ILogger;
/**
 * The `KyberswapService` class implements the IIntentProtocol interface for token swaps
 * using the KyberSwap aggregator. It provides functionality for fetching price quotes
 * and generating transaction data for token swaps on various EVM-compatible blockchains.
 *
 * @implements {IIntentProtocol}
 */
export class KyberswapService implements IIntentProtocol {
  /**
   * RPC URLs for each supported blockchain network.
   */
  protected readonly rpcUrls: Record<number, string> = {};

  /**
   * Flag to determine whether approval transactions should be included.
   */
  public includeApprovals: boolean | undefined = false;

  /**
   * The protocol identifier for KyberSwap.
   */
  public readonly protocol = ProtocolEnum.KYBERSWAP;

  /**
   * The list of blockchain networks supported by the KyberSwap service.
   */
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
  ];

  /**
   * Indicates that the service operates only on a single blockchain.
   */
  public readonly singleChain = true;

  /**
   * Indicates that the service does not support cross-chain operations.
   */
  public readonly multiChain = false;

  /**
   * The base URL for the KyberSwap API.
   */
  baseUrl = 'https://aggregator-api.kyberswap.com';

  /**
   * The endpoint for price quote requests.
   */
  public readonly priceEndpoint = '/api/v1/routes';

  /**
   * The endpoint for transaction quote requests.
   */
  public readonly quoteEndpoint = '/api/v1/route/build';

  /**
   * The client ID for KyberSwap API requests.
   */
  public readonly clientId: string = '';

  /**
   * Creates a new instance of the KyberswapService.
   *
   * @param {SDKConfig & KyberswapConfig} config - Configuration parameters for the service.
   */
  constructor(config?: GeniusIntentsSDKConfig & KyberswapConfig) {
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
    if (config?.clientId) {
      this.clientId = config.clientId;
    }
    if (config?.privateUrl) {
      this.baseUrl = config.privateUrl;
    }

    this.includeApprovals = config?.includeApprovals;
  }

  /**
   * Checks if the provided configuration object has a valid `clientId` property.
   *
   * @typeParam T - The expected shape of the configuration object, extending a record of string keys and string values.
   * @param config - The configuration object to validate.
   * @returns `true` if the configuration contains a non-empty string `clientId` property, otherwise `false`.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['clientId'] === 'string' && config['clientId'].length > 0;
  }

  /**
   * Fetches a price quote for a token swap from the KyberSwap API.
   *
   * @param {IntentPriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: KyberswapPriceResponse }>}
   * A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - Gas estimation for the transaction.
   * - The raw response from the KyberSwap API.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the price.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<
    Omit<PriceResponse, 'protocolResponse'> & {
      protocolResponse: KyberswapPriceResponse;
    }
  > {
    this.validatePriceParams(params);

    const requestBody = this.priceParamsToRequestBody(params);
    logger.debug('Generated KyberSwap price request body', requestBody);

    try {
      const chainName = this._chainIdToName(params.networkIn);
      const url = new URL(`${this.baseUrl}/${chainName}${this.priceEndpoint}`);

      // Add query parameters
      url.searchParams.append('source', this.clientId);
      Object.entries(requestBody).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value.toString());
        }
      });

      logger.debug(`Making request to KyberSwap API: ${url.toString()}`);
      const response = await axios.get<{ data: KyberswapPriceResponse }>(url.toString(), {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'x-client-id': this.clientId,
        },
      });

      const kyberswapPriceResponse = response.data.data;

      if (!kyberswapPriceResponse || !kyberswapPriceResponse.routeSummary) {
        logger.error('Invalid response received from KyberSwap API', undefined, {
          kyberswapPriceResponse,
        });
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          'Invalid response received from KyberSwap API',
        );
      }

      logger.debug('Successfully received price info from KyberSwap', {
        amountOut: kyberswapPriceResponse.routeSummary.amountOut,
        gasEstimate: kyberswapPriceResponse.routeSummary.gas,
      });

      const amountOut = kyberswapPriceResponse.routeSummary.amountOut;

      if (!amountOut) {
        logger.error('No output amount received from KyberSwap', undefined, {
          kyberswapPriceResponse,
        });
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'No output amount received from KyberSwap');
      }

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut,
        estimatedGas: kyberswapPriceResponse.routeSummary.gas,
        protocolResponse: kyberswapPriceResponse,
        slippage: params.slippage,
      };
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the KyberSwap API and builds the transaction data
   * needed to execute the swap.
   *
   * @param {QuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse & { protocolResponse: KyberswapQuoteResponse }>}
   * A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   * - Gas estimates for the transaction.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the quote.
   */
  public async fetchQuote(
    params: IntentQuoteParams,
  ): Promise<QuoteResponse & { protocolResponse: KyberswapQuoteResponse }> {
    logger.info(`Fetching swap quote for address: ${params.from}`);
    params.tokenIn = isNative(params.tokenIn) ? NATIVE_ADDRESS : params.tokenIn;
    params.tokenOut = isNative(params.tokenOut) ? NATIVE_ADDRESS : params.tokenOut;
    this.validatePriceParams(params);
    const { from, receiver, tokenIn, amountIn, networkIn, networkOut } = params;
    let { priceResponse } = params;

    if (!priceResponse || !this.isKyberswapPriceResponse(priceResponse.protocolResponse)) {
      logger.info('No price response received, fetching price...');
      priceResponse = await this.fetchPrice(params);
    }

    if (!this.isKyberswapPriceResponse(priceResponse.protocolResponse)) {
      logger.error('Invalid price response received', undefined, {
        priceResponse,
      });
      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'Invalid price response received');
    }

    const quoteRequestBody: KyberswapQuoteRequestBody = {
      source: this.clientId,
      routeSummary: priceResponse.protocolResponse.routeSummary,
      sender: formatAddress(from),
      slippageTolerance: params.slippage * 100, // Convert to basis points
      recipient: formatAddress(receiver || from),
      enableGasEstimation: false,
    };

    logger.debug('Generated KyberSwap quote request body', quoteRequestBody);

    try {
      const chainName = this._chainIdToName(networkIn);
      const url = `${this.baseUrl}/${chainName}${this.quoteEndpoint}`;

      logger.debug(`Making request to KyberSwap quote API: ${url}`);
      const response = await axios.post<{ data: KyberswapQuoteResponse }>(url, quoteRequestBody, {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'x-client-id': this.clientId,
        },
      });

      const kyberswapQuoteResponse = response.data.data;

      logger.debug('Successfully received quote info from KyberSwap');

      if (!kyberswapQuoteResponse || !kyberswapQuoteResponse.amountOut) {
        logger.error('No output amount received from KyberSwap', undefined, {
          kyberswapQuoteResponse,
        });
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'No output amount received from KyberSwap');
      }

      const gasEstimate = kyberswapQuoteResponse.gas;
      const gasLimit = Math.floor(Number(gasEstimate) * 1.1).toString(); // 10% buffer

      const quote = {
        protocol: this.protocol,
        tokenIn: tokenIn,
        tokenOut: priceResponse.protocolResponse.routeSummary.tokenOut,
        amountIn: amountIn,
        amountOut: kyberswapQuoteResponse.amountOut,
        from,
        receiver: receiver || from,
        executionPayload: {
          transactionData: {
            data: kyberswapQuoteResponse.data,
            to: kyberswapQuoteResponse.routerAddress,
            value: isNative(tokenIn) ? amountIn : '0',
            gasEstimate,
            gasLimit,
          },
          approval: {
            token: tokenIn,
            amount: amountIn,
            spender: kyberswapQuoteResponse.routerAddress,
          },
        },
        slippage: priceResponse.slippage,
        networkIn,
        networkOut,
        protocolResponse: kyberswapQuoteResponse,
      };

      return quote;
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Transforms the price parameters to the format expected by the KyberSwap API.
   *
   * @param {IntentPriceParams} params - The original price parameters.
   *
   * @returns {KyberswapPriceRequestBody} The transformed parameters ready for the KyberSwap API.
   */
  protected priceParamsToRequestBody(params: IntentPriceParams): KyberswapPriceRequestBody {
    const { tokenIn, tokenOut, amountIn, slippage, from } = params;

    logger.debug('Converting price params to KyberSwap request body', {
      params,
    });

    const requestBody: KyberswapPriceRequestBody = {
      tokenIn: isNative(tokenIn) ? NATIVE_ADDRESS : tokenIn,
      tokenOut: isNative(tokenOut) ? NATIVE_ADDRESS : tokenOut,
      amountIn: amountIn.toString(),
      to: formatAddress(from),
      saveGas: false,
      gasInclude: true,
      slippageTolerance: slippage * 100, // Convert to basis points
      source: this.clientId,
    };

    logger.debug('Generated KyberSwap request body', requestBody);
    return requestBody;
  }

  /**
   * Validates the parameters for a price quote request.
   *
   * @param {IntentPriceParams} params - The parameters to validate.
   *
   * @throws {SdkError} If any of the parameters are invalid or unsupported.
   */
  protected validatePriceParams(params: IntentPriceParams): void {
    const { networkIn, networkOut } = params;
    logger.debug('Validating price params');

    if (!this.multiChain && networkIn !== networkOut) {
      logger.error('Multi-chain swaps not supported');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Multi-chain swaps not supported');
    }
    if (!this.singleChain && networkIn === networkOut) {
      logger.error('Single-chain swaps not supported');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Single-chain swaps not supported');
    }
    if (!this.chains.includes(networkIn)) {
      logger.error(`Network ${networkIn} not supported`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Network ${networkIn} not supported`);
    }
    if (!this.chains.includes(networkOut)) {
      logger.error(`Network ${networkOut} not supported`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Network ${networkOut} not supported`);
    }
  }

  /**
   * Type guard to check if a response is a valid KyberSwap price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid KyberSwap price response.
   */
  protected isKyberswapPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is KyberswapPriceResponse {
    return 'routeSummary' in response;
  }

  /**
   * Converts a chain ID to the corresponding network name used by the KyberSwap API.
   *
   * @param {ChainIdEnum} chainId - The chain ID to convert.
   *
   * @returns {string} The network name for the given chain ID.
   *
   * @throws {Error} If the chain ID is not supported.
   */
  private _chainIdToName = (chainId: ChainIdEnum): string => {
    const chainMap: Record<number, string> = {
      [ChainIdEnum.ETHEREUM]: 'ethereum',
      [ChainIdEnum.BSC]: 'bsc',
      [ChainIdEnum.POLYGON]: 'polygon',
      [ChainIdEnum.AVALANCHE]: 'avalanche',
      [ChainIdEnum.ARBITRUM]: 'arbitrum',
      [ChainIdEnum.OPTIMISM]: 'optimism',
      [ChainIdEnum.BASE]: 'base',
      [ChainIdEnum.SONIC]: 'sonic',
    };

    const name = chainMap[chainId];
    if (!name) {
      throw new Error(`Unsupported network: ${chainId}`);
    }
    return name;
  };
}
