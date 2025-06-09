import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { Erc20Approval } from '../../types/erc20-approval';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { IntentsSDKConfig } from '../../types/sdk-config';
import { isNative } from '../../utils/is-native';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { isEVMNetwork, isSolanaNetwork } from '../../utils/check-vm';
import { createErrorMessage } from '../../utils/create-error-message';
import {
  validateAndChecksumEvmAddress,
  validateSolanaAddress,
} from '../../utils/address-validation';
import { NATIVE_ADDRESS } from '../../utils/constants';
import {
  GeniusBridgePriceResponse,
  GeniusBridgeQuoteResponse,
  EvmArbitraryCall,
  GeniusBridgePriceParams,
  GeniusBridgeQuoteParams,
} from './genius-bridge.types';
import axios from 'axios';

let logger: ILogger;

export class GeniusBridgeService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.GENIUS_BRIDGE;
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
    ChainIdEnum.SOLANA,
    // Add other supported chains
  ];
  public readonly singleChain = false;
  public readonly multiChain = true;
  public readonly baseUrl: string;
  public readonly priceEndpoint: string;
  public readonly quoteEndpoint: string;

  constructor(
    config?: IntentsSDKConfig & {
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

    // Apply configuration with defaults
    this.baseUrl =
      config?.geniusBridgeBaseUrl ||
      'http://genius-bridge-staging-894762848.us-east-2.elb.amazonaws.com';
    this.priceEndpoint = '/quoting/price';
    this.quoteEndpoint = '/quoting/quote';
  }

  isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // GeniusBridge has no required config fields, all are optional
    return true;
  }

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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch GeniusBridge price, error: ${errorMessage}`,
      );
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    try {
      this.validateQuoteParams(params);
      const transformedParams = this.transformQuoteParams(params);

      const priceResponse = await this.makeGeniusBridgePriceRequest(transformedParams);

      if (priceResponse instanceof Error) {
        throw priceResponse;
      }

      const response = await this.makeGeniusBridgeQuoteRequest({
        ...transformedParams,
        priceResponse,
      });

      if (response instanceof Error) {
        throw response;
      }

      let approvalRequired: Erc20Approval | false = false;
      if (response.approvalRequired) {
        approvalRequired = {
          spender: response.approvalRequired.spender,
          amount: response.approvalRequired.amount,
        };
      }

      logger.debug('Successfully received quote info from GeniusBridge', {
        amountOut: response.amountOut,
        minAmountOut: response.minAmountOut,
        fee: response.fee,
      });

      let evmTransactionData: EvmArbitraryCall | undefined = undefined;
      let svmTransactionData: string[] | undefined = undefined;

      if (response.evmExecutionPayload) {
        evmTransactionData = {
          from: params.from,
          to: response.evmExecutionPayload?.to || '',
          data: response.evmExecutionPayload?.data || '',
          value: response.evmExecutionPayload?.value || '0',
          gasPrice: response.evmExecutionPayload?.gasPrice || '0',
          gasLimit: response.evmExecutionPayload?.gasLimit || '0',
        };
      }

      if (response.svmExecutionPayload) {
        svmTransactionData = response.svmExecutionPayload || [];
      }

      if ((!svmTransactionData || !svmTransactionData.length) && !evmTransactionData) {
        logger.error('GeniusBridge execution payload is missing');
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          'GeniusBridge execution payload is missing in the quote response',
        );
      }

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: response.amountOut,
        slippage: params.slippage,
        priceImpact: undefined, // GeniusBridge doesn't provide price impact
        from: params.from,
        receiver: params.receiver || params.from,
        executionPayload: evmTransactionData
          ? {
              transactionData: evmTransactionData,
              approvalRequired,
            }
          : { transactionData: svmTransactionData || [] },
        protocolResponse: response,
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch GeniusBridge quote, error: ${errorMessage}`,
      );
    }
  }

  public async makeGeniusBridgePriceRequest(
    params: GeniusBridgePriceParams,
  ): Promise<GeniusBridgePriceResponse> {
    const url = `${this.baseUrl}${this.priceEndpoint}`;

    logger.debug('Making GeniusBridge price request', {
      networkIn: params.networkIn,
      networkOut: params.networkOut,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
    });

    try {
      const response = await axios.post<GeniusBridgePriceResponse>(url, params);
      return response.data;
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error('Failed to fetch price from GeniusBridge', errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch GeniusBridge price: ${errorMessage}`,
      );
    }
  }

  public async makeGeniusBridgeQuoteRequest(
    params: GeniusBridgeQuoteParams,
  ): Promise<GeniusBridgeQuoteResponse> {
    const url = `${this.baseUrl}${this.quoteEndpoint}`;

    try {
      const response = await axios.post<GeniusBridgeQuoteResponse>(url, params);
      return response.data;
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error('Failed to fetch quote from GeniusBridge', errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch GeniusBridge quote: ${errorMessage}`,
      );
    }
  }

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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: unknown) {
        logger.error(`Invalid Solana token address: ${tokenIn}`);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Invalid Solana token address: ${tokenIn}`);
      }
    } else if (isEVMNetwork(networkIn) && !isNative(tokenIn)) {
      try {
        validateAndChecksumEvmAddress(tokenIn);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: unknown) {
        logger.error(`Invalid EVM token address: ${tokenIn}`);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Invalid EVM token address: ${tokenIn}`);
      }
    }

    if (isSolanaNetwork(networkOut)) {
      try {
        validateSolanaAddress(tokenOut);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: unknown) {
        logger.error(`Invalid Solana token address: ${tokenOut}`);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Invalid Solana token address: ${tokenOut}`);
      }
    } else if (isEVMNetwork(networkOut) && !isNative(tokenOut)) {
      try {
        validateAndChecksumEvmAddress(tokenOut);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: unknown) {
        logger.error(`Invalid EVM token address: ${tokenOut}`);
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Invalid EVM token address: ${tokenOut}`);
      }
    }
  }

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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error: unknown) {
          logger.error(`Invalid Solana receiver address: ${params.receiver}`);
          throw sdkError(
            SdkErrorEnum.INVALID_PARAMS,
            `Invalid Solana receiver address: ${params.receiver}`,
          );
        }
      } else if (isEVMNetwork(params.networkOut)) {
        try {
          validateAndChecksumEvmAddress(params.receiver);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error: unknown) {
          logger.error(`Invalid EVM receiver address: ${params.receiver}`);
          throw sdkError(
            SdkErrorEnum.INVALID_PARAMS,
            `Invalid EVM receiver address: ${params.receiver}`,
          );
        }
      }
    }
  }

  protected transformPriceParams(params: IntentPriceParams): GeniusBridgePriceParams {
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
    };
  }

  protected transformQuoteParams(params: IntentQuoteParams): GeniusBridgeQuoteParams {
    const transformedPriceParams = this.transformPriceParams(params);

    return {
      ...transformedPriceParams,
      to: params.receiver || params.from,
      authority: {
        networkInAddress: params.from,
        networkOutAddress: params.receiver || params.from,
      },
    };
  }
}
