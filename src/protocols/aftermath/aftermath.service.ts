import axios from 'axios';
import { SuiClient } from '@mysten/sui/client';

import {
  AftermathConfig,
  AftermathPriceResponse,
  AftermathSwapParams,
  AftermathTransactionData,
} from './aftermath.types';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { createErrorMessage } from '../../utils/create-error-message';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';
import { QuoteResponse } from '../../types/quote-response';
import { sdkError } from '../../utils/throw-error';

let logger: ILogger;
/**
 * The `AftermathService` class implements the IIntentProtocol interface for integrating with
 * the Aftermath Finance API on the Sui blockchain. It provides functionality for fetching price
 * quotes and generating transaction data for token swaps on the Sui network.
 *
 * @implements {IIntentProtocol}
 */
export class AftermathService implements IIntentProtocol {
  /**
   * The protocol identifier for Aftermath Finance.
   */
  public readonly protocol = ProtocolEnum.AFTERMATH;

  /**
   * The list of blockchain networks supported by the Aftermath service.
   * Currently only supports the Sui blockchain.
   */
  public readonly chains = [ChainIdEnum.SUI];

  /**
   * Indicates that the service only operates on a single blockchain.
   */
  public readonly singleChain = true;

  /**
   * Indicates that the service does not support cross-chain operations.
   */
  public readonly multiChain = false;

  /**
   * The base URL for the Aftermath API.
   */
  public readonly baseUrl: string;

  /**
   * The Sui client instance for interacting with the Sui blockchain.
   */
  protected readonly suiClient: SuiClient;

  /**
   * Default parameter overrides for quote requests to the Aftermath API.
   */
  protected readonly quoteParamOverrides: Partial<AftermathSwapParams> = {
    isSponsoredTx: false,
  };

  /**
   * Creates a new instance of the AftermathService.
   *
   * @param {GeniusIntentsSDKConfig & AftermathConfig} config - Configuration parameters for the service.
   *
   * @throws {SdkError} If no RPC URL is provided for the Sui blockchain.
   */
  constructor(config?: GeniusIntentsSDKConfig & AftermathConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    // Initialize Sui client if RPC URL is provided
    if (!config?.rpcUrls?.[ChainIdEnum.SUI]) {
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'Aftermath Service Requires an RPC Connection');
    }
    const suiRpcUrl = config.rpcUrls[ChainIdEnum.SUI];
    this.suiClient = new SuiClient({ url: suiRpcUrl });

    // Aftermath API endpoint
    this.baseUrl = config?.privateUrl || 'https://api.aftermath.finance/v1';

