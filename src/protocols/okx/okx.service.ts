import {
  TransactionInstruction,
  PublicKey,
  AddressLookupTableAccount,
  TransactionMessage,
  VersionedTransaction,
  Connection,
} from '@solana/web3.js';
import axios from 'axios';
import * as crypto from 'crypto';
import bs58 from 'bs58';

import {
  OKXConfig,
  OKXCredentials,
  OkxEvmQuoteToExecutionPayloadParams,
  OkxPriceRequestBody,
  OkxPriceResponse,
  OkxQuoteRequestBody,
  OkxQuoteResponse,
  OkxSignatureParams,
  OkxSignatureResponse,
  OkxSolanaQuoteResponse,
  OkxSolanaQuoteToExecutionPayloadParams,
} from './okx.types';
import {
  EvmQuoteExecutionPayload,
  SvmQuoteExecutionPayload,
} from '../../types/quote-execution-payload';
import { PriceResponse, RawProtocolPriceResponse } from '../../types/price-response';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { QuoteResponse } from '../../types/quote-response';
import { formatAddress } from '../../utils/address';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { NATIVE_ADDRESS, NATIVE_SOL } from '../../utils/constants';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import { isEVMNetwork, isSolanaNetwork } from '../../utils/check-vm';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';

let logger: ILogger;
/**
 * The `OkxService` class implements the IIntentProtocol interface for token swaps
 * using the OKX DEX aggregator. It provides functionality for fetching price quotes
 * and generating transaction data for token swaps on various EVM-compatible blockchains.
 *
 * @implements {IIntentProtocol}
 */
export class OkxService implements IIntentProtocol {
  /**
   * Credentials required for authenticating with the OKX API.
   */
  public readonly okxCredentials: OKXCredentials = {
    apiKey: '',
    secretKey: '',
    passphrase: '',
    projectId: '',
  };

  /**
   * The protocol identifier for OKX.
   */
  public readonly protocol = ProtocolEnum.OKX;

  /**
   * The list of blockchain networks supported by the OKX service.
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
   * The base URL for the OKX API.
   */
  public readonly baseUrl: string;

  /**
   * The endpoint for price quote requests.
   */
  public readonly priceEndpoint: string = '/api/v5/dex/aggregator/quote';

  /**
   * The endpoint for transaction quote requests.
   */
  public readonly quoteEndpoint: string = '/api/v5/dex/aggregator/swap';

  /**
   * The endpoint for Solana quote requests.
   */
  public readonly solanaQuoteEndpoint: string = '/api/v5/dex/aggregator/swap-instruction';

  /**
   * The chain ID used by OKX for solana
   */
  public readonly solanaChainId: string = '501';

  /**
   * Used to create the OKX service instance, cannot quote Solana unless provided
   */
  public readonly solanaRpcUrl: string | undefined;

  /**
   * The Solana client instance for interacting with the Solana blockchain.
   */
  public readonly solanaClient: Connection | undefined;

  /**
   * Mapping of chain IDs to their respective approval contract addresses.
   */
  public readonly approvalContracts: Record<number, string> = {
    [ChainIdEnum.ETHEREUM]: '0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f',
    [ChainIdEnum.ARBITRUM]: '0x70cBb871E8f30Fc8Ce23609E9E0Ea87B6b222F58',
    [ChainIdEnum.OPTIMISM]: '0x68D6B739D2020067D1e2F713b999dA97E4d54812',
    [ChainIdEnum.POLYGON]: '0x3B86917369B83a6892f553609F3c2F439C184e31',
    [ChainIdEnum.BSC]: '0x2c34A2Fb1d0b4f55de51E1d0bDEfaDDce6b7cDD6',
    [ChainIdEnum.AVALANCHE]: '0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f',
    [ChainIdEnum.BASE]: '0x57df6092665eb6058DE53939612413ff4B09114E',
    [ChainIdEnum.SONIC]: '0xd321ab5589d3e8fa5df985ccfef625022e2dd910',
  };

