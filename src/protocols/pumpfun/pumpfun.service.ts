import {
  Keypair,
  MessageV0,
  PublicKey,
  Transaction,
  VersionedTransaction,
  Connection,
} from '@solana/web3.js';
import { BondingCurveAccount, PumpFunSDK } from 'pumpdotfun-sdk';
import bs58 from 'bs58';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { IntentPriceParams } from '../../types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { IntentsSDKConfig } from '../../types/sdk-config';
import { SOL_NATIVE_ADDRESS } from '../../utils/constants';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import { PumpFunConfig } from './pumpfun.types';

// Simplified PumpFun response types
export type PumpFunPriceResponse = {
  // Direct operations (SOL ⟷ Pumpfun)
  tokenMint: string;
  tokenAmount: string;
  solAmount: string;
  operation: 'buy' | 'sell';
  feeBasisPoint: string;
};

export type PumpFunQuoteResponse = {
  transactions: string[];
};

let logger: ILogger;

export class PumpFunService implements IIntentProtocol {
  public readonly protocol = ProtocolEnum.PUMPFUN;
  public readonly chains = [ChainIdEnum.SOLANA];
  public readonly singleChain = true;
  public readonly multiChain = false;

  protected readonly anchorProvider: {
    connection: Connection;
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
    signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
  };

  protected readonly connection: Connection;
  protected sdk: PumpFunSDK;

  constructor(config: IntentsSDKConfig & PumpFunConfig) {
    // Configure logging
    if (config.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    } else if (config.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    this.connection = new Connection(config.solanaRpcUrl, 'confirmed');

    // Initialize the anchor provider with a random keypair
    const keyPair = Keypair.generate();
    this.anchorProvider = {
      connection: this.connection,
      publicKey: keyPair.publicKey,
      signTransaction: async (tx: Transaction): Promise<Transaction> => {
        tx.partialSign(keyPair);
        return tx;
      },
      signAllTransactions: async (txs: Transaction[]): Promise<Transaction[]> => {
        return txs.map(tx => {
          tx.partialSign(keyPair);
          return tx;
        });
      },
    };

    try {
      this.sdk = new PumpFunSDK(this.anchorProvider);
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error('Failed to initialize PumpFun SDK', errorMessageError);
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `Failed to initialize PumpFun SDK, error: ${errorMessage}`,
      );
    }
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['solanaRpcUrl'] === 'string' && config['solanaRpcUrl'].length > 0;
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    // Validate networks
    if (params.networkIn !== ChainIdEnum.SOLANA || params.networkOut !== ChainIdEnum.SOLANA) {
      logger.error(`PumpFun only supports Solana network`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'PumpFun only supports Solana network');
    }

    try {
      // Ensure one token is SOL and the other is a PumpFun token
      const tokenIn = params.tokenIn;
      const tokenOut = params.tokenOut;

      // Check if one token is SOL
      const tokenInIsSol = tokenIn === SOL_NATIVE_ADDRESS;
      const tokenOutIsSol = tokenOut === SOL_NATIVE_ADDRESS;

      if (!tokenInIsSol && !tokenOutIsSol) {
        throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'PumpFun swaps require one token to be SOL');
      }

      // Get the non-SOL token to check if it has a bonding curve
      const tokenToCheck = tokenInIsSol ? tokenOut : tokenIn;
      const tokenPk = new PublicKey(tokenToCheck);

      // Get bonding curve for the non-SOL token
      const bondingCurve = await this.getBondingCurveAccount(tokenPk);

      if (!bondingCurve) {
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          `Token ${tokenToCheck} does not have a PumpFun bonding curve`,
        );
      }

      // Determine operation (buy = SOL to Token, sell = Token to SOL)
      const operation = tokenInIsSol ? 'buy' : 'sell';
      const { amountIn, slippage } = params;
      const slippageBps = slippage * 100;

      // Calculate amounts based on operation
      let solAmount: bigint, tokenAmount: bigint;

      if (operation === 'buy') {
        // Buy operation: SOL -> PumpFun token
        solAmount = BigInt(amountIn);
        tokenAmount = bondingCurve.getBuyPrice(solAmount);
      } else {
        // Sell operation: PumpFun token -> SOL
        tokenAmount = BigInt(amountIn);
        solAmount = bondingCurve.getSellPrice(tokenAmount, BigInt(slippageBps));
      }

