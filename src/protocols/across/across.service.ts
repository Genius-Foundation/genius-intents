import { acrossConfig } from './across.config';
import { AcrossConfig, DepositV3Params } from './across.types';
import { ethers } from 'ethers';
import { ChainIdEnum, ProtocolEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';
import { PriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { NATIVE_ADDRESS } from '../../utils/constants';
import { AcrossClient, createAcrossClient } from '@across-protocol/app-sdk';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';

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
  ];

  protected acrossClient: AcrossClient;

  protected fillDeadlineS: number = 21600;

  constructor(config: GeniusIntentsSDKConfig & AcrossConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    this.acrossClient = createAcrossClient({
      integratorId: config.acrossIntegratorId,
      chains: [],
    });

    if (config.fillDeadlineS) {
      this.fillDeadlineS = config.fillDeadlineS;
    }
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
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
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
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

    console.log('quote', quote.deposit);

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
      throw new Error(`No Across address found for network ${params.networkIn}`);
    }

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
      throw new Error('Unsupported origin network');
    }
    if (!this.chains.includes(params.networkOut as ChainIdEnum)) {
      throw new Error('Unsupported destination network');
    }
    if (params.amountIn === '0') {
      throw new Error('Amount must be greater than 0');
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
      throw new Error('Receiver address is required');
    }

    return {
      ...validatedParams,
      receiver: params.receiver,
    };
  }
}