    this.quoteParamOverrides = {
      ...this.quoteParamOverrides,
      ...(config?.quoteParamOverrides || {}),
    };
  }

  /**
   * Checks if the provided configuration object is of the correct type by verifying
   * that it contains a non-empty string value for the 'suiRpcUrl' key.
   *
   * @typeParam T - The expected shape of the configuration object, where all values are strings.
   * @param config - The configuration object to validate.
   * @returns True if the configuration object matches type T and contains a valid 'suiRpcUrl'; otherwise, false.
   */
  public isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return typeof config['suiRpcUrl'] === 'string' && config['suiRpcUrl'].length > 0;
  }

  /**
   * Fetches a price quote for a token swap from the Aftermath API.
   *
   * @param {IntentPriceParams} params - The parameters required for the price quote.
   *
   * @returns A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - The price impact of the swap.
   * - The raw response from the Aftermath API.
   *
   * @throws {SdkError} If the networks specified are not supported.
   * @throws {SdkError} If the API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the price.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    if (params.networkIn !== ChainIdEnum.SUI || params.networkOut !== ChainIdEnum.SUI) {
      logger.error(`Aftermath only supports Sui network`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Aftermath only supports Sui network');
    }

    try {
      const requestParams = {
        coinInType: params.tokenIn,
        coinOutType: params.tokenOut,
        coinInAmount: BigInt(params.amountIn),
        slippage: params.slippage,
      };

      logger.debug(
        `Making Aftermath API price request with params: ${JSON.stringify({
          ...requestParams,
          coinInAmount: requestParams.coinInAmount.toString(),
        })}`,
      );

      const response = await axios.post<AftermathPriceResponse>(`${this.baseUrl}/quote`, {
        ...requestParams,
        coinInAmount: requestParams.coinInAmount.toString(),
      });

      const priceData = response.data;

      if (!priceData || !priceData.route) {
        logger.error(
          `Aftermath API returned invalid response`,
          new Error(JSON.stringify(priceData, null, 2)),
        );
        throw sdkError(
          SdkErrorEnum.PRICE_NOT_FOUND,
          `Aftermath API returned invalid response: ${JSON.stringify(priceData)}`,
        );
      }

      const priceResponse: PriceResponse = {
        protocol: ProtocolEnum.AFTERMATH,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: priceData.outAmount,
        slippage: params.slippage,
        priceImpact: parseFloat(priceData.spotPrice) * 100,
        protocolResponse: priceData,
      };

      return priceResponse;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the Aftermath API and builds the transaction data.
   *
   * @param {QuoteParams} params - The parameters required for the swap quote.
   *
   * @returns A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   * - Gas estimates for the transaction.
   *
   * @throws {SdkError} If the Sui client is not initialized.
   * @throws {SdkError} If the price response is invalid.
   * @throws {SdkError} If the API returns invalid transaction data.
   * @throws {SdkError} If there's an error fetching the quote.
   */
  public async fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse> {
    if (!this.suiClient) {
      throw sdkError(SdkErrorEnum.MISSING_RPC_URL, 'Sui client not initialized');
    }

    const { from, receiver } = params;
    let { priceResponse } = params;

    if (!priceResponse || !this.isAftermathPriceResponse(priceResponse.protocolResponse)) {
      priceResponse = await this.fetchPrice(params);
    }

    if (!this.isAftermathPriceResponse(priceResponse.protocolResponse)) {
      logger.error(`Invalid Aftermath price response`);
      throw sdkError(
        SdkErrorEnum.PRICE_NOT_FOUND,
        `Invalid Aftermath price response: ${JSON.stringify(priceResponse)}`,
      );
    }

    try {
      logger.debug(`Making Aftermath API quote request for swap transaction`);

      const swapParams = {
        walletAddress: from,
        completeRoute: priceResponse.protocolResponse.route,
        slippage: params.slippage,
        ...this.quoteParamOverrides,
      };

      const response = await axios.post<AftermathTransactionData>(
        `${this.baseUrl}/transaction`,
        swapParams,
      );

      if (!response.data || !response.data.transactionBlock) {
        logger.error(
          `Aftermath API returned invalid transaction data`,
          new Error(JSON.stringify(response.data, null, 2)),
        );
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `Aftermath API returned invalid transaction data: ${JSON.stringify(response.data)}`,
        );
      }

      // Get transaction bytes for gas estimation
      const txBytes = response.data.transactionBlock;

      // Estimate gas if needed
      let gasEstimate = '0';
      try {
        const dryRunResult = await this.suiClient.dryRunTransactionBlock({
          transactionBlock: txBytes,
        });

        const computationCost = dryRunResult.effects.gasUsed.computationCost;
        const storageCost = dryRunResult.effects.gasUsed.storageCost;
        const storageRebate = dryRunResult.effects.gasUsed.storageRebate;

        gasEstimate = (
          BigInt(computationCost) +
          BigInt(storageCost) -
          BigInt(storageRebate)
        ).toString();
      } catch (error) {
        logger.warn(`Failed to estimate gas for Aftermath transaction`, {
          error,
        });
      }

      const quoteResponse: QuoteResponse = {
        protocol: ProtocolEnum.AFTERMATH,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: priceResponse.tokenIn,
        tokenOut: priceResponse.tokenOut,
        amountIn: priceResponse.amountIn,
        amountOut: priceResponse.amountOut,
        from,
        receiver: receiver || from,
        slippage: priceResponse.slippage,
        priceImpact: priceResponse.priceImpact,
        estimatedGas: gasEstimate,
        svmExecutionPayload: [txBytes],
        protocolResponse: { transactions: [txBytes] },
      };

      return quoteResponse;
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Type guard to check if a response is a valid Aftermath price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid Aftermath price response.
   */
  protected isAftermathPriceResponse(
    response: RawProtocolPriceResponse,
  ): response is AftermathPriceResponse {
    return response && 'route' in response && 'outAmount' in response;
  }
}
