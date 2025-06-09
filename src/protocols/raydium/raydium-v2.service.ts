import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { RaydiumApiPriceParams, RaydiumApiQuoteParams, RaydiumSdkConfig } from './raydium-v2.types';
import {
  RaydiumV2PriceResponse,
  RaydiumV2QuoteResponse,
  RaydiumV2FeeData,
  RaydiumTokenAccountsResponse,
} from './raydium-v2.types';
import { NATIVE_SOL, WRAPPED_SOL } from '../../utils/constants';
import { sdkError } from '../../utils/throw-error';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { Connection, PublicKey } from '@solana/web3.js';
import { IntentsSDKConfig } from '../../types/sdk-config';
import axios from 'axios';
import { API_URLS, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2';
import { convertBase64ToBase58 } from '../../utils/base64-to-base58';
import { createErrorMessage } from '../../utils/create-error-message';

let logger: ILogger;
export class RaydiumV2Service implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.RAYDIUM_V2;
  public readonly chains = [ChainIdEnum.SOLANA];

  public readonly singleChain: boolean = true;
  public readonly multiChain: boolean = false;

  public readonly txVersion: string = 'V0';

  protected readonly connection: Connection | undefined;

  constructor(config: IntentsSDKConfig & RaydiumSdkConfig) {
    if (config.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['solanaRpcUrl'] === 'string' && config['solanaRpcUrl'].length > 0;
  }

  public async fetchPrice(
    params: IntentPriceParams,
  ): Promise<
    Omit<PriceResponse, 'protocolResponse'> & { protocolResponse: RaydiumV2PriceResponse }
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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch Raydium V2 swap price`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch Raydium V2 swap price, error: ${errorMessage}`,
      );
    }
  }

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

      return {
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
        executionPayload: {
          transactionData: [encodedTransaction],
        },
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch Raydium V2 quote, error: ${errorMessage}`,
      );
    }
  }

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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error('Failed to request Raydium V2 price', errorMessageError);
      throw sdkError(
        SdkErrorEnum.FAILED_HTTP_REQUEST,
        `Failed to request Raydium V2 price: ${errorMessage}`,
      );
    }
  }

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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error('Failed to request Raydium V2 quote', errorMessageError);
      throw sdkError(
        SdkErrorEnum.FAILED_HTTP_REQUEST,
        `Failed to request Raydium V2 quote: ${errorMessage}`,
      );
    }
  }

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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error('Failed to request Raydium fees', errorMessageError);
      throw sdkError(
        SdkErrorEnum.FAILED_HTTP_REQUEST,
        `Failed to request Raydium fees: ${errorMessage}`,
      );
    }
  }

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
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch token account data`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.FAILED_HTTP_REQUEST,
        `Failed to fetch token account data: ${errorMessage}`,
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
