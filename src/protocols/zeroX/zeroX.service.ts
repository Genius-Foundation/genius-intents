import axios from 'axios';

import {
  ZeroXConfig,
  ZeroXPriceResponse,
  ZeroXQuoteResponse,
  ZeroXSwapQuoteResponse,
} from './zeroX.types';
import { EvmTransactionData } from '../../types/evm-transaction-data';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { QuoteResponse, RawProtocolQuoteResponse } from '../../types/quote-response';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { createErrorMessage } from '../../utils/create-error-message';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { formatAddress } from '../../utils/address';
import { sdkError } from '../../utils/throw-error';
import { isNative } from '../../utils/is-native';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';

let logger: ILogger;

/**
 * The `ZeroXService` class implements the IIntentProtocol interface for token swaps
 * using the 0x Protocol aggregator. It provides functionality for fetching price quotes
 * and generating transaction data for token swaps on various EVM-compatible blockchains.
 *
 * @implements {IIntentProtocol}
 */
export class ZeroXService implements IIntentProtocol {
  /**
   * RPC URLs for each supported blockchain network.
   */
  protected readonly rpcUrls: Record<number, string> = {};

  /**
   * Flag to determine whether approval transactions should be included.
   */
  public includeApprovals: boolean | undefined = false;

  /**
   * The protocol identifier for 0x Protocol.
   */
  public readonly protocol = ProtocolEnum.ZEROX;

  /**
   * The list of blockchain networks supported by the 0x service.
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
   * The base URL for the 0x API.
   */
  baseUrl = 'https://api.0x.org/swap/allowance-holder/quote';

  /**
   * The API key for authenticating requests to the 0x API.
   */
  public readonly apiKey: string;

  /**
   * Creates a new instance of the ZeroXService.
   *
   * @param {SDKConfig & ZeroXConfig} config - Configuration parameters for the service.
   *
   * @throws {SdkError} If no API key is provided for the 0x API.
   */
  constructor(config?: GeniusIntentsSDKConfig & ZeroXConfig) {
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
    if (config?.apiKey) {
      this.apiKey = config.apiKey;
    }
    if (config?.baseUrl) {
      this.baseUrl = config.baseUrl;
    }
    if (!config?.apiKey) {
      logger.error('API key is required for 0x service');
      throw sdkError(SdkErrorEnum.MISSING_INITIALIZATION, 'API key is required for 0x service');
    }
    this.apiKey = config.apiKey;
    this.includeApprovals = config?.includeApprovals;
  }

