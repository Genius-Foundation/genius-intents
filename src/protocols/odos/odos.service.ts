import axios from 'axios';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { formatAddress } from '../../utils/address';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import {
  OdosPriceResponse,
  OdosAssembleRequestBody,
  OdosQuoteResponse,
  OdosQuoteRequestBody,
} from './odos.types';
import { ZERO_ADDRESS } from '../../utils/constants';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import { IntentQuoteParams } from '../../types/quote-params';
import { createErrorMessage } from '../../utils/create-error-message';

let logger: ILogger;
export class OdosService implements IIntentProtocol {
  protected readonly rpcUrls: Record<number, string> = {};
  public readonly protocol = ProtocolEnum.ODOS;
  public includeApprovals?: boolean | undefined = false;
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
  baseUrl = 'https://api.odos.xyz';
  public readonly singleChain = true;
  public readonly multiChain = false;
  public readonly priceEndpoint = '/pricing/token';
  public readonly quoteEndpoint = '/sor/quote/v2';
  public readonly assemblyEndpoint = '/sor/assemble';
  public readonly quoteBaseUrl = this.baseUrl + this.quoteEndpoint;
  public readonly priceBaseUrl = this.baseUrl + this.priceEndpoint;
  public readonly assemblyBaseUrl = this.baseUrl + this.assemblyEndpoint;

  constructor(config?: GeniusIntentsSDKConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();
  }

  isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // Odos has no required config fields, all are optional
    return true;
  }

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
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch swap price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch swap price from ODOS: ${errorMessage}`,
      );
    }
  }

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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch swap quote from ODOS: ${errorMessage}`,
      );
    }
  }

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

  protected isOdosPriceResponse(response: RawProtocolPriceResponse): response is OdosPriceResponse {
    return 'pathId' in response;
  }
}
