import { IIntentProtocol } from './interfaces/intent-protocol';
import { IntentPriceParams } from './types/price-params';
import { IntentQuoteParams } from './types/quote-params';
import { PriceResponse } from './types/price-response';
import { QuoteResponse } from './types/quote-response';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from './types/enums';
import { ILogger, LoggerFactory, LogLevelEnum } from './utils/logger';
import { sdkError } from './utils/throw-error';
import {
  GeniusIntentsConfig,
  IntentPriceResult,
  IntentQuoteResult,
  GeniusIntentsResults,
  IntentRaceExecutionResult,
} from './types/genius-intents';
import { GeniusIntentsSDKConfig } from './types/sdk-config';
import { toQuantity } from 'ethers';

// Static imports for all protocols (required for esbuild bundling)
import { OdosService } from './protocols/odos/odos.service';
import { JupiterService } from './protocols/jupiter/jupiter.service';
import { RaydiumV2Service } from './protocols/raydium/raydium-v2.service';
import { OpenOceanService } from './protocols/openocean/openocean.service';
import { OkxService } from './protocols/okx/okx.service';
import { KyberswapService } from './protocols/kyberswap/kyberswap.service';
import { AftermathService } from './protocols/aftermath/aftermath.service';
import { ZeroXService } from './protocols/zeroX/zeroX.service';
import { DeBridgeService } from './protocols/debridge/debridge.service';
import { GeniusBridgeService } from './protocols/genius-bridge/genius-bridge.service';
import { AcrossService } from './protocols/across/across.service';

// Remove static imports of protocol services - they will be loaded dynamically
import { EvmTransactionData } from './types/evm-transaction-data';
import { Erc20Service } from './lib/erc20/erc20.service';
import {
  EvmQuoteExecutionPayload,
  SvmQuoteExecutionPayload,
} from './types/quote-execution-payload';
import { JsonRpcProvider, ethers } from 'ethers';
import simulateJito from './utils/jito';

let logger: ILogger;

// Available protocols array
const AVAILABLE_PROTOCOLS: ProtocolEnum[] = [
  ProtocolEnum.ODOS,
  ProtocolEnum.JUPITER,
  ProtocolEnum.RAYDIUM_V2,
  ProtocolEnum.OPEN_OCEAN,
  ProtocolEnum.OKX,
  ProtocolEnum.KYBERSWAP,
  ProtocolEnum.AFTERMATH,
  ProtocolEnum.ZEROX,
  ProtocolEnum.DEBRIDGE,
  ProtocolEnum.GENIUS_BRIDGE,
  ProtocolEnum.ACROSS,
];

// Service mapping for static imports (required for esbuild bundling)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SERVICE_MAP: Record<ProtocolEnum, new (config: any) => IIntentProtocol> = {
  [ProtocolEnum.ODOS]: OdosService,
  [ProtocolEnum.JUPITER]: JupiterService,
  [ProtocolEnum.RAYDIUM_V2]: RaydiumV2Service,
  [ProtocolEnum.OPEN_OCEAN]: OpenOceanService,
  [ProtocolEnum.OKX]: OkxService,
  [ProtocolEnum.KYBERSWAP]: KyberswapService,
  [ProtocolEnum.AFTERMATH]: AftermathService,
  [ProtocolEnum.ZEROX]: ZeroXService,
  [ProtocolEnum.DEBRIDGE]: DeBridgeService,
  [ProtocolEnum.GENIUS_BRIDGE]: GeniusBridgeService,
  [ProtocolEnum.ACROSS]: AcrossService,
};

export class GeniusIntents {
  protected config: GeniusIntentsConfig;
  protected protocols: Map<ProtocolEnum, IIntentProtocol> = new Map();
  private _protocolsInitialized = false;
  private _initializationPromise: Promise<void> | null = null;