      if (!solAmount || !tokenAmount) {
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          'Failed to calculate price from bonding curve',
        );
      }

      // Prepare response
      const priceInfo: PumpFunPriceResponse = {
        tokenMint: tokenPk.toBase58(),
        tokenAmount: tokenAmount.toString(),
        solAmount: solAmount.toString(),
        operation,
        feeBasisPoint: slippageBps.toString(),
      };

      return {
        protocol: ProtocolEnum.PUMPFUN,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: operation === 'buy' ? tokenAmount.toString() : solAmount.toString(),
        slippage: params.slippage,
        protocolResponse: priceInfo,
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch swap price from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Failed to fetch PumpFun price, error: ${errorMessage}`,
      );
    }
  }

  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    if (!this.connection) {
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'Connection not initialized');
    }

    const { from, receiver } = params;
    let { priceResponse } = params;

    // If no price response provided, fetch it
    if (!priceResponse) {
      priceResponse = await this.fetchPrice(params);
    }

    if (!this.isPumpFunPriceResponse(priceResponse.protocolResponse)) {
      logger.error(`Invalid PumpFun price response`);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Invalid PumpFun price response: ${JSON.stringify(priceResponse)}`,
      );
    }

    try {
      const pumpfunPrice = priceResponse.protocolResponse as PumpFunPriceResponse;
      const operation = pumpfunPrice.operation;
      const tokenMint = new PublicKey(pumpfunPrice.tokenMint);

      // Get fee recipient account
      const global = await this.sdk.getGlobalAccount();
      const feeRecipientAccount = global.feeRecipient;

      // Get latest blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();

      let instructions;
      if (operation === 'buy') {
        // Buy instructions: spending SOL to get tokens
        instructions = await this.sdk.getBuyInstructions(
          new PublicKey(from),
          tokenMint,
          feeRecipientAccount,
          BigInt(pumpfunPrice.tokenAmount), // amount of tokens to receive
          BigInt(pumpfunPrice.solAmount), // amount of SOL to spend
        );
      } else {
        // Sell instructions: spending tokens to get SOL
        instructions = await this.sdk.getSellInstructions(
          new PublicKey(from),
          tokenMint,
          feeRecipientAccount,
          BigInt(pumpfunPrice.tokenAmount), // amount of tokens to sell
          BigInt(pumpfunPrice.solAmount), // minimum amount of SOL to receive
        );
      }

      // Create versioned transaction
      instructions.recentBlockhash = blockhash;
      instructions.feePayer = new PublicKey(from);
      const messageV0 = new MessageV0(instructions.compileMessage());
      const versionedTransaction = new VersionedTransaction(messageV0);
      const encodedTransaction = bs58.encode(versionedTransaction.serialize());

      // Prepare response
      const pumpFunQuoteResponse: PumpFunQuoteResponse = {
        transactions: [encodedTransaction],
      };

      return {
        protocol: ProtocolEnum.PUMPFUN,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: priceResponse.tokenIn,
        tokenOut: priceResponse.tokenOut,
        amountIn: priceResponse.amountIn,
        amountOut: priceResponse.amountOut,
        from,
        receiver: receiver || from,
        slippage: params.slippage,
        executionPayload: {
          transactionData: [encodedTransaction],
        },
        protocolResponse: pumpFunQuoteResponse,
      };
    } catch (error) {
      const { errorMessage, errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to fetch quote from ${this.protocol}`, errorMessageError);
      throw sdkError(
        SdkErrorEnum.QUOTE_NOT_FOUND,
        `Failed to fetch PumpFun quote, error: ${errorMessage}`,
      );
    }
  }

  // Helper: Get bonding curve account for a token
  protected async getBondingCurveAccount(
    tokenMint: PublicKey,
  ): Promise<BondingCurveAccount | null> {
    try {
      const bondingCurveAccount = await this.sdk?.getBondingCurveAccount(tokenMint);
      return bondingCurveAccount || null;
    } catch (error) {
      const { errorMessageError } = createErrorMessage(error);
      logger.error(`Failed to get bonding curve for ${tokenMint.toBase58()}`, errorMessageError);
      return null;
    }
  }

  // Helper: Check if a response is a PumpFun price response
  protected isPumpFunPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is PumpFunPriceResponse {
    return (
      response &&
      'operation' in response &&
      'tokenMint' in response &&
      'tokenAmount' in response &&
      'solAmount' in response
    );
  }
}
