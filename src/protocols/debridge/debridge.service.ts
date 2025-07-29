import axios from 'axios';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  DeBridgeConfig,
  DeBridgeQuoteResponse,
  DeBridgePriceParams,
  DeBridgeQuoteParams,
} from './debridge.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { isEVMNetwork, isSolanaNetwork } from '../../utils/check-vm';
import { createErrorMessage } from '../../utils/create-error-message';
import { validateSolanaAddress } from '../../utils/address';
import { validateAndChecksumEvmAddress } from '../../utils/address-validation';
import { ZERO_ADDRESS } from '../../utils/constants';
import {
  EvmQuoteExecutionPayload,
  SvmQuoteExecutionPayload,
} from '../../types/quote-execution-payload';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { isNative } from '../../utils/is-native';

let logger: ILogger;

/**
 * The `DeBridgeService` class implements the IIntentProtocol interface for cross-chain
 * token swaps using the DeBridge protocol. It provides functionality for fetching price
 * quotes and generating transaction data for token transfers across multiple supported
 * blockchains.
 *
 * @implements {IIntentProtocol}
 */
export class DeBridgeService implements IIntentProtocol {
  /**
   * RPC URLs for each supported blockchain network.
   */
  protected readonly solanaRpcUrl: string | undefined = undefined;

  /**
   * The protocol identifier for DeBridge.
   */
  public readonly protocol = ProtocolEnum.DEBRIDGE;

  /**
   * The list of blockchain networks supported by the DeBridge service.
   */
  public readonly chains = [
    ChainIdEnum.ETHEREUM,
    ChainIdEnum.ARBITRUM,
    ChainIdEnum.OPTIMISM,
    ChainIdEnum.POLYGON,
    ChainIdEnum.BSC,
    ChainIdEnum.AVALANCHE,
    ChainIdEnum.BASE,
    ChainIdEnum.SONIC,
    ChainIdEnum.SOLANA,
    // Add other supported chains as needed
  ];

  /**
   * Indicates that the service does not operate only on a single blockchain.
   */
  public readonly singleChain = false;

  /**
   * Indicates that the service supports cross-chain operations.
   */
  public readonly multiChain = true;

  /**
   * The base URL for the DeBridge API.
   */
  public readonly baseUrl: string;

  /**
   * The chain ID used for Solana in the DeBridge protocol.
   */
  public readonly solanaChainIdEnum: number = 7565164;

  /**
   * The chain ID used for Sonic in the DeBridge protocol.
   */
  public readonly sonicChainIdEnum: number = 100000014;

  /**
   * Optional access token for the DeBridge API.
   */
  public readonly debridgeAccessToken: string | null = null;

  /**
   * Creates a new instance of the DeBridgeService.
   *
   * @param {GeniusIntentsSDKConfig & DeBridgeConfig} config - Configuration parameters for the service.
   *
   * @throws {SdkError} If no RPC URLs are provided for the supported blockchains.
   */
  constructor(config?: GeniusIntentsSDKConfig & DeBridgeConfig) {
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
      config?.deBridgePrivateUrl || 'https://dln.debridge.finance/v1.0/dln/order/create-tx';
    this.debridgeAccessToken = config?.debridgeAccessToken || null;
    this.solanaRpcUrl = config?.solanaRpcUrl || undefined;
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    // Simple validation - can be extended based on specific requirements
    return config && typeof config === 'object';
  }

  /**
   * Fetches a price quote for a cross-chain token swap from the DeBridge API.
   *
   * @param {IntentPriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<PriceResponse>} A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - The raw response from the DeBridge API.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If there's an error fetching the price from DeBridge.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    try {
      this.validatePriceParams(params);
      const validatedParams = this.transformPriceParams(params);
      const dlnQuote = await this.fetchDLNQuote({
        ...validatedParams,
        ...params.overrideParamsDebridge,
      });

      logger.debug('Successfully received price info from DeBridge', {
        amountOut: dlnQuote.estimation.dstChainTokenOut.amount,
        orderId: dlnQuote.orderId,
      });

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: dlnQuote.estimation.dstChainTokenOut.amount,
        estimatedGas: '0', // DeBridge doesn't provide gas estimates directly
        slippage: params.slippage,
        priceImpact: undefined, // DeBridge doesn't provide price impact
        protocolResponse: dlnQuote,
      };
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch DeBridge price, error: ${errorMessage}`,
      );
    }
  }

  /**
   * Fetches a swap quote from the DeBridge API and builds the transaction data
   * needed to execute the cross-chain swap.
   *
   * @param {IntentQuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse>} A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the DeBridge API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the quote.
   */
  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    try {
      this.validateQuoteParams(params);
      const validatedParams = this.transformQuoteParams(params);
      const dlnQuote = await this.fetchDLNQuote({
        ...validatedParams,
        ...params.overrideParamsDebridge,
      });

      if (!dlnQuote.tx.data) {
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'Invalid DLN quote: Missing transaction data');
      }

