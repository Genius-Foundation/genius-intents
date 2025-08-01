import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { isSolanaNetwork } from '../../utils/check-vm';
import { OpenOceanConfig, OpenOceanPriceResponse, OpenOceanQuoteResponse } from './openocean.types';
import { createErrorMessage } from '../../utils/create-error-message';
import axios from 'axios';
import bs58 from 'bs58';
import { PublicKey, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import {
  EvmQuoteExecutionPayload,
  SvmQuoteExecutionPayload,
} from '../../types/quote-execution-payload';
import { NATIVE_SOL, WRAPPED_SOL } from '../../utils/constants';

let logger: ILogger;
export class OpenOceanService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.OPEN_OCEAN;
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
    ChainIdEnum.SOLANA,
    ChainIdEnum.SONIC,
    // ChainIdEnum.APTOS,
    // ChainIdEnum.SUI,
    // Add other supported chains
  ];
  public readonly singleChain = true;
  public readonly multiChain = false;

  public readonly baseUrl: string;

  protected readonly apiVersion: string;
  protected readonly disabledDexIds?: string;
  protected readonly enabledDexIds?: string;

  constructor(config?: GeniusIntentsSDKConfig & OpenOceanConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    // Apply configuration with defaults
    this.baseUrl = config?.openOceanPrivateUrl || 'https://open-api.openocean.finance';
    this.apiVersion = config?.openOceanApiVersion || 'v4';
    this.disabledDexIds = config?.openOceanDisabledDexIds;
    this.enabledDexIds = config?.openOceanEnabledDexIds;
  }

  isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // OpenOcean has no required config fields, all are optional
    return true;
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    this.validatePriceParams(params);
    const queryNetwork = isSolanaNetwork(params.networkIn) ? 'solana' : params.networkIn;
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${queryNetwork}/quote`;
      const queryParams = {
        inTokenAddress: params.tokenIn === NATIVE_SOL ? WRAPPED_SOL : params.tokenIn,
        outTokenAddress: params.tokenOut === NATIVE_SOL ? WRAPPED_SOL : params.tokenOut,
        amountDecimals: params.amountIn,
        disabledDexIds: this.disabledDexIds,
        enabledDexIds: this.enabledDexIds,
        gasPrice: 1,
      };
      const fullUrl = new URL(url);
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          fullUrl.searchParams.append(key, value.toString());
        }
      });

      logger.debug(`Making OpenOcean price request to: ${fullUrl}`);

      const response = await axios.get<{ code: number; data: OpenOceanPriceResponse }>(
        fullUrl.toString(),
      );

      if (response.data.code !== 200 || !response.data.data) {
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          `OpenOcean API returned error: ${JSON.stringify(response.data)}`,
        );
      }

      const priceData = response.data.data;

      logger.debug('Successfully received price info from OpenOcean', {
        amountOut: priceData.outAmount,
        estimatedGas: priceData.estimatedGas,
      });

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: priceData.outAmount,
        estimatedGas: priceData.estimatedGas,
        slippage: params.slippage,
        priceImpact: priceData.price_impact ? parseFloat(priceData.price_impact) : undefined,
        protocolResponse: priceData,
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch swap price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch OpenOcean price, error: ${errorMessage}`,
      );
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    this.validatePriceParams(params);
    const { from, receiver, tokenIn, amountIn, networkIn, networkOut, slippage, tokenOut } = params;

    const queryNetwork = isSolanaNetwork(networkIn) ? 'solana' : networkIn;
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${queryNetwork}/swap`;

      const queryParams = {
        inTokenAddress: tokenIn === NATIVE_SOL ? WRAPPED_SOL : tokenIn,
        outTokenAddress: tokenOut === NATIVE_SOL ? WRAPPED_SOL : tokenOut,
        amountDecimals: amountIn,
        gasPrice: 1, // Default gas price, could be made configurable
        slippage: slippage.toString(),
        account: from,
        disabledDexIds: this.disabledDexIds,
        enabledDexIds: this.enabledDexIds,
      };

      const fullUrl = new URL(url);
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          fullUrl.searchParams.append(key, value.toString());
        }
      });
      logger.debug(`Making OpenOcean quote request to: ${fullUrl}`);

      const response = await axios.get<{ code: number; data: OpenOceanQuoteResponse }>(
        fullUrl.toString(),
      );

      if (response.data.code !== 200 || !response.data.data) {
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `OpenOcean API returned error: ${JSON.stringify(response.data)}`,
        );
      }

      const quoteData = response.data.data;

      logger.debug('Successfully received quote info from OpenOcean', {
        amountOut: quoteData.outAmount,
        estimatedGas: quoteData.estimatedGas,
      });

      let evmExecutionPayload: EvmQuoteExecutionPayload | undefined = undefined;
      let solanaExecutionPayload: SvmQuoteExecutionPayload | undefined = undefined;

      if (isSolanaNetwork(networkIn) && quoteData.data) {
        let swapTransaction: string;
        try {
          swapTransaction = bs58.encode(
            VersionedTransaction.deserialize(Buffer.from(quoteData.data, 'hex')).serialize(),
          );
        } catch (error) {
          logger.debug(
            'Failed to deserialize as versioned transaction, trying legacy transaction',
            {
              error,
            },
          );
          const legacyTransaction = Transaction.from(Buffer.from(quoteData.data, 'hex'));
          const versionedTransaction = new VersionedTransaction(
            new TransactionMessage({
              payerKey: new PublicKey(from),
              instructions: legacyTransaction.instructions,
              recentBlockhash: legacyTransaction.recentBlockhash as string,
            }).compileToV0Message(),
          );
          swapTransaction = bs58.encode(versionedTransaction.serialize());
        }

        solanaExecutionPayload = [swapTransaction];
      } else {
        evmExecutionPayload = {
          transactionData: {
            data: quoteData.data,
            to: quoteData.to,
            value: quoteData.value,
            gasEstimate: quoteData.estimatedGas.toString(),
            gasLimit: (parseInt(quoteData.estimatedGas) * 1.1).toString(), // 10% buffer
          },
          approval: {
            token: tokenIn,
            amount: amountIn,
            spender: quoteData.to,
          },
        };
      }

      return {
        protocol: this.protocol,
        tokenIn: tokenIn,
        tokenOut: params.tokenOut,
        amountIn: amountIn,
        amountOut: quoteData.outAmount,
        from,
        receiver: receiver || from,
        evmExecutionPayload: isSolanaNetwork(networkIn) ? undefined : evmExecutionPayload,
        svmExecutionPayload: isSolanaNetwork(networkIn) ? solanaExecutionPayload : undefined,
        slippage,
        networkIn,
        networkOut,
        protocolResponse: quoteData,
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch OpenOcean quote, error: ${errorMessage}`,
      );
    }
  }

  protected validatePriceParams(params: IntentPriceParams): void {
    const { networkIn, networkOut } = params;

    if (!this.multiChain && networkIn !== networkOut) {
      logger.error('Multi-chain swaps not supported');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Multi-chain swaps not supported');
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

  protected isOpenOceanPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is OpenOceanPriceResponse {
    return response && 'inToken' in response && 'outToken' in response && 'outAmount' in response;
  }
}