  /**
   * Creates a new instance of the OkxService.
   *
   * @param {SDKConfig & OKXConfig} config - Configuration parameters for the service, including OKX API credentials.
   *
   * @throws {SdkError} If OKX credentials are missing or incomplete.
   */
  constructor(config: GeniusIntentsSDKConfig & OKXConfig) {
    const { okxApiKey, okxSecretKey, okxPassphrase, okxProjectId } = config;
    if (!okxSecretKey || !okxApiKey || !okxPassphrase || !okxProjectId) {
      throw sdkError(
        SdkErrorEnum.MISSING_INITIALIZATION,
        'Missing OKX Secret Key || Apikey || Passphrase || ProjectId',
      );
    }
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();
    this.baseUrl = config?.okxPrivateUrl || 'https://www.okx.com';

    this.okxCredentials = {
      apiKey: okxApiKey,
      secretKey: okxSecretKey,
      passphrase: okxPassphrase,
      projectId: okxProjectId,
    };

    this.solanaRpcUrl = config?.solanaRpcUrl;
    if (this.solanaRpcUrl) {
      this.solanaClient = new Connection(this.solanaRpcUrl);
    }
  }

  /**
   * Fetches a price quote for a token swap from the OKX API.
   *
   * @param {PriceParams} params - The parameters required for the price quote.
   *
   * @returns {Promise<PriceResponse>} A promise that resolves to a `PriceResponse` object containing:
   * - The amount of output tokens expected from the swap.
   * - Gas estimation for the transaction.
   * - The raw response from the OKX API.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the price.
   */
  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    this.validatePriceParams(params);

    const requestBody = this.priceParamsToRequestBody(params);
    logger.debug('Generated OKX price request body', requestBody);

    try {
      const priceUrlParams = new URLSearchParams(requestBody as unknown as Record<string, string>);
      const { signature, timestamp } = this.calculateSignature({
        method: 'GET',
        requestPath: `${this.priceEndpoint}?${priceUrlParams}`,
      });

      const url = `${this.baseUrl}${this.priceEndpoint}?${priceUrlParams.toString()}`;
      logger.debug(`Making request to OKX API: ${url}`);

      const headers: Record<string, string> = {};
      headers['OK-ACCESS-KEY'] = this.okxCredentials.apiKey || '';
      headers['OK-ACCESS-SIGN'] = signature;
      headers['OK-ACCESS-TIMESTAMP'] = timestamp;
      headers['OK-ACCESS-PASSPHRASE'] = this.okxCredentials.passphrase || '';
      headers['OK-ACCESS-PROJECT'] = this.okxCredentials.projectId || '';

      const response = await axios.get<OkxPriceResponse>(url, { headers });

      const okxPriceResponse = response.data;

      if (
        !okxPriceResponse ||
        !okxPriceResponse.data ||
        okxPriceResponse.data.length === 0 ||
        !okxPriceResponse?.data?.[0]?.toTokenAmount
      ) {
        logger.error('Invalid response received from OKX API', undefined, {
          okxPriceResponse,
        });
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'Invalid response received from OKX API');
      }

      logger.debug('Successfully received price info from OKX', {
        amountOut: okxPriceResponse.data[0].toTokenAmount,
        gasEstimate: okxPriceResponse.data[0].estimateGasFee,
      });

      const amountOut = okxPriceResponse.data[0].toTokenAmount;

