import { acrossConfig } from './across.config';
import { AcrossConfig, DepositV3Params } from './across.types';
import { ethers } from 'ethers';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';
import { PriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';

// Dynamic import types for Across SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AcrossClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CreateAcrossClientFunction = (config: any) => AcrossClient;

let logger: ILogger;

export class AcrossService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.ACROSS;
  public readonly singleChain = false;
  public readonly multiChain = true;
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BASE,
    ChainIdEnum.BLAST,
    ChainIdEnum.BSC,
  ];

  protected acrossClient: AcrossClient | null = null;
  protected config: GeniusIntentsSDKConfig & AcrossConfig;
  protected fillDeadlineS: number = 21600;
  private _initialized = false;

  constructor(config: GeniusIntentsSDKConfig & AcrossConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    this.config = config;

    if (config.acrossFillDeadlineS) {
      this.fillDeadlineS = config.acrossFillDeadlineS;
    }

    logger.debug('AcrossService initialized', {
      integratorId: config.acrossIntegratorId,
      fillDeadlineS: this.fillDeadlineS,
    });
  }

  /**
   * Initialize the Across client dynamically
   */
  protected async initializeAcrossClient(): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      const acrossSdk = await import('@across-protocol/app-sdk');
      const createAcrossClient = acrossSdk.createAcrossClient as CreateAcrossClientFunction;

      this.acrossClient = createAcrossClient({
        integratorId: this.config.acrossIntegratorId,
        chains: [],
      });

      this._initialized = true;
      logger.debug('Across client initialized successfully');
    } catch (error: unknown) {
      logger.error(
        'Failed to initialize Across client:',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      throw new Error('Failed to initialize Across client');
    }
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    try {
      await this.initializeAcrossClient();

      if (!this.acrossClient) {
        throw new Error('Across client not initialized');
      }

      logger.debug('Fetching price from Across', {
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
      });

      const validatedParams = this.validatePriceParams(params);

      const quote = await this.acrossClient.getQuote({
        route: {
          originChainId: validatedParams.networkIn,
          destinationChainId: validatedParams.networkOut,
          inputToken: validatedParams.tokenIn as `0x${string}`,
          outputToken: validatedParams.tokenOut as `0x${string}`,
        },
        inputAmount: validatedParams.amountIn,
      });

      logger.debug('Successfully received price from Across', {
        amountOut: quote.deposit.outputAmount.toString(),
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
      });

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: quote.deposit.outputAmount.toString(),
        slippage: params.slippage,
        priceImpact: 0, // Across doesn't provide price impact
        protocolResponse: quote,
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch Across price, error: ${errorMessage}`,
      );
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    try {
      await this.initializeAcrossClient();

      if (!this.acrossClient) {
        throw new Error('Across client not initialized');
      }

      logger.debug('Fetching quote from Across', params);

      const validatedParams = this.validateQuoteParams(params);

      const quote = await this.acrossClient.getQuote({
        route: {
          originChainId: validatedParams.networkIn,
          destinationChainId: validatedParams.networkOut,
          inputToken: validatedParams.tokenIn as `0x${string}`,
          outputToken: validatedParams.tokenOut as `0x${string}`,
        },
        recipient: validatedParams.receiver as `0x${string}`,
        inputAmount: validatedParams.amountIn,
      });

      const quoteTimestamp = Math.floor(Date.now() / 1000);

      logger.debug('Received quote from Across', {
        deposit: quote.deposit,
        quoteTimestamp,
      });

      const callData = this.createDepositV3Calldata({
        depositor: params.from,
        recipient: params.receiver,
        inputToken: params.tokenIn,
        outputToken: params.tokenOut,
        inputAmount: quote.deposit.inputAmount,
        outputAmount: quote.deposit.outputAmount,
        destinationChainId: quote.deposit.destinationChainId,
        exclusiveRelayer: quote.deposit.exclusiveRelayer,
        quoteTimestamp,
        fillDeadline: quoteTimestamp + this.fillDeadlineS,
        exclusivityDeadlineOffset: quote.deposit.exclusivityDeadline
          ? quoteTimestamp + quote.deposit.exclusivityDeadline
          : 0,
      });

      const address = acrossConfig.addresses[params.networkIn];
      if (!address) {
        logger.error(`No Across address found for network ${params.networkIn}`);
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `No Across address found for network ${params.networkIn}`,
        );
      }

      logger.debug('Successfully created quote from Across', {
        amountOut: quote.deposit.outputAmount.toString(),
        minAmountOut: quote.deposit.outputAmount.toString(),
        fee: '0', // Across doesn't provide separate fee information
        to: address,
        isNative: quote.deposit.isNative,
      });

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: quote.deposit.outputAmount.toString(),
        slippage: params.slippage,
        from: params.from,
        receiver: params.receiver,
        evmExecutionPayload: {
          transactionData: {
            to: address,
            data: callData,
            value: quote.deposit.isNative ? params.amountIn : '0',
          },
          approval: {
            spender: address,
            token: params.tokenIn,
            amount: params.amountIn,
          },
        },
        protocolResponse: quote,
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch Across quote, error: ${errorMessage}`,
      );
    }
  }

  public isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return 'acrossIntegratorId' in config;
  }

  protected createDepositV3Calldata(params: DepositV3Params): string {
    const {
      depositor,
      recipient,
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      destinationChainId,
      exclusiveRelayer,
      quoteTimestamp,
      fillDeadline,
      exclusivityDeadlineOffset,
      message = '0x',
    } = params;

    const iface = new ethers.Interface([
      'function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadlineOffset, bytes message) payable',
    ]);

    return iface.encodeFunctionData('depositV3', [
      depositor,
      recipient,
      inputToken,
      outputToken,
      inputAmount.toString(),
      outputAmount.toString(),
      destinationChainId,
      exclusiveRelayer,
      quoteTimestamp,
      fillDeadline,
      exclusivityDeadlineOffset,
      message,
    ]);
  }

  protected validatePriceParams(
    params: IntentPriceParams,
  ): IntentPriceParams & { tokenIn: string; tokenOut: string } {
    if (!this.chains.includes(params.networkIn as ChainIdEnum)) {
      logger.error(`Unsupported origin network: ${params.networkIn}`);
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `Unsupported origin network: ${params.networkIn}`,
      );
    }
    if (!this.chains.includes(params.networkOut as ChainIdEnum)) {
      logger.error(`Unsupported destination network: ${params.networkOut}`);
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `Unsupported destination network: ${params.networkOut}`,
      );
    }
    if (params.amountIn === '0') {
      logger.error('Amount must be greater than 0');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Amount must be greater than 0');
    }

    let tokenIn = params.tokenIn;
    let tokenOut = params.tokenOut;

    // Handle native token addresses
    if (tokenIn.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
      tokenIn = NATIVE_ADDRESS;
    }
    if (tokenOut.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
      tokenOut = NATIVE_ADDRESS;
    }

    logger.debug('Price params validated successfully', {
      networkIn: params.networkIn,
      networkOut: params.networkOut,
      tokenIn,
      tokenOut,
      amountIn: params.amountIn,
    });

    return {
      ...params,
      tokenIn,
      tokenOut,
    };
  }

  protected validateQuoteParams(
    params: IntentQuoteParams,
  ): IntentQuoteParams & { tokenIn: string; tokenOut: string } {
    const validatedParams = this.validatePriceParams(params);

    if (!params.receiver) {
      logger.error('Receiver address is required');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Receiver address is required');
    }

    logger.debug('Quote params validated successfully', {
      from: params.from,
      receiver: params.receiver,
    });

    return {
      ...validatedParams,
      receiver: params.receiver,
    };
  }
}
