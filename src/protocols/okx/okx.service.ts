import axios from 'axios';
import * as crypto from 'crypto';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { IntentsSDKConfig } from '../../types/sdk-config';
import { formatAddress } from '../../utils/address';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { ZERO_ADDRESS } from '../../utils/constants';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import {
  OKXConfig,
  OKXCredentials,
  OkxPriceRequestBody,
  OkxPriceResponse,
  OkxQueryParams,
  OkxQuoteRequestBody,
  OkxQuoteResponse,
} from './okx.types';
import { createErrorMessage } from '../../utils/create-error-message';

let logger: ILogger;
export class OkxService implements IIntentProtocol {
  protected readonly okxCredentials: OKXCredentials = {
    apiKey: '',
    secretKey: '',
    passphrase: '',
    projectId: '',
  };
  public readonly protocol = ProtocolEnum.OKX;
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
  public readonly baseUrl: string;

  public readonly priceEndpoint: string = '/api/v5/dex/aggregator/quote';
  public readonly quoteEndpoint: string = '/api/v5/dex/aggregator/swap';

  constructor(config: IntentsSDKConfig & OKXConfig) {
    const { okxApiKey, okxSecretKey, okxPassphrase, okxProjectId } = config;
    if (!okxSecretKey || !okxApiKey || !okxPassphrase || !okxProjectId) {
      throw sdkError(
        SdkErrorEnum.MISSING_INITIALIZATION,
        'Missing OKX Secret Key || Apikey || Passphrase || ProjectId',
      );
    }
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();
    this.baseUrl = config?.okxPrivateUrl || 'https://www.okx.com';

    this.okxCredentials = {
      apiKey: okxApiKey,
      secretKey: okxSecretKey,
      passphrase: okxPassphrase,
      projectId: okxProjectId,
    };
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return (
      !!config['okxApiKey'] &&
      !!config['okxSecretKey'] &&
      !!config['okxPassphrase'] &&
      !!config['okxProjectId']
    );
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    this.validatePriceParams(params);

    const requestBody = this.priceParamsToRequestBody(params);
    logger.debug('Generated OKX price request body', requestBody);

    try {
      const priceUrlParams = new URLSearchParams(requestBody as unknown as Record<string, string>);
      const { signature, timestamp } = this.calculateSignature(
        'GET',
        `${this.priceEndpoint}?${priceUrlParams}`,
      );

      const url = `${this.baseUrl}${this.priceEndpoint}?${priceUrlParams.toString()}`;
      logger.debug(`Making request to OKX API: ${url}`);

      const headers: Record<string, string> = {};
      headers['OK-ACCESS-KEY'] = this.okxCredentials.apiKey || '';
      headers['OK-ACCESS-SIGN'] = signature;
      headers['OK-ACCESS-TIMESTAMP'] = timestamp;
      headers['OK-ACCESS-PASSPHRASE'] = this.okxCredentials.passphrase || '';
      headers['OK-ACCESS-PROJECT'] = this.okxCredentials.projectId || '';

      const response = await axios.get<OkxPriceResponse>(url, { headers });

      const okxPriceResponse = response.data;

      if (
        !okxPriceResponse ||
        !okxPriceResponse.data ||
        okxPriceResponse.data.length === 0 ||
        !okxPriceResponse?.data?.[0]?.toTokenAmount
      ) {
        logger.error('Invalid response received from OKX API', undefined, { okxPriceResponse });
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'Invalid response received from OKX API');
      }

      logger.debug('Successfully received price info from OKX', {
        amountOut: okxPriceResponse.data[0].toTokenAmount,
        gasEstimate: okxPriceResponse.data[0].estimateGasFee,
      });

      const amountOut = okxPriceResponse.data[0].toTokenAmount;

      if (!amountOut) {
        logger.error('No output amount received from OKX', undefined, { okxPriceResponse });
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'No output amount received from OKX');
      }

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut,
        estimatedGas: okxPriceResponse?.data?.[0].estimateGasFee,
        protocolResponse: okxPriceResponse,
        slippage: params.slippage,
      };
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch swap price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch swap price from OKX: ${errorMessage}`,
      );
    }
  }

  public async fetchQuote(
    params: IntentQuoteParams,
  ): Promise<QuoteResponse & { protocolResponse: OkxQuoteResponse }> {
    logger.info(`Fetching swap quote for address: ${params.from}`);
    this.validatePriceParams(params);
    const { from, receiver, tokenIn, tokenOut, amountIn, networkIn, networkOut } = params;
    const quoteRequestBody: OkxQuoteRequestBody = {
      amount: amountIn.toString(),
      chainId: networkIn.toString(),
      fromTokenAddress: tokenIn,
      toTokenAddress: tokenOut,
      userWalletAddress: formatAddress(from),
      slippage: params.slippage >= 1 ? params.slippage / 100 : params.slippage,
      swapReceiverAddress: formatAddress(receiver || from),
    };

    logger.debug('Generated OKX quote request body', quoteRequestBody);

    try {
      const quoteUrlParams = new URLSearchParams(
        quoteRequestBody as unknown as Record<string, string>,
      );
      const { signature, timestamp } = this.calculateSignature(
        'GET',
        `${this.quoteEndpoint}?${quoteUrlParams}`,
      );

      const url = `${this.baseUrl}${this.quoteEndpoint}?${quoteUrlParams.toString()}`;
      logger.debug(`Making request to OKX quote API: ${url}`);

      const headers: Record<string, string> = {};
      headers['OK-ACCESS-KEY'] = this.okxCredentials.apiKey || '';
      headers['OK-ACCESS-SIGN'] = signature;
      headers['OK-ACCESS-TIMESTAMP'] = timestamp;
      headers['OK-ACCESS-PASSPHRASE'] = this.okxCredentials.passphrase || '';
      headers['OK-ACCESS-PROJECT'] = this.okxCredentials.projectId || '';

      const response = await axios.get<OkxQuoteResponse>(url, { headers });

      const okxQuoteResponse = response.data;

      logger.debug('Successfully received quote info from OKX');

      if (
        !okxQuoteResponse ||
        !okxQuoteResponse.data ||
        okxQuoteResponse.data.length === 0 ||
        !okxQuoteResponse?.data?.[0]?.routerResult?.toTokenAmount
      ) {
        logger.error('Invalid quote response received from OKX', undefined, { okxQuoteResponse });
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'Invalid quote response received from OKX');
      }

      const gasEstimate = okxQuoteResponse.data[0].tx.gas;
      const gasLimit =
        okxQuoteResponse.data[0].tx.gasLimit || (Number(gasEstimate) * 1.1).toString(); // 10% buffer if gasLimit not provided

      return {
        protocol: this.protocol,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        amountIn: amountIn,
        amountOut: okxQuoteResponse.data[0].routerResult.toTokenAmount,
        from,
        receiver: receiver || from,
        executionPayload: {
          transactionData: {
            data: okxQuoteResponse?.data?.[0].tx.data,
            to: okxQuoteResponse?.data?.[0].tx.to,
            value: isNative(tokenIn) ? amountIn : okxQuoteResponse?.data?.[0].tx.value,
            gasEstimate,
            gasLimit,
          },
        },
        slippage: params.slippage >= 1 ? params.slippage / 100 : params.slippage,
        networkIn,
        networkOut,
        protocolResponse: okxQuoteResponse,
      };
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch swap quote from OKX: ${errorMessage}`,
      );
    }
  }

  protected priceParamsToRequestBody(params: IntentPriceParams): OkxPriceRequestBody {
    const { tokenIn, tokenOut, amountIn, networkIn } = params;

    logger.debug('Converting price params to OKX request body', { params });

    const requestBody: OkxPriceRequestBody = {
      amount: amountIn.toString(),
      chainId: networkIn.toString(),
      fromTokenAddress: isNative(tokenIn) ? ZERO_ADDRESS : formatAddress(tokenIn),
      toTokenAddress: isNative(tokenOut) ? ZERO_ADDRESS : formatAddress(tokenOut),
    };

    logger.debug('Generated OKX request body', requestBody);
    return requestBody;
  }

  protected calculateSignature(
    method: string,
    requestPath: string,
    queryParams?: OkxQueryParams,
    body?: string,
  ): { signature: string; timestamp: string } {
    const timestamp = new Date().toISOString();

    // Construct the pre-hash string
    let preHash = timestamp + method.toUpperCase() + requestPath;

    // Add query parameters to request path if present
    if (queryParams) {
      const queryString = new URLSearchParams(queryParams as Record<string, string>).toString();
      preHash += '?' + queryString;
    }

    // Add body to pre-hash string if present
    if (body) {
      preHash += body;
    }

    // Create the HMAC SHA256 signature
    //@ts-ignore
    const hmac = crypto.createHmac('sha256', this.okxCredentials.secretKey);
    hmac.update(preHash);
    const signature = hmac.digest('base64');

    return { signature, timestamp };
  }

  protected validatePriceParams(params: IntentPriceParams): void {
    const { networkIn, networkOut } = params;
    logger.debug('Validating price params');

    if (!this.okxCredentials.apiKey) {
      logger.error('API key not provided');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'OKX API key not provided');
    }
    if (!this.okxCredentials.secretKey) {
      logger.error('Secret key not provided');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'OKX Secret key not provided');
    }

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

  protected isOkxPriceResponse(response: RawProtocolPriceResponse): response is OkxPriceResponse {
    return 'data' in response && Array.isArray(response.data) && response.data.length > 0;
  }
}