  constructor(config: GeniusIntentsConfig = {}) {
    // Configure logging
    if (config.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    } else if (config.logger) {
      LoggerFactory.configure(config.logger);
    }
    logger = LoggerFactory.getLogger();

    // Set default configuration
    this.config = {
      method: 'best',
      timeout: 30000, // 30 seconds
      maxConcurrency: 10,
      ...config,
      // Properly merge excludeProtocols arrays
      excludeProtocols: [
        ...(config.excludeProtocols || []),
        ...(config.includeProtocols ? [] : [ProtocolEnum.GENIUS_BRIDGE]), // Only exclude by default if not explicitly included
      ],
      solanaRpcUrl: config.solanaRpcUrl || config.rpcs?.[ChainIdEnum.SOLANA] || undefined,
      rpcs: {
        ...config.rpcs,
        [ChainIdEnum.SOLANA]: config.solanaRpcUrl || config.rpcs?.[ChainIdEnum.SOLANA] || '',
        [ChainIdEnum.SUI]: config.suiRpcUrl || config.rpcs?.[ChainIdEnum.SUI] || '',
      },
    };
  }

  /**
   * Ensure protocols are initialized (lazy loading)
   */
  protected async ensureProtocolsInitialized(): Promise<void> {
    if (this._protocolsInitialized) {
      return;
    }

    if (this._initializationPromise) {
      await this._initializationPromise;
      return;
    }

    this._initializationPromise = this.initializeProtocols();
    await this._initializationPromise;
    this._protocolsInitialized = true;
  }