      if (!amountOut) {
        logger.error('No output amount received from OKX', undefined, {
          okxPriceResponse,
        });
        throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, 'No output amount received from OKX');
      }

      return {
        protocol: this.protocol,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut: amountOut ?? '',
        estimatedGas: okxPriceResponse?.data?.[0].estimateGasFee,
        protocolResponse: okxPriceResponse,
        slippage: params.slippage,
      };
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);
      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Fetches a swap quote from the OKX API and builds the transaction data
   * needed to execute the swap.
   *
   * @param {QuoteParams} params - The parameters required for the swap quote.
   *
   * @returns {Promise<QuoteResponse & { protocolResponse: OkxQuoteResponse }>}
   * A promise that resolves to a `QuoteResponse` object containing:
   * - The expected amount of output tokens.
   * - The transaction data needed to execute the swap.
   * - Gas estimates for the transaction.
   *
   * @throws {SdkError} If the parameters are invalid or unsupported.
   * @throws {SdkError} If the API returns an invalid response.
   * @throws {SdkError} If there's an error fetching the quote.
   */
  public async fetchQuote(params: IntentQuoteParams): Promise<
    QuoteResponse & {
      protocolResponse: OkxQuoteResponse | OkxSolanaQuoteResponse;
    }
  > {
    logger.info(`Fetching swap quote for address: ${params.from}`);
    this.validatePriceParams(params);
    let { from, receiver, tokenIn, tokenOut, amountIn, networkIn, networkOut } = params;

    const requestBody = this.quoteParamsToRequestBody(params);
    logger.debug('Generated OKX quote request body', requestBody);

    const quoteEndpoint = isSolanaNetwork(networkIn)
      ? this.solanaQuoteEndpoint
      : this.quoteEndpoint;

    try {
      const quoteUrlParams = new URLSearchParams(requestBody as unknown as Record<string, string>);
      const { signature, timestamp } = this.calculateSignature({
        method: 'GET',
        requestPath: `${quoteEndpoint}?${quoteUrlParams}`,
      });

      const url = `${this.baseUrl}${quoteEndpoint}?${quoteUrlParams.toString()}`;
      logger.debug(`Making request to OKX quote API: ${url}`);

      const headers: Record<string, string> = {};
      headers['OK-ACCESS-KEY'] = this.okxCredentials.apiKey || '';
      headers['OK-ACCESS-SIGN'] = signature;
      headers['OK-ACCESS-TIMESTAMP'] = timestamp;
      headers['OK-ACCESS-PASSPHRASE'] = this.okxCredentials.passphrase || '';
      headers['OK-ACCESS-PROJECT'] = this.okxCredentials.projectId || '';

      const response = await axios.get<OkxQuoteResponse | OkxSolanaQuoteResponse>(url, { headers });

      const isEvm = isEVMNetwork(networkIn);
      const okxQuoteResponse = response.data;

      if (
        !okxQuoteResponse ||
        !(
          Array.isArray((okxQuoteResponse as OkxQuoteResponse).data) &&
          (okxQuoteResponse as OkxQuoteResponse).data.length > 0
        )
      ) {
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          okxQuoteResponse?.msg ?? `No quote returned from OKX`,
        );
      }

      const executionPayload: EvmQuoteExecutionPayload | SvmQuoteExecutionPayload = isEvm
        ? this.okxEvmQuoteResponseToExecutionPayload({
            tokenIn,
            amountIn,
            networkIn,
            response: okxQuoteResponse as OkxQuoteResponse,
          })
        : await this.okxSolanaQuoteResponseToExecutionPayload({
            from,
            response: okxQuoteResponse as OkxSolanaQuoteResponse,
          });

      logger.debug('Successfully received quote info from OKX');

      let amountOut: string | undefined = undefined;
      if (isEvm) {
        // Additional processing for EVM networks
        if (Array.isArray(okxQuoteResponse.data)) {
          amountOut =
            okxQuoteResponse.data[0] &&
            okxQuoteResponse.data[0].routerResult &&
            typeof okxQuoteResponse.data[0].routerResult.toTokenAmount === 'string'
              ? okxQuoteResponse.data[0].routerResult.toTokenAmount
              : undefined;
        } else if (
          typeof okxQuoteResponse.data === 'object' &&
          okxQuoteResponse.data !== null &&
          'routerResult' in okxQuoteResponse.data &&
          (okxQuoteResponse.data as { routerResult?: { toTokenAmount?: string } }).routerResult &&
          typeof (okxQuoteResponse.data as { routerResult?: { toTokenAmount?: string } })
            .routerResult?.toTokenAmount === 'string'
        ) {
          amountOut = (okxQuoteResponse.data as { routerResult: { toTokenAmount: string } })
            .routerResult.toTokenAmount;
        } else {
          throw sdkError(
            SdkErrorEnum.QUOTE_NOT_FOUND,
            'No valid routerResult.toTokenAmount found in OKX response',
          );
        }
      } else {
        // Have to fetch the price if we are on solana to determine the amount out
        // const priceResponse = await this.fetchPrice({
        //   ...params,
        //   networkIn: Number(this.solanaChainId),
        //   networkOut: Number(this.solanaChainId),
        // });
        const quoteEndpoint = this.quoteEndpoint;
        const quoteUrlParams = new URLSearchParams({
          ...requestBody,
          chainId: Number(this.solanaChainId),
        } as unknown as Record<string, string>);
        const { signature, timestamp } = this.calculateSignature({
          method: 'GET',
          requestPath: `${quoteEndpoint}?${quoteUrlParams}`,
        });

        const url = `${this.baseUrl}${quoteEndpoint}?${quoteUrlParams.toString()}`;
        logger.debug(`Making request to OKX quote API: ${url}`);

        const response = await axios.get<OkxQuoteResponse | OkxSolanaQuoteResponse>(url, {
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'OK-ACCESS-KEY': this.okxCredentials.apiKey,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'OK-ACCESS-SIGN': signature,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'OK-ACCESS-TIMESTAMP': timestamp,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'OK-ACCESS-PASSPHRASE': this.okxCredentials.passphrase,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'OK-ACCESS-PROJECT': this.okxCredentials.projectId,
          },
        });

        if (Array.isArray(response.data.data)) {
          amountOut =
            response.data.data &&
            Array.isArray(response.data.data) &&
            response.data.data[0] &&
            response.data.data[0].routerResult &&
            typeof response.data.data[0].routerResult.toTokenAmount === 'string'
              ? response.data.data[0].routerResult.toTokenAmount
              : undefined;
        } else if (
          typeof response.data.data === 'object' &&
          response.data.data !== null &&
          'routerResult' in response.data.data &&
          (response.data.data as { routerResult?: { toTokenAmount?: string } }).routerResult &&
          typeof (response.data.data as { routerResult?: { toTokenAmount?: string } }).routerResult
            ?.toTokenAmount === 'string'
        ) {
          amountOut = (response.data.data as { routerResult: { toTokenAmount: string } })
            .routerResult.toTokenAmount;
        } else {
          throw sdkError(
            SdkErrorEnum.QUOTE_NOT_FOUND,
            'No valid routerResult.toTokenAmount found in OKX response',
          );
        }
      }

      const executionPayloadKey = isEVMNetwork(params.networkIn)
        ? 'evmExecutionPayload'
        : 'svmExecutionPayload';

      return {
        protocol: this.protocol,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: amountOut ?? '',
        from,
        receiver: receiver || from,
        [executionPayloadKey]: executionPayload,
        slippage: params.slippage >= 1 ? params.slippage / 100 : params.slippage,
        networkIn,
        networkOut,
        protocolResponse: okxQuoteResponse,
      };
    } catch (error) {
      const formattedError = createErrorMessage(error, this.protocol);
      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  protected okxEvmQuoteResponseToExecutionPayload(
    params: OkxEvmQuoteToExecutionPayloadParams,
  ): EvmQuoteExecutionPayload {
    const { tokenIn, amountIn, response, networkIn } = params;

    if (
      !response ||
      !response.data ||
      response.data.length === 0 ||
      !response?.data?.[0]?.routerResult?.toTokenAmount
    ) {
      logger.error('Invalid quote response received from OKX', undefined, {
        okxQuoteResponse: response,
      });
      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, 'Invalid quote response received from OKX');
    }

    const gasEstimate = response.data[0].tx.gas;
    const gasLimit = response.data[0].tx.gasLimit || (Number(gasEstimate) * 1.1).toString(); // 10% buffer if gasLimit not provided

    const executionPayload = {
      transactionData: {
        data: response?.data?.[0].tx.data,
        to: response?.data?.[0].tx.to,
        value: isNative(tokenIn) ? amountIn : response?.data?.[0].tx.value,
        gasEstimate,
        gasLimit,
      },
      approval: {
        spender: this.approvalContracts[networkIn] || '',
        token: tokenIn,
        amount: response?.data?.[0].routerResult.fromTokenAmount,
      },
    };

    return executionPayload;
  }

  protected async okxSolanaQuoteResponseToExecutionPayload(
    params: OkxSolanaQuoteToExecutionPayloadParams,
  ): Promise<SvmQuoteExecutionPayload> {
    const { from, response } = params;
    const { data } = response;

    try {
      // 1. Create TransactionInstructions with validation
      const instructions: TransactionInstruction[] = [];

      for (let i = 0; i < data.instructionLists.length; i++) {
        const instruction = data?.instructionLists[i];

        if (!instruction) {
          throw new Error(`Invalid instruction at index ${i}`);
        }

        try {
          // Validate programId
          const programId = new PublicKey(instruction.programId);

          // Validate and decode data
          let instructionData: Buffer;
          try {
            instructionData = Buffer.from(instruction.data, 'base64');
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (error) {
            throw new Error(`Invalid instruction data at index ${i}`);
          }

          // Process accounts with validation
          const keys =
            instruction.accounts && Array.isArray(instruction.accounts)
              ? instruction.accounts
                  .filter((account: unknown) => account != null)
                  .map((account: unknown, accountIndex: unknown) => {
                    try {
                      if (
                        typeof account === 'object' &&
                        account !== null &&
                        'pubkey' in account &&
                        'isSigner' in account &&
                        'isWritable' in account
                      ) {
                        return {
                          pubkey: new PublicKey((account as { pubkey: string }).pubkey),
                          isSigner: (account as { isSigner: boolean }).isSigner,
                          isWritable: (account as { isWritable: boolean }).isWritable,
                        };
                      } else {
                        throw new Error(
                          `Account at instruction ${i}, account ${accountIndex} is not valid`,
                        );
                      }
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    } catch (error) {
                      throw new Error(
                        `Invalid pubkey at instruction ${i}, account ${accountIndex}`,
                      );
                    }
                  })
              : [];

          instructions.push(
            new TransactionInstruction({
              programId,
              data: instructionData,
              keys,
            }),
          );
        } catch (error) {
          throw error;
        }
      }

      // 2. Fetch Address Lookup Table Accounts with better error handling
      let addressLookupTableAccounts: AddressLookupTableAccount[] = [];
      // Handle both possible field names from OKX API
      const addressLookupTableAddresses =
        data?.addressLookupTableAddresses ?? data?.addressLookupTableAccount ?? [];

      if (addressLookupTableAddresses && addressLookupTableAddresses.length > 0) {
        try {
          const lookupTablePromises = addressLookupTableAddresses.map(async (address: string) => {
            try {
              if (!this.solanaClient) {
                throw new Error('Solana client must be initialized to fetch address lookup tables');
              }

              const lookupTableAccount = await this.solanaClient.getAddressLookupTable(
                new PublicKey(address),
              );
              return lookupTableAccount.value;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (error) {
              return null;
            }
          });

          const lookupTables = await Promise.all(lookupTablePromises);
          addressLookupTableAccounts = lookupTables.filter(
            table => table !== null,
          ) as AddressLookupTableAccount[];
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Continue without lookup tables - this might cause the transaction to be larger
          addressLookupTableAccounts = [];
        }
      } else {
      }

      const payerPublicKey = new PublicKey(from);

      if (!this.solanaClient) {
        throw new Error('Solana client must be initialized to fetch recent blockhash');
      }

      const recentBlockhash = (await this.solanaClient.getLatestBlockhash()).blockhash;

      // Calculate approximate transaction size before creating
      const approximateSize = this._estimateTransactionSize(
        instructions,
        addressLookupTableAccounts,
      );

      if (approximateSize > 1232) {
        logger.debug(
          `Transaction size exceeds 1232 bytes: ${approximateSize} bytes. This may cause issues with the transaction.`,
        );
      }

      // 3. Create the TransactionMessage with error handling
      let messageV0;
      try {
        const transactionMessage = new TransactionMessage({
          payerKey: payerPublicKey,
          recentBlockhash: recentBlockhash,
          instructions: instructions,
        });

        messageV0 = transactionMessage.compileToV0Message(
          addressLookupTableAccounts.length > 0 ? addressLookupTableAccounts : undefined,
        );
      } catch (error) {
        // Try without lookup tables as fallback
        if (addressLookupTableAccounts.length > 0) {
          try {
            const transactionMessage = new TransactionMessage({
              payerKey: payerPublicKey,
              recentBlockhash: recentBlockhash,
              instructions: instructions,
            });
            messageV0 = transactionMessage.compileToV0Message();
          } catch (fallbackError) {
            throw fallbackError;
          }
        } else {
          throw error;
        }
      }

      // 4. Create the VersionedTransaction
      const versionedTransaction = new VersionedTransaction(messageV0);

      // 5. Serialize and encode to bs58 string
      const serializedTransaction = versionedTransaction.serialize();
      const bs58EncodedTransaction = bs58.encode(serializedTransaction);

      const executionPayload: SvmQuoteExecutionPayload = [bs58EncodedTransaction];

      return executionPayload;
    } catch (error) {
      throw error;
    }
  }

  // Helper method to estimate transaction size
  private _estimateTransactionSize(
    instructions: TransactionInstruction[],
    lookupTables: AddressLookupTableAccount[],
  ): number {
    // Very rough estimation
    let size = 64; // Base transaction overhead

    instructions.forEach(ix => {
      size += 1; // Program ID index
      size += 1; // Accounts length
      size += ix.keys.length; // Account indices
      size += 4; // Data length
      size += ix.data.length; // Data
    });

    // Account for lookup tables
    if (lookupTables.length > 0) {
      size += lookupTables.length * 32; // Lookup table addresses
    }

    return size;
  }

  /**
   * Transforms the price parameters to the format expected by the OKX API.
   *
   * @param {IntentPriceParams} params - The original price parameters.
   *
   * @returns {OkxPriceRequestBody} The transformed parameters ready for the OKX API.
   */
  protected priceParamsToRequestBody(params: IntentPriceParams): OkxPriceRequestBody {
    const { tokenIn, tokenOut, amountIn, networkIn } = params;

    logger.debug('Converting price params to OKX request body', { params });

    const requestBody: OkxPriceRequestBody = {
      amount: amountIn.toString(),
      chainId: networkIn.toString(),
      fromTokenAddress: isNative(tokenIn) ? NATIVE_ADDRESS : formatAddress(tokenIn),
      toTokenAddress: isNative(tokenOut) ? NATIVE_ADDRESS : formatAddress(tokenOut),
    };

    logger.debug('Generated OKX request body', requestBody);
    return requestBody;
  }

  /**
   * Transforms the quote parameters to the format expected by the OKX API.
   *
   * @param {QuoteParams} params - The original quote parameters.
   *
   * @returns {OkxQuoteRequestBody} The transformed parameters ready for the OKX API.
   */
  protected quoteParamsToRequestBody(params: IntentQuoteParams): OkxQuoteRequestBody {
    const { tokenIn, tokenOut, amountIn, networkIn, from, receiver } = params;

    const isEvm = isEVMNetwork(networkIn);
    const tokenOutIsNative = isNative(tokenOut);
    const tokenInIsNative = isNative(tokenIn);
    const networkNativeAddress = isEvm ? NATIVE_ADDRESS : NATIVE_SOL;

    const tokenInToUse = tokenInIsNative ? networkNativeAddress : formatAddress(tokenIn);

    const tokenOutToUse = tokenOutIsNative ? networkNativeAddress : formatAddress(tokenOut);

    const slippageParameters = this.determineSolanaSlippageParameters(params?.slippage);

    const quoteRequestBody: OkxQuoteRequestBody = {
      amount: amountIn.toString(),
      chainId: !isEvm ? this.solanaChainId : networkIn.toString(),
      fromTokenAddress: tokenInToUse,
      toTokenAddress: tokenOutToUse,
      userWalletAddress: formatAddress(from),
      swapReceiverAddress: formatAddress(receiver || from),
      ...slippageParameters,
    };

    return quoteRequestBody;
  }

  protected determineSolanaSlippageParameters(slippage: number): {
    autoSlippage: boolean;
    maxAutoSlippage: number;
    slippage: number;
  } {
    if (slippage <= 4) {
      return {
        autoSlippage: true,
        maxAutoSlippage: 0.15,
        slippage: 0.15,
      };
    } else {
      const slippagePercentage = slippage >= 1 ? slippage / 100 : slippage;

      return {
        autoSlippage: true,
        maxAutoSlippage: slippagePercentage,
        slippage: slippagePercentage,
      };
    }
  }

  /**
   * Calculates the HMAC-SHA256 signature required for authenticating requests to the OKX API.
   *
   * @param {string} method - The HTTP method (GET, POST, etc.).
   * @param {string} requestPath - The API endpoint path.
   * @param {OkxQueryParams} [queryParams] - Optional query parameters.
   * @param {string} [body] - Optional request body for POST requests.
   *
   * @returns {{ signature: string; timestamp: string }} An object containing the calculated signature and timestamp.
   */
  public calculateSignature(params: OkxSignatureParams): OkxSignatureResponse {
    const { method, requestPath, queryParams, body } = params;
    const timestamp = new Date().toISOString();

    // Construct the pre-hash string
    let preHash = timestamp + method.toUpperCase() + requestPath;

    // Add query parameters to request path if present
    if (queryParams) {
      const queryString = new URLSearchParams(queryParams as Record<string, string>).toString();
      preHash += '?' + queryString;
    }

    // Add body to pre-hash string if present
    if (body) {
      preHash += body;
    }

    // Create the HMAC SHA256 signature
    //@ts-ignore
    const hmac = crypto.createHmac('sha256', this.okxCredentials.secretKey);
    hmac.update(preHash);
    const signature = hmac.digest('base64');

    return { signature, timestamp };
  }

  /**
   * Validates the parameters for a price quote request.
   *
   * @param {PriceParams} params - The parameters to validate.
   *
   * @throws {SdkError} If any of the parameters are invalid or unsupported, or if API credentials are missing.
   */
  protected validatePriceParams(params: IntentPriceParams): void {
    const { networkIn, networkOut } = params;
    logger.debug('Validating price params');

    if (!this.okxCredentials.apiKey) {
      logger.error('API key not provided');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'OKX API key not provided');
    }
    if (!this.okxCredentials.secretKey) {
      logger.error('Secret key not provided');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'OKX Secret key not provided');
    }

    if (!this.multiChain && networkIn !== networkOut) {
      logger.error('Multi-chain swaps not supported');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Multi-chain swaps not supported');
    }
    if (!this.singleChain && networkIn === networkOut) {
      logger.error('Single-chain swaps not supported');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Single-chain swaps not supported');
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
   * Type guard to check if a response is a valid OKX price response.
   *
   * @param {RawProtocolPriceResponse} response - The response to check.
   *
   * @returns {boolean} True if the response is a valid OKX price response.
   */
  protected isOkxPriceResponse(response: RawProtocolPriceResponse): response is OkxPriceResponse {
    return 'data' in response && Array.isArray(response.data) && response.data.length > 0;
  }

  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return (
      !!config['okxApiKey'] &&
      !!config['okxSecretKey'] &&
      !!config['okxPassphrase'] &&
      !!config['okxProjectId']
    );
  }
}
