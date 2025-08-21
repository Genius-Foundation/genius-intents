import {
  GeniusBridgePriceParams,
  GeniusBridgeQuoteParams,
  GeniusBridgeSdk,
} from 'genius-bridge-sdk';
import {
  validateAndChecksumEvmAddress,
  validateSolanaAddress,
} from '../../utils/address-validation';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { Erc20Approval } from '../../types/erc20-approval';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { isNative } from '../../utils/is-native';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { isEVMNetwork, isSolanaNetwork } from '../../utils/check-vm';
import { createErrorMessage } from '../../utils/create-error-message';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { GeniusBridgeConfig } from './genius-bridge.types';
import { EvmQuoteExecutionPayload } from '../../types/quote-execution-payload';

let logger: ILogger;

export class GeniusBridgeService implements IIntentProtocol {
  /**
   * The protocol identifier for the Genius Bridge.
   */
  public readonly protocol = ProtocolEnum.GENIUS_BRIDGE;

  /**
   * The list of blockchain networks supported by the Genius Bridge.
   */
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.SONIC,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
    ChainIdEnum.SOLANA,
    // Add other supported chains
  ];

  /**
   * Indicates that the service operates only on a single blockchain.
   */
  public readonly singleChain = false;

  /**
   * Indicates that the service supports cross-chain operations.
   */
  public readonly multiChain = true;

  /**
   * The SDK instance for interacting with the Genius Bridge.
   */
  protected geniusBridgeSdk: GeniusBridgeSdk;

  constructor(config?: GeniusIntentsSDKConfig & GeniusBridgeConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    this.geniusBridgeSdk = new GeniusBridgeSdk(config);
  }

  public isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // GeniusBridge has no required config fields, all are optional
    return true;
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    try {
      this.validatePriceParams(params);
      const transformedParams = this.transformPriceParams(params);

      const response = await this.geniusBridgeSdk.fetchPrice(transformedParams);

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
      const { message, error: errorMessageError } = createErrorMessage(error, this.protocol);
      logger.error(`Failed to fetch price from ${this.protocol}; error: ${errorMessageError}`);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch GeniusBridge price, error: ${message}`,
      );
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    try {
      this.validateQuoteParams(params);
      const transformedParams = this.transformQuoteParams(params);

      const response = await this.geniusBridgeSdk.fetchQuote(transformedParams);

      const approval: Erc20Approval = {
        token: response.tokenIn,
        amount: response.amountIn,
        spender: response.evmExecutionPayload?.to || '',
        txnData: response.approvalRequired ? response.approvalRequired.payload : undefined,
        required: !!response.approvalRequired,
      };

      logger.debug('Successfully received quote info from GeniusBridge', {
        amountOut: response.amountOut,
        minAmountOut: response.minAmountOut,
        fee: response.fee,
      });

      let evmQuoteExecutionPayload: EvmQuoteExecutionPayload | undefined = undefined;
      let svmTransactionData: string[] | undefined = undefined;

      if (response.evmExecutionPayload) {
        evmQuoteExecutionPayload = {
          transactionData: {
            to: response.evmExecutionPayload?.to || '',
            data: response.evmExecutionPayload?.data || '',
            value: response.evmExecutionPayload?.value || '0',
            gasLimit: response.evmExecutionPayload?.gasLimit || '0',
          },
          approval,
        };
      }

      if (response.svmExecutionPayload) {
        svmTransactionData = response.svmExecutionPayload || [];
      }

      if ((!svmTransactionData || !svmTransactionData.length) && !evmQuoteExecutionPayload) {
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
        evmExecutionPayload: evmQuoteExecutionPayload,
        svmExecutionPayload: svmTransactionData,
        protocolResponse: response,
      };
    } catch (error) {
      const { message, error: errorMessageError } = createErrorMessage(error, this.protocol);
      logger.error(`Failed to fetch quote from ${this.protocol}; error: ${errorMessageError}`);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch GeniusBridge quote, error: ${message}`,
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
    if (isSolanaNetwork(networkIn) && !isNative(tokenIn)) {
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

    if (isSolanaNetwork(networkOut) && !isNative(tokenOut)) {
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