  /**
   * Initialize protocol instances using static imports (compatible with esbuild)
   */
  protected async initializeProtocols(): Promise<void> {
    const protocolsToLoad = AVAILABLE_PROTOCOLS.filter(protocol => {
      // Skip if specifically excluded
      if (this.config.excludeProtocols?.includes(protocol)) {
        logger.debug(`Skipping excluded protocol: ${protocol}`);
        return false;
      }

      // Skip if includeProtocols is specified and this protocol is not included
      if (this.config.includeProtocols && !this.config.includeProtocols.includes(protocol)) {
        logger.debug(`Skipping non-included protocol: ${protocol}`);
        return false;
      }

      return true;
    });

    logger.info(`Loading ${protocolsToLoad.length} protocols statically`);

    // Load protocols using static imports (compatible with esbuild)
    const loadPromises = protocolsToLoad.map(async protocol => {
      try {
        const serviceClass = SERVICE_MAP[protocol];

        if (!serviceClass) {
          logger.error(`Service class for protocol ${protocol} not found in SERVICE_MAP`);
          return null;
        }

        // Create service instance with config
        const serviceInstance = new serviceClass(this.config as unknown as GeniusIntentsSDKConfig);

        this.protocols.set(protocol, serviceInstance);
        logger.debug(`Successfully loaded protocol: ${protocol}`);
        return protocol;
      } catch (error: unknown) {
        // Log the error but don't throw - this allows other protocols to continue loading
        logger.warn(
          `Failed to load protocol ${protocol}, skipping: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
        return null;
      }
    });

    const loadedProtocols = await Promise.all(loadPromises);
    const successfulLoads = loadedProtocols.filter(Boolean);

    logger.info(
      `Successfully initialized ${successfulLoads.length} protocols: ${successfulLoads.join(', ')}`,
    );
  }

  /**
   * Safely create a protocol instance, handling potential errors
   */
  protected createProtocolSafely(
    factory: () => IIntentProtocol,
    protocolName: string,
  ): IIntentProtocol | null {
    try {
      return factory();
    } catch (error: unknown) {
      logger.error(
        `Failed to initialize ${protocolName} protocol:`,
        error instanceof Error ? error : new Error('Unknown error'),
      );
      return null;
    }
  }

  /**
   * Get compatible protocols for the given parameters
   */
  protected async getCompatibleProtocols(
    params: IntentPriceParams | IntentQuoteParams,
  ): Promise<IIntentProtocol[]> {
    await this.ensureProtocolsInitialized();

    const compatibleProtocols: IIntentProtocol[] = [];

    for (const protocol of this.protocols.values()) {
      // Skip if protocol is undefined or doesn't have required properties
      if (!protocol || !protocol.chains) {
        continue;
      }

      // Check if protocol supports the required chains
      const isSameChain = params.networkIn === params.networkOut;
      const supportsNetworkIn = protocol.chains.includes(params.networkIn as ChainIdEnum);
      const supportsNetworkOut = protocol.chains.includes(params.networkOut as ChainIdEnum);

      if (isSameChain) {
        // Same-chain swap: protocol must support single-chain operations and the chain
        if (protocol.singleChain && supportsNetworkIn) {
          compatibleProtocols.push(protocol);
        }
      } else {
        // Cross-chain swap: protocol must support multi-chain operations and both chains
        if (protocol.multiChain && supportsNetworkIn && supportsNetworkOut) {
          compatibleProtocols.push(protocol);
        }
      }
    }

    return compatibleProtocols;
  }

  /**
   * Execute price requests across compatible protocols
   */
  async fetchPrice(params: IntentPriceParams): Promise<GeniusIntentsResults<PriceResponse>> {
    const startTime = Date.now();
    const compatibleProtocols = await this.getCompatibleProtocols(params);

    if (compatibleProtocols.length === 0) {
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `No compatible protocols found for swap from chain ${params.networkIn} to chain ${params.networkOut}`,
      );
    }

    logger.info(`Found ${compatibleProtocols.length} compatible protocols for price request`);

    const promises = compatibleProtocols.map((protocol: IIntentProtocol) =>
      this.executePriceRequest(protocol, params),
    );

    let allResults: IntentPriceResult[];
    let result: PriceResponse | undefined;

    if (this.config.method === 'race') {
      // Race mode: return the first successful response
      const raceResult = await this.executeRace(promises);
      allResults = raceResult.allResults as IntentPriceResult[];
      result = raceResult.winner?.response as PriceResponse | undefined;
    } else {
      // Best mode: wait for all responses and select the best one
      allResults = (await this.executeAll(promises)) as IntentPriceResult[];
      result = this.selectBestPriceResponse(allResults);
    }

    return {
      result,
      allResults,
      method: this.config.method!,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Execute quote requests across compatible protocols
   */
  async fetchQuote(params: IntentQuoteParams): Promise<GeniusIntentsResults<QuoteResponse>> {
    const startTime = Date.now();

    if (this.config.simulateQuotes || this.config.checkApprovals) {
      if (!this.config.rpcs?.[params.networkIn]) {
        throw sdkError(
          SdkErrorEnum.MISSING_RPC_URL,
          'rpcs are required for quote simulation and approval checks',
        );
      }
    }

    const compatibleProtocols = await this.getCompatibleProtocols(params);

    if (compatibleProtocols.length === 0) {
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `No compatible protocols found for quote from chain ${params.networkIn} to chain ${params.networkOut}`,
      );
    }

    logger.info(`Found ${compatibleProtocols.length} compatible protocols for quote request`);

    const promises = compatibleProtocols.map((protocol: IIntentProtocol) =>
      this.executeQuoteRequest(protocol, params),
    );

    let allResults: IntentQuoteResult[];
    let result: QuoteResponse | undefined;

    if (this.config.method === 'race') {
      // Race mode: return the first successful response
      const raceResult = await this.executeRace(promises);
      allResults = raceResult.allResults as IntentQuoteResult[];
      result = raceResult.winner?.response as QuoteResponse | undefined;
    } else {
      // Best mode: wait for all responses and select the best one
      allResults = (await this.executeAll(promises)) as IntentQuoteResult[];
      result = this.selectBestQuoteResponse(allResults);
    }

    if (this.config.checkApprovals && result) {
      const approvalChecked = await this.checkApproval(result);
      if (result.evmExecutionPayload && approvalChecked) {
        result.evmExecutionPayload.approval = {
          ...result.evmExecutionPayload.approval,
          ...approvalChecked,
        };
      }
    }

    return {
      result,
      allResults,
      method: this.config.method!,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Execute a single price request with timeout and error handling
   */
  protected async executePriceRequest(
    protocol: IIntentProtocol,
    params: IntentPriceParams,
  ): Promise<IntentPriceResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.config.timeout);
      });

      const response = await Promise.race([protocol.fetchPrice(params), timeoutPromise]);

      return {
        protocol: protocol.protocol,
        response,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        protocol: protocol.protocol,
        error: error instanceof Error ? error : new Error('Unknown error'),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a single quote request with timeout and error handling
   */
  protected async executeQuoteRequest(
    protocol: IIntentProtocol,
    params: IntentQuoteParams,
  ): Promise<IntentQuoteResult> {
    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.config.timeout);
      });

      const response = await Promise.race([protocol.fetchQuote(params), timeoutPromise]);

      if (this.config.simulateQuotes) {
        const simulationResult = await this.simulateQuote(response);
        response.simulationSuccess = simulationResult.simulationSuccess;
        if (response.evmExecutionPayload && simulationResult.quoteGasEstimate) {
          response.evmExecutionPayload.transactionData.gasEstimate =
            simulationResult.quoteGasEstimate;
        }
        if (response.evmExecutionPayload && simulationResult.approvalGasEstimate) {
          response.evmExecutionPayload.approval.txnData!.gasEstimate =
            simulationResult.approvalGasEstimate;
        }
      }

      return {
        protocol: protocol.protocol,
        response,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        protocol: protocol.protocol,
        error: error instanceof Error ? error : new Error('Unknown error'),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute all promises and wait for completion
   */
  protected async executeAll<T>(promises: Promise<T>[]): Promise<T[]> {
    return Promise.allSettled(promises).then(results =>
      results.map(result => (result.status === 'fulfilled' ? result.value : result.reason)),
    );
  }

  /**
   * Execute promises in race mode, but also collect all results
   */
  protected async executeRace<T extends IntentPriceResult | IntentQuoteResult>(
    promises: Promise<T>[],
  ): Promise<IntentRaceExecutionResult<T>> {
    return new Promise(resolve => {
      const results: T[] = [];
      let completed = 0;
      let winner: T | undefined;

      promises.forEach(async promise => {
        try {
          const result = await promise;
          results.push(result);

          // If this is the first successful result and we don't have a winner yet
          if (
            !winner &&
            !result.error &&
            result.response?.amountOut &&
            BigInt(result.response.amountOut) > BigInt(0) &&
            this.isQuoteSimulationStatusOk(result.response)
          ) {
            winner = result;
          }
        } catch (error) {
          results.push({
            protocol: ProtocolEnum.JUPITER, // This will be overridden by actual protocol
            error: error instanceof Error ? error : new Error('Unknown error'),
            duration: 0,
          } as T);
        }

        completed++;

        // If we have a winner or all promises are completed
        if (winner || completed === promises.length) {
          resolve({ winner, allResults: results });
        }
      });
    });
  }

  /**
   * Select the best price response based on output amount
   */
  protected selectBestPriceResponse(results: IntentPriceResult[]): PriceResponse | undefined {
    const successfulResults = results.filter(r => r.response && !r.error);

    if (successfulResults.length === 0) {
      return undefined;
    }

    // Find the result with the highest output amount
    return successfulResults.reduce((best, current) => {
      const bestAmount = BigInt(best.response!.amountOut);
      const currentAmount = BigInt(current.response!.amountOut);
      const betterAmountOut = currentAmount > bestAmount;
      const currentSimulationOk =
        current.response && this.isQuoteSimulationStatusOk(current.response);
      const bestSimulationOk = best.response && this.isQuoteSimulationStatusOk(best.response);
      const betterSimulationOk = currentSimulationOk && !bestSimulationOk;
      const bothSimulationSame = currentSimulationOk === bestSimulationOk;
      return (betterAmountOut && bothSimulationSame) || betterSimulationOk ? current : best;
    }).response;
  }

  /**
   * Select the best quote response based on output amount
   */
  protected selectBestQuoteResponse(results: IntentQuoteResult[]): QuoteResponse | undefined {
    const successfulResults = results.filter(r => r.response && !r.error);

    if (successfulResults.length === 0) {
      return undefined;
    }

    // Find the result with the highest output amount
    return successfulResults.reduce((best, current) => {
      const bestAmount = BigInt(best.response!.amountOut);
      const currentAmount = BigInt(current.response!.amountOut);
      return currentAmount > bestAmount ? current : best;
    }).response;
  }

  protected async checkApproval(result: QuoteResponse): Promise<{
    approvalRequired?: boolean;
    txnData: EvmTransactionData;
  } | null> {
    if (!result.evmExecutionPayload) {
      return null;
    }

    if (typeof result.evmExecutionPayload.approval.required !== 'undefined') return null;

    const approval = result.evmExecutionPayload.approval;

    const calldata = Erc20Service.getApproveTxData(approval.spender, approval.amount);
    const txnData = {
      to: result.tokenIn,
      data: calldata,
      value: '0',
    };

    const rpcUrl = this.config.rpcs?.[result.networkIn];
    if (!rpcUrl) {
      return {
        txnData,
      };
    }

    const erc20 = new Erc20Service(result.tokenIn, rpcUrl);
    const allowance = await erc20.allowance(
      result.from,
      result.evmExecutionPayload.approval.spender,
    );

    return {
      approvalRequired: allowance < BigInt(result.evmExecutionPayload.approval.amount),
      txnData,
    };
  }

  /**
   * Helper to calculate ERC20 allowance storage slot
   * Standard ERC20 allowance mapping is at slot 1
   * allowance[owner][spender] = keccak256(spender . keccak256(owner . slot))
   */
  protected generateAllowanceOverrides(
    owner: string,
    spender: string,
    maxSlots = 15,
  ): Record<string, string> {
    const abiCoder = new ethers.AbiCoder();

    const storage: Record<string, string> = {};

    for (let i = 0; i < maxSlots; i++) {
      const inner = ethers.keccak256(abiCoder.encode(['address', 'uint256'], [owner, i]));
      const outer = ethers.keccak256(abiCoder.encode(['address', 'bytes32'], [spender, inner]));
      storage[outer] = '0xfFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    }

    return storage;
  }

  protected generateBalanceOverrides(owner: string, maxSlots = 10): Record<string, string> {
    const abi = new ethers.AbiCoder();
    const storage: Record<string, string> = {};

    for (let i = 0; i < maxSlots; i++) {
      const slotHash = ethers.keccak256(abi.encode(['address', 'uint256'], [owner, i]));
      storage[slotHash] = '0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF';
    }

    return storage;
  }

  protected async simulateQuote(result: QuoteResponse): Promise<{
    simulationSuccess?: boolean;
    simulationError?: Error;
    quoteGasEstimate?: string;
    approvalGasEstimate?: string;
  }> {
    if (!result) {
      return {
        simulationSuccess: false,
        simulationError: new Error('Quote response is undefined'),
      };
    }

    try {
      if (result.evmExecutionPayload) {
        return await this.simulateQuoteEvm(
          result.networkIn,
          result.from,
          result.tokenIn,
          result.evmExecutionPayload,
        );
      }

      if (result.svmExecutionPayload) {
        return await this.simulateQuoteSvm(result.svmExecutionPayload);
      }
    } catch (error) {
      logger.error(
        'Quote simulation failed',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      return {
        simulationSuccess: false,
        simulationError: new Error('Quote simulation failed'),
      };
    }

    return {
      simulationSuccess: false,
      simulationError: new Error('No execution payload found'),
    };
  }

  /**
   * Simulate quote with approval using state overrides
   */
  protected async simulateQuoteEvm(
    network: ChainIdEnum,
    from: string,
    tokenIn: string,
    evmExecutionPayload: EvmQuoteExecutionPayload,
  ): Promise<{
    simulationSuccess?: boolean;
    simulationError?: Error;
    quoteGasEstimate?: string;
    approvalGasEstimate?: string;
  }> {
    if (this.config.customEvmSimulation) {
      return this.config.customEvmSimulation(network, from, tokenIn, evmExecutionPayload);
    }

    const rpcUrl = this.config.rpcs?.[network];
    if (!rpcUrl) {
      return {
        simulationSuccess: false,
        simulationError: new Error('No RPC URL found'),
      };
    }

    const provider = new JsonRpcProvider(rpcUrl);

    try {
      let approvalGasEstimate: bigint | undefined;
      if (evmExecutionPayload.approval.txnData) {
        approvalGasEstimate = await provider.estimateGas({
          to: evmExecutionPayload.approval.txnData.to,
          data: evmExecutionPayload.approval.txnData.data,
          value: evmExecutionPayload.approval.txnData.value,
          from,
        });
      }

      // Calculate the allowance storage slot
      const approvalSlots = this.generateAllowanceOverrides(
        from,
        evmExecutionPayload.approval.spender,
      );
      const balanceSlots = this.generateBalanceOverrides(from);

      // Use eth_estimateGas with state overrides to simulate the swap with approval already set
      const swapGasHex = await provider.send('eth_estimateGas', [
        {
          to: evmExecutionPayload.transactionData.to,
          data: evmExecutionPayload.transactionData.data,
          value: toQuantity(evmExecutionPayload.transactionData.value),
          from,
        },
        'latest',
        {
          [tokenIn]: {
            stateDiff: {
              ...approvalSlots,
              ...balanceSlots,
            },
          },
          [from]: {
            balance: '0x9999999999999999999999999999999999',
          },
        },
      ]);

      const swapGas = BigInt(swapGasHex);

      return {
        simulationSuccess: true,
        quoteGasEstimate: swapGas.toString(),
        approvalGasEstimate: approvalGasEstimate?.toString(),
      };
    } catch (error) {
      logger.error(
        'Error estimating gas with state override for evm quote simulation',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      return {
        simulationSuccess: false,
        simulationError: new Error('EVM quote simulation with state override failed'),
      };
    }
  }

  protected async simulateQuoteSvm(svmExecutionPayload: SvmQuoteExecutionPayload): Promise<{
    simulationSuccess?: boolean;
    simulationError?: Error;
  }> {
    if (this.config.customSvmSimulation) {
      return this.config.customSvmSimulation(svmExecutionPayload);
    }

    const rpcUrl = this.config.rpcs?.[ChainIdEnum.SOLANA];
    if (!rpcUrl) {
      return {
        simulationSuccess: false,
        simulationError: new Error('No RPC URL found'),
      };
    }

    if (!this.config.jitoRpc) {
      return {
        simulationSuccess: false,
        simulationError: new Error('No Jito RPC URL found'),
      };
    }

    // Simulate using Jito
    const simulationResult = await simulateJito(this.config.jitoRpc, rpcUrl, svmExecutionPayload);

    if (!simulationResult.simsPassed) {
      logger.error(
        'Solana quote simulation failed',
        simulationResult.error ? new Error(simulationResult.error) : undefined,
      );
      return {
        simulationSuccess: false,
        simulationError: new Error('Solana quote simulation failed'),
      };
    }

    return {
      simulationSuccess: true,
    };
  }
  /**
   * Get list of initialized protocols
   */
  async getInitializedProtocols(): Promise<ProtocolEnum[]> {
    await this.ensureProtocolsInitialized();
    return Array.from(this.protocols.keys());
  }

  /**
   * Get a specific protocol instance
   */
  async getProtocol(protocol: ProtocolEnum): Promise<IIntentProtocol | undefined> {
    await this.ensureProtocolsInitialized();
    return this.protocols.get(protocol);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GeniusIntentsConfig>): void {
    this.config = { ...this.config, ...config };

    // Reinitialize protocols if protocol-specific configs changed
    if (config.includeProtocols || config.excludeProtocols) {
      this.protocols.clear();
      this._protocolsInitialized = false;
      this._initializationPromise = null;
    }
  }

  protected isQuoteSimulationStatusOk(result: QuoteResponse | PriceResponse): boolean {
    // If undefined or missing, it means the simulation was not necessary for this protocol
    return !('simulationSuccess' in result) || result.simulationSuccess !== false;
  }
}