      logger.debug('Successfully received quote info from DeBridge', {
        dlnQuote,
        amountOut: dlnQuote.estimation.dstChainTokenOut.amount,
        to: dlnQuote.tx.to,
      });

      const isSourceSolana = isSolanaNetwork(params.networkIn);
      const evmExecutionPayload: EvmQuoteExecutionPayload | undefined = isSourceSolana
        ? undefined
        : {
            transactionData: {
              data: dlnQuote.tx.data,
              to: dlnQuote.tx.to || '',
              value: dlnQuote.tx.value || '0',
            },
            approval: {
              spender: dlnQuote.tx.allowanceTarget || '',
              amount: dlnQuote.tx.allowanceValue || '',
              token: params.tokenIn,
            },
          };

      const solanaExecutionPayload: SvmQuoteExecutionPayload | undefined = isSourceSolana
        ? [await this.formatSolanaTransaction(dlnQuote.tx.data)]
        : undefined;

      const response: QuoteResponse = {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: dlnQuote.estimation.dstChainTokenOut.amount,
        slippage: params.slippage,
        from: params.from,
        receiver: params.receiver || params.from,
        evmExecutionPayload,
        svmExecutionPayload: solanaExecutionPayload,
        protocolResponse: dlnQuote,
      };

      return response;
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch DeBridge quote, error: ${errorMessage}`,
      );
    }
  }

  /**
   * Converts a hexadecimal string representing a serialized transaction into a base58-encoded string.
   *
   * This method first decodes the input hex string into a buffer, deserializes it into a `VersionedTransaction`,
   * then serializes the transaction and encodes the result using base58.
   *
   * @param hex - The hexadecimal string to convert. May optionally start with '0x'.
   * @returns The base58-encoded string representation of the serialized transaction.
   */
  public async formatSolanaTransaction(hex: string): Promise<string> {
    const versionedTx = VersionedTransaction.deserialize(Buffer.from(hex.slice(2), 'hex'));
    /**
     * Add a recent blockhash to the transaction
     * This is necessary for the transaction to be valid on the Solana network.
     */

    if (!this.solanaRpcUrl) {
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'No RPC URL provided for Solana network');
    }

    const connection = new Connection(this.solanaRpcUrl, 'confirmed');
    const recentBlockhash = await connection.getLatestBlockhash('confirmed');
    versionedTx.message.recentBlockhash = recentBlockhash.blockhash;

    const serializedTx = versionedTx.serialize();

    return bs58.encode(serializedTx);
  }

  /**
   * Fetches a quote from the DeBridge DLN (Decentralized Liquidity Network) API.
   *
   * @param {DeBridgePriceParams & { to?: string; authority?: { networkInAddress: string; networkOutAddress: string; }}} params -
   * The parameters for the quote request, including network IDs, token addresses, amounts, and authority addresses.
   *
   * @returns {Promise<DeBridgeQuoteResponse>} A promise that resolves to the quote response from DeBridge.
   *
   * @throws {SdkError} If there's an error with the HTTP request to the DeBridge API.
   * @throws {Error} If the DeBridge API returns an error message.
   */
  protected async fetchDLNQuote(params: DeBridgePriceParams): Promise<DeBridgeQuoteResponse> {
    const isSourceSolana = isSolanaNetwork(params.networkIn);
    const isDestSolana = isSolanaNetwork(params.networkOut);
    const isSrcSonic = params.networkIn === ChainIdEnum.SONIC;
    const isDstSonic = params.networkOut === ChainIdEnum.SONIC;

    let srcChainId = isSourceSolana ? this.solanaChainIdEnum : params.networkIn;
    let dstChainId = isDestSolana ? this.solanaChainIdEnum : params.networkOut;

    // Handle Sonic chain IDs if needed
    if (isSrcSonic) {
      // Use appropriate Sonic chain ID if your implementation has a specific one
      srcChainId = params.networkIn;
    } else if (isDstSonic) {
      // Use appropriate Sonic chain ID if your implementation has a specific one
      dstChainId = params.networkOut;
    }

    const request = {
      srcChainId: srcChainId.toString(),
      dstChainId: dstChainId.toString(),
      srcChainTokenIn: params.tokenIn,
      dstChainTokenOut: params.tokenOut,
      srcChainTokenInAmount: params.amountIn,
      dstChainTokenOutAmount: 'auto',
      dstChainTokenOutRecipient: params.to,
      srcChainOrderAuthorityAddress: params?.authority?.networkInAddress,
      dstChainOrderAuthorityAddress: params?.authority?.networkOutAddress,
      /**
       * If the tokenIn is native, then the tx.value will be the amountIn + debridge fee
       * The transfer fee will be taken out of the amountIn
       */
      prependOperatingExpenses: false,
      slippage: (params.slippage * 10).toString(),
      senderAddress: params.from,
      accessToken: this.debridgeAccessToken ? this.debridgeAccessToken : undefined,
    };

    logger.debug(`Making DeBridge quote request to: ${this.baseUrl}`, request);

    try {
      // Construct URL with access token if provided
      let url = this.baseUrl;
      const headers: Record<string, string> = {};

      // Add access token to headers if available
      if (this.debridgeAccessToken) {
        headers['Authorization'] = `Bearer ${this.debridgeAccessToken}`;
      }

      const response = await axios.get(url, {
        params: request,
        headers,
      });

      if (response.data?.errorMessage) {
        throw new Error(response.data.errorMessage);
      }

      return response.data;
    } catch (error: unknown) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch DLN quote`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.FAILED_HTTP_REQUEST,
        `Failed to fetch DLN quote, error: ${errorMessage}`,
      );
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
    const { networkIn, networkOut, tokenIn, tokenOut, amountIn } = params;

    if (networkIn === networkOut) {
      logger.error('Single chain swaps are not supported by DeBridge');
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        'Single chain swaps are not supported by DeBridge',
      );
    }

    if (!this.chains.includes(networkIn)) {
      logger.error(`Network ${networkIn} not supported by DeBridge`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Network ${networkIn} not supported by DeBridge`);
    }

    if (!this.chains.includes(networkOut)) {
      logger.error(`Network ${networkOut} not supported by DeBridge`);
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `Network ${networkOut} not supported by DeBridge`,
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

  /**
   * Validates the parameters for a quote request, extending the price parameters validation.
   *
   * @param {IntentQuoteParams} params - The parameters to validate.
   *
   * @throws {SdkError} If any of the parameters are invalid or missing.
   */
  protected validateQuoteParams(params: IntentQuoteParams): void {
    this.validatePriceParams(params);

    if (!params.receiver) {
      logger.error('To address is required for quote');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Receiver address is required for quote');
    }

    if (!params.from) {
      logger.error('From address is required for quote');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'From address is required for quote');
    }
  }

  /**
   * Transforms the price parameters to the format expected by the DeBridge API.
   *
   * @param {IntentPriceParams} params - The original price parameters.
   *
   * @returns {DeBridgePriceParams} The transformed parameters ready for the DeBridge API.
   */
  protected transformPriceParams(params: IntentPriceParams): DeBridgePriceParams {
    let { networkIn, networkOut, tokenIn, tokenOut } = params;
    const { amountIn, slippage, from } = params;

    // Handle chainId transformation for Sonic
    if (networkIn === ChainIdEnum.SONIC) {
      networkIn = this.sonicChainIdEnum; // or any other default chain for Sonic
    }
    if (networkOut === ChainIdEnum.SONIC) {
      networkOut = this.sonicChainIdEnum; // or any other default chain for Sonic
    }

    // Handle token address transformation
    if (isSolanaNetwork(networkIn)) {
      networkIn = this.solanaChainIdEnum;
    } else if (isNative(tokenIn)) {
      tokenIn = ZERO_ADDRESS;
    } else {
      tokenIn = validateAndChecksumEvmAddress(tokenIn);
    }

    if (isSolanaNetwork(networkOut)) {
      networkOut = this.solanaChainIdEnum;
    } else if (isNative(tokenOut)) {
      tokenOut = ZERO_ADDRESS;
    } else {
      tokenOut = validateAndChecksumEvmAddress(tokenOut);
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

  /**
   * Transforms the quote parameters to the format expected by the DeBridge API.
   *
   * @param {IntentQuoteParams} params - The original quote parameters.
   *
   * @returns {DeBridgeQuoteParams} The transformed parameters ready for the DeBridge API.
   */
  protected transformQuoteParams(params: IntentQuoteParams): DeBridgeQuoteParams {
    const transformedPriceParams = this.transformPriceParams(params);

    // Create authority object from parameters or use the default from service instance
    const authority = {
      networkInAddress: params.from,
      networkOutAddress: params.receiver || params.from,
    };

    let priceResponse: DeBridgeQuoteResponse | undefined = undefined;
    if (params.priceResponse && this.isDeBridgePriceResponse(params.priceResponse.protocolResponse))
      priceResponse = params.priceResponse.protocolResponse;

    return {
      ...transformedPriceParams,
      to: params.receiver,
      authority,
      priceResponse,
    };
  }

  protected isDeBridgePriceResponse(
    response: RawProtocolPriceResponse,
  ): response is DeBridgeQuoteResponse {
    return response && 'estimation' in response && 'tx' in response && 'order' in response;
  }
}
