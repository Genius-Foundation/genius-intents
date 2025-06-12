import axios from 'axios';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse, RawProtocolQuoteResponse } from '../../types/quote-response';
import { IntentsSDKConfig } from '../../types/sdk-config';
import { formatAddress } from '../../utils/address';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import {
  ZeroXConfig,
  ZeroXPriceResponse,
  ZeroXQuoteResponse,
  ZeroXSwapQuoteResponse,
} from './zeroX.types';

let logger: ILogger;

export class ZeroXService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.ZEROX;
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
  ];
  public readonly singleChain = true;
  public readonly multiChain = false;
  baseUrl = 'https://api.0x.org/swap/allowance-holder/quote';
  public readonly apiKey: string;

  constructor(config?: IntentsSDKConfig & ZeroXConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }

    logger = LoggerFactory.getLogger();

    if (!config?.zeroXApiKey) {
      logger.error('API key is required for 0x service');
      throw sdkError(SdkErrorEnum.MISSING_INITIALIZATION, 'API key is required for 0x service');
    }
    this.apiKey = config.zeroXApiKey;
    this.baseUrl = config.zeroXBaseUrl || 'https://api.0x.org/swap/allowance-holder/quote';
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['zeroXApiKey'] === 'string' && config['zeroXApiKey'].length > 0;
  }

  /**
   * Unlike other DEX aggregators like KyberSwap, 0x doesn't have a separate price fetch endpoint.
   * Instead, we'll use the quote endpoint to get price information as well.
   */
  public async fetchPrice(
    params: IntentPriceParams,
  ): Promise<Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: ZeroXPriceResponse }> {
    this.validatePriceParams(params);
    params.tokenIn = isNative(params.tokenIn) ? NATIVE_ADDRESS : params.tokenIn;
    logger.debug(`Fetching price from ${this.protocol}`, params);

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
        routerAddress: quoteResponse.protocolResponse.rawResponse.transaction.to,
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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch swap price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch swap price from 0x: ${errorMessage}`,
      );
    }
  }

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

      logger.debug('Successfully received quote info from 0x', {
        buyAmount: zeroXQuoteResponse.buyAmount,
        gasEstimate: zeroXQuoteResponse.transaction.gas,
      });

      if (!zeroXQuoteResponse.buyAmount) {
        logger.error('No output amount received from 0x', undefined, { zeroXQuoteResponse });
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'No output amount received from 0x');
      }

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

      return {
        protocol: this.protocol,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: zeroXQuoteResponse.buyAmount,
        from: params.from,
        receiver: params.receiver || params.from,
        executionPayload: {
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
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch swap quote from 0x: ${errorMessage}`,
      );
    }
  }

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
    url.searchParams.append('excludedSources', 'Ox_RFQ'); // Common exclusion
    url.searchParams.append('slippageBps', (slippage * 100).toString()); // Convert decimal to basis points

    return url.toString();
  }

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

  protected isZeroXPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is ZeroXPriceResponse {
    return 'routeSummary' in response && 'routerAddress' in response;
  }

  protected isZeroXQuoteResponse(
    response: RawProtocolQuoteResponse,
  ): response is ZeroXQuoteResponse {
    return 'amountIn' in response && 'amountOut' in response && 'routerAddress' in response;
  }
}
