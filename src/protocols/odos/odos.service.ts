import axios from 'axios';

import {
  OdosPriceResponse,
  OdosAssembleRequestBody,
  OdosQuoteResponse,
  OdosQuoteRequestBody,
} from './odos.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { formatAddress } from '../../utils/address';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { ZERO_ADDRESS } from '../../utils/constants';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';

let logger: ILogger;
/**
 * The `OdosService` class implements the IIntentProtocol interface for token swaps
 * using the Odos aggregator. It provides functionality for fetching price quotes
 * and generating transaction data for token swaps on various EVM-compatible blockchains.
 *
 * @implements {IIntentProtocol}
 */
export class OdosService implements IIntentProtocol {
  /**
   * RPC URLs for each supported blockchain network.
   */
  protected readonly rpcUrls: Record<number, string> = {};

  /**
   * The protocol identifier for Odos.
   */
  public readonly protocol = ProtocolEnum.ODOS;

  /**
   * Flag to determine whether approval transactions should be included.
   */
  public includeApprovals?: boolean | undefined = false;

  /**
   * The list of blockchain networks supported by the Odos service.
   */
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
    ChainIdEnum.SONIC,
  ];

  /**
   * The base URL for the Odos API.
   */
  public baseUrl = 'https://api.odos.xyz';

  /**
   * Indicates that the service operates only on a single blockchain.
   */
  public readonly singleChain = true;

  /**
   * Indicates that the service does not support cross-chain operations.
   */
  public readonly multiChain = false;

  /**
   * The endpoint for token price requests.
   */
  public readonly priceEndpoint = '/pricing/token';

  /**
   * The endpoint for quote requests.
   */
  public readonly quoteEndpoint = '/sor/quote/v2';

  /**
   * The endpoint for transaction assembly.
   */
  public readonly assemblyEndpoint = '/sor/assemble';

  /**
   * The complete URL for quote requests.
   */
  public readonly quoteBaseUrl = this.baseUrl + this.quoteEndpoint;

  /**
   * The complete URL for price requests.
   */
  public readonly priceBaseUrl = this.baseUrl + this.priceEndpoint;

  /**
   * The complete URL for assembly requests.
   */
  public readonly assemblyBaseUrl = this.baseUrl + this.assemblyEndpoint;

  /**
   * Creates a new instance of the OdosService.
   *
   * @param {SDKConfig} config - Configuration parameters for the service.
   */
  constructor(config?: GeniusIntentsSDKConfig) {
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
    this.includeApprovals = config?.includeApprovals;
  }

  /**
   * Checks if the provided configuration object matches the expected type.
   *
   * @typeParam T - The expected configuration type, where all values are strings.
   * @param _config - The configuration object to validate.
   * @returns `true` if the configuration is considered correct. For Odos, all config fields are optional,
   * so this always returns `true`.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // Odos has no required config fields, all are optional
    return true;
  }

  /**
   * Fetches a price quote for a token swap from the Odos API.
   *
   * @param {IntentPriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: OdosPriceResponse }>}
   * A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - Gas estimation for the transaction.
   * - The raw response from the Odos API.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the price.
   */
  public async fetchPrice(
    params: IntentPriceParams,
  ): Promise<Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: OdosPriceResponse }> {
    this.validatePriceParams(params);

    const requestBody = this.priceParamsToRequestBody(params);
    logger.debug('Generated ODOS price request body', requestBody);

    try {
      logger.debug(`Making request to ODOS API: ${this.quoteBaseUrl}`);
      const response = await axios.post<OdosPriceResponse>(this.quoteBaseUrl, requestBody);
      const odosPriceResponse: OdosPriceResponse = response.data;

      if (
        !odosPriceResponse ||
        !odosPriceResponse.outAmounts ||
        odosPriceResponse.outAmounts.length === 0
      ) {
        logger.error('Invalid response received from ODOS API', undefined, { odosPriceResponse });
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'Invalid response received from ODOS API');
      }

      logger.debug('Successfully received price info from ODOS', {
        amountOut: odosPriceResponse.outAmounts[0],
        gasEstimate: odosPriceResponse.gasEstimate.toString(),
      });

      const amountOut = odosPriceResponse.outAmounts[0];

      if (!amountOut) {
        logger.error('No output amounts received from ODOS', undefined, { odosPriceResponse });
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'No output amounts received from ODOS');
      }

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut,
        estimatedGas: odosPriceResponse.gasEstimate.toString(),
        protocolResponse: odosPriceResponse,
        slippage: params.slippage,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);
      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the Odos API and builds the transaction data
   * needed to execute the swap.
   *
   * @param {IntentQuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse & { protocolResponse: OdosQuoteResponse }>}
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
  ): Promise<QuoteResponse & { protocolResponse: OdosQuoteResponse }> {
    logger.info(`Fetching swap quote for address: ${params.from}`);

    this.validatePriceParams(params);
    const { from, receiver, tokenIn, amountIn, networkIn, networkOut } = params;
    let { priceResponse } = params;

    if (!priceResponse || !this.isOdosPriceResponse(priceResponse.protocolResponse)) {
      logger.info('No price response received, fetching price...');
      priceResponse = await this.fetchPrice(params);
    }

    if (!this.isOdosPriceResponse(priceResponse.protocolResponse)) {
      logger.error('Invalid price response received', undefined, { priceResponse });
      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'Invalid price response received');
    }

    const assembleRequestBody: OdosAssembleRequestBody = {
      userAddr: formatAddress(from),
      pathId: priceResponse.protocolResponse.pathId,
      simulate: false,
      ...(receiver && { receiver: formatAddress(receiver) }),
    };

    logger.debug('Generated ODOS assemble request body', assembleRequestBody);

    try {
      logger.debug(`Making request to ODOS assembly API: ${this.assemblyBaseUrl}`);
      const response = await axios.post<OdosQuoteResponse>(
        this.assemblyBaseUrl,
        assembleRequestBody,
      );
      const odosQuoteResponse: OdosQuoteResponse = response.data;

      logger.debug('Successfully received quote info from ODOS');

      const tokenOut = odosQuoteResponse.outputTokens[0];

      if (!tokenOut || !tokenOut.amount) {
        logger.error('No output token amount received from ODOS', undefined, { odosQuoteResponse });
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'No output token amount received from ODOS');
      }

      return {
        protocol: this.protocol,
        tokenIn: tokenIn,
        tokenOut: tokenOut.tokenAddress,
        amountIn: amountIn,
        amountOut: tokenOut.amount,
        from,
        receiver,
        evmExecutionPayload: {
          transactionData: {
            data: odosQuoteResponse.transaction.data,
            to: odosQuoteResponse.transaction.to,
            value: odosQuoteResponse.transaction.value,
            gasEstimate: odosQuoteResponse.gasEstimate.toString(),
            gasLimit: (odosQuoteResponse.gasEstimate * 1.1).toString(), // 10% buffer
          },
          approval: {
            token: tokenIn,
            amount: amountIn,
            spender: odosQuoteResponse.transaction.to,
          },
        },
        slippage: priceResponse.slippage,
        networkIn,
        networkOut,
        protocolResponse: odosQuoteResponse,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const formattedError = createErrorMessage(error, this.protocol);
      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError, {
        cause: error,
      });
    }
  }

  /**
   * Transforms the price parameters to the format expected by the Odos API.
   *
   * @param {IntentPriceParams} params - The original price parameters.
   *
   * @returns {OdosQuoteRequestBody} The transformed parameters ready for the Odos API.
   */
  protected priceParamsToRequestBody(params: IntentPriceParams): OdosQuoteRequestBody {
    const { tokenIn, tokenOut, amountIn, slippage, networkIn, from } = params;

    logger.debug('Converting price params to ODOS request body', { params });

    const requestBody = {
      chainId: networkIn,
      inputTokens: [
        {
          tokenAddress: isNative(tokenIn) ? ZERO_ADDRESS : formatAddress(tokenIn),
          amount: amountIn.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: isNative(tokenOut) ? ZERO_ADDRESS : formatAddress(tokenOut),
          proportion: 1,
        },
      ],
      referralCode: 0,
      disableRFQs: true,
      compact: true,
      slippageLimitPercent: (slippage || 0.3).toString(),
      userAddr: formatAddress(from),
      simple: true,
    };

    logger.debug('Generated ODOS request body', requestBody);
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
   * Type guard to check if a response is a valid Odos price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid Odos price response.
   */
  protected isOdosPriceResponse(response: RawProtocolPriceResponse): response is OdosPriceResponse {
    return 'pathId' in response;
  }
}