  /**
   * Checks if the provided configuration object has a valid `zeroXApiKey` property.
   *
   * @typeParam T - The expected shape of the configuration object, extending an object with string values.
   * @param config - The configuration object to validate.
   * @returns `true` if `config` contains a non-empty string `zeroXApiKey` property, otherwise `false`.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['zeroXApiKey'] === 'string' && config['zeroXApiKey'].length > 0;
  }

  /**
   * Fetches a price quote for a token swap from the 0x API.
   * Unlike other DEX aggregators, 0x doesn't have a separate price fetch endpoint.
   * Instead, the quote endpoint is used to get price information as well.
   *
   * @param {PriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: ZeroXPriceResponse }>}
   * A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - Gas estimation for the transaction.
   * - The router address for the swap.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If there's an error fetching the price from 0x.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<
    Omit<PriceResponse, 'protocolResponse'> & {
      protocolResponse: ZeroXPriceResponse;
    }
  > {
    this.validatePriceParams(params);
    params.tokenIn = isNative(params.tokenIn) ? NATIVE_ADDRESS : params.tokenIn;
    params.tokenOut = isNative(params.tokenOut) ? NATIVE_ADDRESS : params.tokenOut;

    logger.debug(`Fetching price from ${this.protocol}`);

    // Since 0x doesn't have a separate price endpoint, we'll get a quote and then format it as a price response
    try {
      // Create a QuoteParams object from the PriceParams
      const quoteParams: IntentQuoteParams = {
        ...params,
        from: params.from,
        receiver: params.from, // Set receiver to sender for price check
      };

      // Fetch the quote which contains price information
      const quoteResponse = await this.fetchQuote(quoteParams);

      const executionPayload = quoteResponse?.evmExecutionPayload;

      if (!executionPayload) {
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, `0x: Quote not found`);
      }

      const transactionData = executionPayload.transactionData as EvmTransactionData;

      // Convert the quote response to a price response format
      const zeroXPriceResponse: ZeroXPriceResponse = {
        routeSummary: {
          tokenIn: params.tokenIn,
          amountIn: params.amountIn,
          tokenOut: params.tokenOut,
          amountOut: quoteResponse.amountOut,
          gas: quoteResponse.estimatedGas || '0',
          route: [], // 0x doesn't provide route information in the same format as other DEXes
        },
        routerAddress: transactionData.to,
      };

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: quoteResponse.amountOut,
        estimatedGas: quoteResponse.estimatedGas,
        protocolResponse: zeroXPriceResponse,
        slippage: params.slippage,
      };
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the 0x API and builds the transaction data
   * needed to execute the swap.
   *
   * @param {QuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse & { protocolResponse: ZeroXQuoteResponse }>}
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
  ): Promise<QuoteResponse & { protocolResponse: ZeroXQuoteResponse }> {
    logger.info(`Fetching swap quote for address: ${params.from}`);
    params.tokenIn = isNative(params.tokenIn) ? NATIVE_ADDRESS : params.tokenIn;
    params.tokenOut = isNative(params.tokenOut) ? NATIVE_ADDRESS : params.tokenOut;
    this.validatePriceParams(params);

    try {
      const requestUrl = this.buildRequestUrl(params);
      logger.debug(`Making request to 0x API: ${requestUrl}`);

      const response = await axios.get<ZeroXSwapQuoteResponse>(requestUrl, {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          '0x-api-key': this.apiKey,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          '0x-version': 'v2',
        },
      });

      const zeroXQuoteResponse = response.data;

      if (zeroXQuoteResponse?.liquidityAvailable === false) {
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, `0x: Liquidity not found or available`);
      }

      if (
        zeroXQuoteResponse.buyToken.toLowerCase() !== params.tokenOut.toLowerCase() ||
        zeroXQuoteResponse.sellToken.toLowerCase() !== params.tokenIn.toLowerCase()
      ) {
        logger.error('0x pair mismatch', undefined, {
          requested: { sell: params.tokenIn, buy: params.tokenOut },
          received: {
            sell: zeroXQuoteResponse.sellToken,
            buy: zeroXQuoteResponse.buyToken,
          },
        });
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'Pair mismatch from 0x response');
      }

      if (!zeroXQuoteResponse.buyAmount) {
        logger.error('No output amount received from 0x', undefined, {
          zeroXQuoteResponse,
        });
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'No output amount received from 0x');
      }

      logger.debug('Successfully received quote info from 0x', {
        buyAmount: zeroXQuoteResponse.buyAmount,
        gasEstimate: zeroXQuoteResponse.transaction.gas,
      });

      const gasEstimate = zeroXQuoteResponse.transaction.gas;
      const gasLimit = Math.floor(Number(gasEstimate) * 1.1).toString(); // 10% buffer

      // Format the response to match our expected QuoteResponse structure
      const formattedQuoteResponse: ZeroXQuoteResponse = {
        amountIn: zeroXQuoteResponse.sellAmount,
        amountOut: zeroXQuoteResponse.buyAmount,
        gas: zeroXQuoteResponse.transaction.gas,
        data: zeroXQuoteResponse.transaction.data,
        routerAddress: zeroXQuoteResponse.transaction.to,
        rawResponse: zeroXQuoteResponse,
      };

      const quoteResponse: QuoteResponse & { protocolResponse: ZeroXQuoteResponse } = {
        protocol: this.protocol,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: zeroXQuoteResponse.buyAmount,
        from: params.from,
        receiver: params.receiver || params.from,
        evmExecutionPayload: {
          transactionData: {
            data: zeroXQuoteResponse.transaction.data,
            to: zeroXQuoteResponse.transaction.to,
            value: isNative(params.tokenIn) ? params.amountIn : '0',
            gasEstimate,
            gasLimit,
          },
          approval: {
            token: params.tokenIn,
            amount: params.amountIn,
            spender: zeroXQuoteResponse.transaction.to,
          },
        },
        slippage: params.slippage,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        estimatedGas: gasEstimate,
        protocolResponse: formattedQuoteResponse,
      };

      return quoteResponse;
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Builds the request URL for the 0x API with query parameters.
   *
   * @param {QuoteParams} params - The parameters to include in the URL.
   *
   * @returns {string} The fully formed URL string for the 0x API request.
   */
  protected buildRequestUrl(params: IntentQuoteParams): string {
    const { tokenIn, tokenOut, amountIn, slippage, from, networkIn } = params;

    const sellToken = tokenIn;
    const buyToken = tokenOut;

    // Create URL with query parameters
    const url = new URL(this.baseUrl);
    url.searchParams.append('chainId', networkIn.toString());
    url.searchParams.append('sellToken', sellToken);
    url.searchParams.append('buyToken', buyToken);
    url.searchParams.append('sellAmount', amountIn);
    url.searchParams.append('taker', formatAddress(from));
    url.searchParams.append('excludedSources', '0x_RFQ'); // Common exclusion
    url.searchParams.append('slippageBps', (slippage * 100).toString()); // Convert decimal to basis points

    return url.toString();
  }

  /**
   * Validates the parameters for a price quote request.
   *
   * @param {PriceParams} params - The parameters to validate.
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
   * Type guard to check if a response is a valid 0x price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid 0x price response.
   */
  protected isZeroXPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is ZeroXPriceResponse {
    return 'routeSummary' in response && 'routerAddress' in response;
  }

  /**
   * Type guard to check if a response is a valid 0x quote response.
   *
   * @param {RawProtocolQuoteResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid 0x quote response.
   */
  protected isZeroXQuoteResponse(
    response: RawProtocolQuoteResponse,
  ): response is ZeroXQuoteResponse {
    return 'amountIn' in response && 'amountOut' in response && 'routerAddress' in response;
  }
}
