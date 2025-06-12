import axios from 'axios';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { IntentsSDKConfig } from '../../types/sdk-config';
import { formatAddress } from '../../utils/address';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import {
  KyberswapConfig,
  KyberswapPriceRequestBody,
  KyberswapPriceResponse,
  KyberswapQuoteRequestBody,
  KyberswapQuoteResponse,
} from './kyberswap.types';
import { createErrorMessage } from '../../utils/create-error-message';
import { chainIdToName } from '../../utils/chain-id-name';

let logger: ILogger;
export class KyberswapService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.KYBERSWAP;
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
  public readonly singleChain = true;
  public readonly multiChain = false;
  public readonly priceEndpoint = '/api/v1/routes';
  public readonly quoteEndpoint = '/api/v1/route/build';

  public baseUrl: string;
  public clientId: string;

  constructor(config: IntentsSDKConfig & KyberswapConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }

    logger = LoggerFactory.getLogger();
    this.baseUrl = config?.kyberswapPrivateUrl || 'https://aggregator-api.kyberswap.com';
    this.clientId = config.kyberswapClientId;
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['clientId'] === 'string' && config['clientId'].length > 0;
  }

  public async fetchPrice(
    params: IntentPriceParams,
  ): Promise<
    Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: KyberswapPriceResponse }
  > {
    this.validatePriceParams(params);

    const requestBody = this.priceParamsToRequestBody(params);
    logger.debug('Generated KyberSwap price request body', requestBody);

    try {
      const chainName = chainIdToName(params.networkIn);
      const url = new URL(`${this.baseUrl}/${chainName}${this.priceEndpoint}`);

      // Add query parameters
      url.searchParams.append('source', this.clientId);
      Object.entries(requestBody).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value.toString());
        }
      });

      logger.debug(`Making request to KyberSwap API: ${url.toString()}`);
      const headers: Record<string, string> = {};
      headers['x-client-id'] = this.clientId;

      const response = await axios.get<{ data: KyberswapPriceResponse }>(url.toString(), {
        headers,
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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch swap price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch swap price from KyberSwap: ${errorMessage}`,
      );
    }
  }

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
      logger.error('Invalid price response received', undefined, { priceResponse });
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
      const chainName = chainIdToName(networkIn);
      const url = `${this.baseUrl}/${chainName}${this.quoteEndpoint}`;

      logger.debug(`Making request to KyberSwap quote API: ${url}`);
      const headers: Record<string, string> = {};
      headers['x-client-id'] = this.clientId;
      const response = await axios.post<{ data: KyberswapQuoteResponse }>(url, quoteRequestBody, {
        headers,
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

      return {
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
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch swap quote from KyberSwap: ${errorMessage}`,
      );
    }
  }

  protected priceParamsToRequestBody(params: IntentPriceParams): KyberswapPriceRequestBody {
    const { tokenIn, tokenOut, amountIn, slippage, from } = params;

    logger.debug('Converting price params to KyberSwap request body', { params });

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

  protected isKyberswapPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is KyberswapPriceResponse {
    return 'routeSummary' in response;
  }
}
