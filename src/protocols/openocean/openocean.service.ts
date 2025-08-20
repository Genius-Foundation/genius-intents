import axios from 'axios';
import bs58 from 'bs58';

import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { OpenOceanConfig, OpenOceanPriceResponse, OpenOceanTokenInfo } from './openocean.types';
import { PublicKey, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { NATIVE_SOL, WRAPPED_SOL } from '../../utils/constants';
import { createErrorMessage } from '../../utils/create-error-message';
import { EvmTransactionData } from '../../types/evm-transaction-data';
import { QuoteResponse } from '../../types/quote-response';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { isSolanaNetwork } from '../../utils/check-vm';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';

let logger: ILogger;
/**
 * The `OpenOceanService` class implements the IIntentProtocol interface for token swaps
 * using the OpenOcean aggregator. It provides functionality for fetching price quotes
 * and generating transaction data for token swaps on various supported blockchains.
 *
 * @implements {IIntentProtocol}
 */
export class OpenOceanService implements IIntentProtocol {
  /**
   * RPC URLs for each supported blockchain network.
   */
  protected readonly rpcUrls: Record<number, string> = {};

  /**
   * The protocol identifier for OpenOcean.
   */
  public readonly protocol = ProtocolEnum.OPEN_OCEAN;

  /**
   * The list of blockchain networks supported by the OpenOcean service.
   */
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
    ChainIdEnum.HYPEREVM,
    // ChainIdEnum.APTOS,
    // ChainIdEnum.SUI,
    // Add other supported chains
  ];

  /**
   * Indicates that the service operates only on a single blockchain.
   */
  public readonly singleChain = true;

  /**
   * Indicates that the service does not support cross-chain operations.
   */
  public readonly multiChain = false;

  /**
   * The base URL for the OpenOcean API.
   */
  public readonly baseUrl: string;

  /**
   * The API version to use for OpenOcean API requests.
   */
  protected readonly apiVersion: string;

  /**
   * Optional comma-separated list of DEX IDs to exclude from routing.
   */
  protected readonly disabledDexIds?: string;

  /**
   * Optional comma-separated list of DEX IDs to include in routing.
   */
  protected readonly enabledDexIds?: string;

  /**
   * Creates a new instance of the OpenOceanService.
   *
   * @param {GeniusIntentsSDKConfig & OpenOceanConfig} config - Configuration parameters for the service.
   *
   * @throws {SdkError} If no RPC URLs are provided for the supported blockchains.
   */
  constructor(config?: GeniusIntentsSDKConfig & OpenOceanConfig) {
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
    if (!config?.rpcUrls) {
      logger.error('OpenOcean Service requires an RPC URL');
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'OpenOcean Service requires an RPC URL');
    }

    // Apply configuration with defaults
    this.baseUrl = config?.privateUrl || 'https://open-api.openocean.finance';
    this.apiVersion = config?.apiVersion || 'v4';
    this.disabledDexIds = config?.disabledDexIds;
    this.enabledDexIds = config?.enabledDexIds;
  }

  /**
   * Checks if the provided configuration object is valid for OpenOcean.
   *
   * @typeParam T - The expected shape of the configuration object, with string values.
   * @param _config - The configuration object to validate.
   * @returns Always returns `true` since OpenOcean has no required config fields; all fields are optional.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(_config: {
    [key: string]: string;
  }): _config is T {
    // OpenOcean has no required config fields, all are optional
    return true;
  }

  /**
   * Fetches a price quote for a token swap from the OpenOcean API.
   *
   * @param {IntentPriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<PriceResponse>} A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - Gas estimation for the transaction.
   * - Price impact information if available.
   * - The raw response from the OpenOcean API.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the API returns an error response.
   * @throws {SdkError} If there's an error fetching the price.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    if (params.networkIn === ChainIdEnum.SOLANA && params.tokenIn == NATIVE_SOL) {
      params.tokenIn = WRAPPED_SOL;
    }
    if (params.networkIn === ChainIdEnum.SOLANA && params.tokenOut == NATIVE_SOL) {
      params.tokenOut = WRAPPED_SOL;
    }

    this.validatePriceParams(params);
    const queryNetwork = isSolanaNetwork(params.networkIn) ? 'solana' : params.networkIn;
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${queryNetwork}/quote`;
      const queryParams = {
        inTokenAddress: params.tokenIn,
        outTokenAddress: params.tokenOut,
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

      const response = await axios.get<{
        code: number;
        data: OpenOceanPriceResponse;
      }>(fullUrl.toString());

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
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the OpenOcean API and builds the transaction data
   * needed to execute the swap.
   *
   * @param {IntentQuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse>} A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   * - Gas estimates for the transaction.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the API returns an error response.
   * @throws {SdkError} If there's an error fetching the quote.
   */
  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    if (params.networkIn === ChainIdEnum.SOLANA && params.tokenIn == NATIVE_SOL) {
      params.tokenIn = WRAPPED_SOL;
    }
    if (params.networkIn === ChainIdEnum.SOLANA && params.tokenOut == NATIVE_SOL) {
      params.tokenOut = WRAPPED_SOL;
    }
    this.validatePriceParams(params);

    const { from, receiver, tokenIn, amountIn, networkIn, networkOut, slippage, tokenOut } = params;

    const queryNetwork = isSolanaNetwork(networkIn) ? 'solana' : networkIn;

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${queryNetwork}/swap`;
      const queryParams = {
        inTokenAddress: tokenIn,
        outTokenAddress: tokenOut,
        amountDecimals: amountIn,
        gasPrice: 1,
        slippage: slippage.toString(),
        account: from,
        disabledDexIds: this.disabledDexIds,
        enabledDexIds: this.enabledDexIds,
      };

      const fullUrl = new URL(url);
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fullUrl.searchParams.append(k, String(v));
      });

      logger.debug(`Making OpenOcean quote request to: ${fullUrl}`);

      type OoEnvelope = {
        code: number;
        data?: {
          inToken: OpenOceanTokenInfo;
          outToken: OpenOceanTokenInfo;
          inAmount: string;
          outAmount: string;
          estimatedGas: string;
          minOutAmount: string;
          from: string;
          to: string;
          value: string;
          gasPrice: string;
          data: string;
          chainId: number;
          rfqDeadline?: number;
          gmxFee?: number;
          dexId: number;
          code?: number;
          msg?: string;
        };
      };
      const response = await axios.get<OoEnvelope>(fullUrl.toString());

      // 1) Guard top-level envelope
      if (response.data?.code !== 200 || !response.data?.data) {
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, {
          protocol: this.protocol,
          // @ts-ignore
          message: response.data.msg,
          error: `Failed to fetch swap quote from ${this.protocol}`,
        });
      }

      // 2) Guard nested payload (OpenOcean sometimes puts error inside data)
      const quoteData = response.data.data;

      // If the nested object itself has an error-like shape
      if ((quoteData?.code && quoteData.code !== 200) || quoteData?.msg) {
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, {
          protocol: this.protocol,
          error: `Failed to fetch swap quote from ${this.protocol}`,
          message: String(quoteData?.msg || `code: ${quoteData?.code}`),
        });
      }

      logger.debug('Successfully received quote info from OpenOcean', {
        amountOut: quoteData.outAmount,
        estimatedGas: quoteData.estimatedGas,
      });

      let base58Txn: string | undefined;
      if (isSolanaNetwork(networkIn) && quoteData.data) {
        try {
          base58Txn = bs58.encode(
            VersionedTransaction.deserialize(Buffer.from(quoteData.data, 'hex')).serialize(),
          );
        } catch (e) {
          logger.debug(
            'Failed to deserialize as versioned transaction, trying legacy transaction',
            { error: e },
          );
          const legacy = Transaction.from(Buffer.from(quoteData.data, 'hex'));
          const vtx = new VersionedTransaction(
            new TransactionMessage({
              payerKey: new PublicKey(from),
              instructions: legacy.instructions,
              recentBlockhash: legacy.recentBlockhash as string,
            }).compileToV0Message(),
          );
          base58Txn = bs58.encode(vtx.serialize());
        }
      }

      const executionPayloadKey =
        networkIn == ChainIdEnum.SOLANA ? 'evmExecutionPayload' : 'svmExecutionPayload';

      const executionPayload =
        networkIn == ChainIdEnum.SOLANA
          ? [base58Txn as string]
          : {
              transactionData: {
                data: quoteData.data,
                to: quoteData.to,
                value: quoteData.value,
                gasEstimate: quoteData.estimatedGas.toString(),
                gasLimit: (parseInt(quoteData.estimatedGas) * 1.1).toString(),
              } as EvmTransactionData,
              approval: {
                token: tokenIn,
                amount: amountIn,
                spender: quoteData.to,
              },
            };

      return {
        protocol: this.protocol,
        tokenIn,
        tokenOut: params.tokenOut,
        amountIn,
        amountOut: quoteData.outAmount,
        from,
        receiver: receiver || from,
        [executionPayloadKey]: executionPayload,
        slippage,
        networkIn,
        networkOut,
        protocolResponse: quoteData,
      };
    } catch (error) {
      // Normalize ANY thrown value (Axios, string, GeniusError, etc.) and rethrow
      const formatted = createErrorMessage(error, this.protocol); // { protocol, message, error }
      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formatted, { cause: error });
    }
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

  /**
   * Type guard to check if a response is a valid OpenOcean price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid OpenOcean price response.
   */
  protected isOpenOceanPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is OpenOceanPriceResponse {
    return response && 'inToken' in response && 'outToken' in response && 'outAmount' in response;
  }
}
