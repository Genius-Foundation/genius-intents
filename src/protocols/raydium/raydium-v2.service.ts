import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { API_URLS, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2';
import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

import {
  RaydiumV2PriceResponse,
  RaydiumV2QuoteResponse,
  RaydiumV2FeeData,
  RaydiumTokenAccountsResponse,
} from './raydium-v2.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { RaydiumApiPriceParams, RaydiumApiQuoteParams } from './raydium-v2.types';
import { NATIVE_SOL, WRAPPED_SOL } from '../../utils/constants';
import { sdkError } from '../../utils/throw-error';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { QuoteResponse } from '../../types/quote-response';
import { convertBase64ToBase58 } from '../../utils/base64-to-base58';
import { createErrorMessage } from '../../utils/create-error-message';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';

let logger: ILogger;
/**
 * The `RaydiumV2Service` class implements the IIntentProtocol interface for token swaps
 * on the Solana blockchain using the Raydium V2 protocol. It provides functionality for
 * fetching price quotes and generating transaction data for token swaps on Solana.
 *
 * @implements {IIntentProtocol}
 */
export class RaydiumV2Service implements IIntentProtocol {
  /**
   * The protocol identifier for Raydium V2.
   */
  public readonly protocol = ProtocolEnum.RAYDIUM_V2;

  /**
   * The list of blockchain networks supported by the Raydium V2 service.
   * Currently only supports the Solana blockchain.
   */
  public readonly chains = [ChainIdEnum.SOLANA];

  /**
   * Indicates that the service operates only on a single blockchain.
   */
  public readonly singleChain: boolean = true;

  /**
   * Indicates that the service does not support cross-chain operations.
   */
  public readonly multiChain: boolean = false;

  /**
   * The transaction version to use for Raydium V2 transactions.
   */
  public readonly txVersion: string = 'V0';

  /**
   * The Solana connection instance for interacting with the Solana blockchain.
   */
  protected readonly connection: Connection | undefined;

  /**
   * Creates a new instance of the RaydiumV2Service.
   *
   * @param {GeniusIntentsSDKConfig} config - Configuration parameters for the service.
   *
   * @throws {SdkError} If no RPC URL is provided for the Solana blockchain.
   */
  constructor(config?: GeniusIntentsSDKConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    if (config?.rpcUrls) {
      const solanaRpcUrl = config.rpcUrls[ChainIdEnum.SOLANA];
      if (solanaRpcUrl) {
        this.connection = new Connection(solanaRpcUrl, 'confirmed');
      } else {
        logger.error('Raydium V2 Service requires a Solana RPC URL');
        throw sdkError(
          SdkErrorEnum.MISSING_RPC_URL,
          'Raydium V2 Service requires a Solana RPC URL',
        );
      }
    } else {
      logger.error('Raydium V2 Service requires an RPC URL configuration');
      throw sdkError(
        SdkErrorEnum.MISSING_RPC_URL,
        'Raydium V2 Service requires an RPC URL configuration',
      );
    }
  }

  /**
   * Checks if the provided configuration object has a valid 'solanaRpcUrl' property.
   *
   * @typeParam T - The expected shape of the configuration object, with string values.
   * @param config - The configuration object to validate.
   * @returns True if 'solanaRpcUrl' exists and is a non-empty string; otherwise, false.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['solanaRpcUrl'] === 'string' && config['solanaRpcUrl'].length > 0;
  }

  /**
   * Fetches a price quote for a token swap from the Raydium V2 API.
   *
   * @param {IntentPriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: RaydiumV2PriceResponse }>}
   * A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - The price impact of the swap.
   * - The raw response from the Raydium V2 API.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If there's an error fetching the price from Raydium V2.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<
    Omit<PriceResponse, 'protocolResponse'> & {
      protocolResponse: RaydiumV2PriceResponse;
    }
  > {
    this.validatePriceParams(params);
    const { tokenIn, tokenOut, amountIn, slippage } = params;

    try {
      const inputMint = tokenIn === NATIVE_SOL ? WRAPPED_SOL : tokenIn;
      const outputMint = tokenOut === NATIVE_SOL ? WRAPPED_SOL : tokenOut;

      logger.debug('Making Raydium V2 price request', {
        inputMint,
        outputMint,
        amountIn,
        slippage,
      });

      const priceResponse = await this.requestRaydiumV2Price({
        tokenIn: inputMint,
        tokenOut: outputMint,
        amountIn: amountIn,
        slippage,
      });

      if (!priceResponse?.success) {
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'Raydium V2 price request failed');
      }

      const amountOut = priceResponse.data.outputAmount;
      const priceImpact = priceResponse.data.priceImpactPct;

      logger.debug('Successfully received price info from Raydium V2', {
        amountOut,
        priceImpact,
      });

      return {
        protocol: ProtocolEnum.RAYDIUM_V2,
        networkIn: ChainIdEnum.SOLANA,
        networkOut: ChainIdEnum.SOLANA,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        slippage: params.slippage,
        protocolResponse: priceResponse,
        priceImpact,
      };
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the Raydium V2 API and builds the transaction data
   * needed to execute the swap on Solana.
   *
   * @param {IntentQuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse>} A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   *
   * @throws {SdkError} If the Solana connection is not initialized.
   * @throws {SdkError} If the price response is invalid or missing.
   * @throws {SdkError} If there's an error fetching token accounts.
   * @throws {SdkError} If there's an error fetching the quote from Raydium V2.
   */
  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    this.validatePriceParams(params);

    if (!this.connection) {
      logger.error('Connection not initialized');
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'Connection not initialized');
    }

    const { from } = params;
    let { priceResponse } = params;

    try {
      if (!priceResponse || !this.isRaydiumPriceResponse(priceResponse.protocolResponse)) {
        logger.debug('No valid price response provided, fetching price first');
        priceResponse = await this.fetchPrice(params);
      }

      if (!this.isRaydiumPriceResponse(priceResponse.protocolResponse)) {
        logger.error(`Invalid Raydium price response`);
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          `Invalid Raydium price response: ${JSON.stringify(priceResponse)}`,
        );
      }

      const tokenIn = priceResponse.tokenIn;
      const tokenOut = priceResponse.tokenOut;

      const isInputSol = tokenIn === NATIVE_SOL || tokenIn === WRAPPED_SOL;
      const isOutputSol = tokenOut === NATIVE_SOL || tokenOut === WRAPPED_SOL;
      const inputTokenAddress = isInputSol ? WRAPPED_SOL : tokenIn;
      const outputTokenAddress = isOutputSol ? WRAPPED_SOL : tokenOut;

      logger.debug('Fetching token accounts and compute budget tiers');
      const tokenAccountsPromise = this.fetchTokenAccountData(from, this.connection);
      const computeBudgetTiersPromise = this.requestRaydiumFees();
      const [tokenAccountsResp, computeBudgetTiers] = await Promise.all([
        tokenAccountsPromise,
        computeBudgetTiersPromise,
      ]);
      const { tokenAccounts } = tokenAccountsResp;

      const inputTokenAcc = tokenAccounts.find(
        a => a.mint.toBase58() === inputTokenAddress,
      )?.publicKey;
      const outputTokenAcc = tokenAccounts.find(
        a => a.mint.toBase58() === outputTokenAddress,
      )?.publicKey;

      if (!inputTokenAcc && !isInputSol) {
        logger.error(
          `Failed to find input token account for from address. No token account found for token: ${tokenIn} and address: ${from}`,
        );
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `Failed to find input token account for from address. No token account found for token: ${tokenIn} and address: ${from}`,
        );
      }

      logger.debug('Making Raydium V2 quote request', {
        from,
        isInputSol,
        isOutputSol,
        computeBudget: computeBudgetTiers.data.default.h,
      });

      const raydiumQuoteResponse = await this.requestRaydiumV2Quote({
        computeBudget: computeBudgetTiers.data.default.h,
        priceResponse: priceResponse.protocolResponse,
        from,
        isInputSol,
        isOutputSol,
        inputAccount: inputTokenAcc ? inputTokenAcc.toBase58() : undefined,
        outputAccount: outputTokenAcc ? outputTokenAcc.toBase58() : undefined,
      });

      const data = raydiumQuoteResponse.data[0];
      if (!data) {
        logger.error(`Failed to fetch quote from Raydium, no data found in Raydium response`);
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `Failed to fetch quote from Raydium, no data found in Raydium response`,
        );
      }

      const swapTransaction = data.transaction;
      const encodedTransaction = convertBase64ToBase58(swapTransaction);

      logger.debug('Successfully received quote from Raydium V2');

      const swapQuoteResponse: QuoteResponse = {
        protocol: ProtocolEnum.RAYDIUM_V2,
        tokenIn: priceResponse.tokenIn,
        tokenOut: priceResponse.tokenOut,
        amountIn: priceResponse.amountIn,
        amountOut: priceResponse.amountOut,
        from,
        receiver: from,
        networkIn: ChainIdEnum.SOLANA,
        networkOut: ChainIdEnum.SOLANA,
        slippage: priceResponse.slippage,
        protocolResponse: raydiumQuoteResponse,
        svmExecutionPayload: [encodedTransaction],
      };

      return swapQuoteResponse;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Makes a request to the Raydium V2 API to get a price quote for a token swap.
   *
   * @param {RaydiumApiPriceParams} params - The parameters for the price request.
   *
   * @returns {Promise<RaydiumV2PriceResponse>} A promise that resolves to the price response from Raydium V2.
   *
   * @throws {SdkError} If there's an error with the HTTP request to the Raydium V2 API.
   */
  public async requestRaydiumV2Price(
    params: RaydiumApiPriceParams,
  ): Promise<RaydiumV2PriceResponse> {
    const { tokenIn, tokenOut, amountIn, slippage } = params;
    const queryParams = new URLSearchParams({
      inputMint: tokenIn,
      outputMint: tokenOut,
      amount: amountIn,
      slippageBps: (slippage * 100).toString(),
      txVersion: this.txVersion,
    });

    const url = `${API_URLS.SWAP_HOST}/compute/swap-base-in?${queryParams}`;
    logger.debug(`Making Raydium V2 price request to: ${url}`);

    try {
      const response = await axios.get<RaydiumV2PriceResponse>(url);

      if (response.status !== 200) {
        throw sdkError(SdkErrorEnum.FAILED_HTTP_REQUEST, `HTTP error! status: ${response.status}`);
      }

      return response.data;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.FAILED_HTTP_REQUEST, formattedError);
    }
  }

  /**
   * Makes a request to the Raydium V2 API to get a transaction quote for a token swap.
   *
   * @param {RaydiumApiQuoteParams} params - The parameters for the quote request.
   *
   * @returns {Promise<RaydiumV2QuoteResponse>} A promise that resolves to the quote response from Raydium V2.
   *
   * @throws {SdkError} If there's an error with the HTTP request to the Raydium V2 API.
   */
  public async requestRaydiumV2Quote(
    params: RaydiumApiQuoteParams,
  ): Promise<RaydiumV2QuoteResponse> {
    const { priceResponse, from, isInputSol, isOutputSol, inputAccount, outputAccount } = params;

    const url = `${API_URLS.SWAP_HOST}/transaction/swap-base-in`;
    const requestBody = {
      computeUnitPriceMicroLamports: '0',
      swapResponse: priceResponse,
      txVersion: this.txVersion,
      wallet: from,
      wrapSol: isInputSol,
      unwrapSol: isOutputSol,
      inputAccount: inputAccount,
      outputAccount: outputAccount,
    };

    logger.debug(`Making Raydium V2 quote request to: ${url}`, requestBody);

    try {
      const response = await axios.post<RaydiumV2QuoteResponse>(url, requestBody);

      if (response.status !== 200) {
        logger.error(`Failed to fetch quote from Raydium: ${JSON.stringify(response.data)}`);
        throw sdkError(
          SdkErrorEnum.FAILED_HTTP_REQUEST,
          `Failed to fetch quote from Raydium: ${JSON.stringify(response.data)}`,
        );
      }

      return response.data;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.FAILED_HTTP_REQUEST, formattedError);
    }
  }

  /**
   * Makes a request to the Raydium V2 API to get the current fee tiers for compute budget.
   *
   * @returns {Promise<RaydiumV2FeeData>} A promise that resolves to the fee data from Raydium V2.
   *
   * @throws {SdkError} If there's an error with the HTTP request to the Raydium V2 API.
   */
  public async requestRaydiumFees(): Promise<RaydiumV2FeeData> {
    const url = `${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`;
    logger.debug(`Making Raydium V2 fees request to: ${url}`);

    try {
      const response = await axios.get<RaydiumV2FeeData>(url);

      if (response.status !== 200 || !response?.data?.success) {
        logger.error(`Failed to fetch fees from Raydium: ${JSON.stringify(response.data)}`);
        throw sdkError(SdkErrorEnum.FAILED_HTTP_REQUEST, `HTTP error! status: ${response.status}`);
      }

      return response.data;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.FAILED_HTTP_REQUEST, formattedError);
    }
  }

  /**
   * Fetches token account data for a specified owner on Solana.
   * This includes both SPL Token and Token-2022 accounts.
   *
   * @param {string} owner - The owner's public key as a string.
   * @param {Connection} connection - The Solana connection instance.
   *
   * @returns {Promise<RaydiumTokenAccountsResponse>} A promise that resolves to the token accounts data.
   *
   * @throws {SdkError} If there's an error fetching the token account data.
   */
  protected async fetchTokenAccountData(
    owner: string,
    connection: Connection,
  ): Promise<RaydiumTokenAccountsResponse> {
    try {
      logger.debug(`Fetching token account data for owner: ${owner}`);
      const ownerPublicKey = new PublicKey(owner);

      const solAccountRespPromise = connection.getAccountInfo(ownerPublicKey);
      const tokenAccountRespPromise = connection.getTokenAccountsByOwner(ownerPublicKey, {
        programId: TOKEN_PROGRAM_ID,
      });
      const token2022ReqPromise = connection.getTokenAccountsByOwner(ownerPublicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
      });

      const [solAccountResp, tokenAccountResp, token2022Req] = await Promise.all([
        solAccountRespPromise,
        tokenAccountRespPromise,
        token2022ReqPromise,
      ]);

      const tokenAccountData = parseTokenAccountResp({
        owner: ownerPublicKey,
        solAccountResp,
        tokenAccountResp: {
          context: tokenAccountResp.context,
          value: [...tokenAccountResp.value, ...token2022Req.value],
        },
      });

      return tokenAccountData;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.FAILED_HTTP_REQUEST, formattedError);
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
   * Type guard to check if a response is a valid Raydium V2 price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid Raydium V2 price response.
   */
  protected isRaydiumPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is RaydiumV2PriceResponse {
    return (
      typeof response === 'object' &&
      response !== null &&
      'id' in response &&
      'success' in response &&
      'version' in response &&
      'data' in response &&
      typeof response.data === 'object' &&
      response.data !== null &&
      'swapType' in response.data &&
      'inputMint' in response.data &&
      'inputAmount' in response.data &&
      'outputMint' in response.data &&
      'outputAmount' in response.data &&
      'otherAmountThreshold' in response.data &&
      'slippageBps' in response.data &&
      'priceImpactPct' in response.data &&
      'routePlan' in response.data
    );
  }
}
