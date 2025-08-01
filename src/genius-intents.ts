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
import { JupiterConfig } from './protocols/jupiter/jupiter.types';
import { RaydiumSdkConfig } from './protocols/raydium/raydium-v2.types';
import { OpenOceanConfig } from './protocols/openocean/openocean.types';
import { OKXConfig } from './protocols/okx/okx.types';
import { KyberswapConfig } from './protocols/kyberswap/kyberswap.types';
import { AftermathConfig } from './protocols/aftermath/aftermath.types';
import { ZeroXConfig } from './protocols/zeroX/zeroX.types';
import { DeBridgeConfig } from './protocols/debridge/debridge.types';
import { GeniusBridgeConfig } from './protocols/genius-bridge/genius-bridge.types';
import { toQuantity } from 'ethers';

// Import all available protocol services
import { OdosService } from './protocols/odos/odos.service';
import { RaydiumV2Service } from './protocols/raydium/raydium-v2.service';
import { JupiterService } from './protocols/jupiter/jupiter.service';
import { OpenOceanService } from './protocols/openocean/openocean.service';
import { OkxService } from './protocols/okx/okx.service';
import { KyberswapService } from './protocols/kyberswap/kyberswap.service';
import { AftermathService } from './protocols/aftermath/aftermath.service';
import { ZeroXService } from './protocols/zeroX/zeroX.service';
import { DeBridgeService } from './protocols/debridge/debridge.service';
import { GeniusBridgeService } from './protocols/genius-bridge/genius-bridge.service';
import { EvmTransactionData } from './types/evm-transaction-data';
import { Erc20Service } from './lib/erc20/erc20.service';
import { AcrossService } from './protocols/across/across.service';
import { AcrossConfig } from './protocols/across/across.types';
import {
  EvmQuoteExecutionPayload,
  SvmQuoteExecutionPayload,
} from './types/quote-execution-payload';
import { JsonRpcProvider, ethers } from 'ethers';
import simulateJito from './utils/jito';

let logger: ILogger;

export class GeniusIntents {
  protected config: GeniusIntentsConfig;
  protected protocols: Map<ProtocolEnum, IIntentProtocol> = new Map();

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

    this.initializeProtocols();
  }

  /**
   * Initialize all available protocol instances
   */
  protected initializeProtocols(): void {
    const protocolFactories: Array<{
      protocol: ProtocolEnum;
      factory: () => IIntentProtocol | null;
    }> = [
      {
        protocol: ProtocolEnum.ODOS,
        factory: () =>
          this.createProtocolSafely(
            () => new OdosService(this.config as unknown as GeniusIntentsSDKConfig),
            'ODOS',
          ),
      },
      {
        protocol: ProtocolEnum.JUPITER,
        factory: () =>
          this.createProtocolSafely(
            () =>
              new JupiterService(this.config as unknown as GeniusIntentsSDKConfig & JupiterConfig),
            'JUPITER',
          ),
      },
      {
        protocol: ProtocolEnum.RAYDIUM_V2,
        factory: () =>
          this.createProtocolSafely(() => {
            return new RaydiumV2Service(
              this.config as unknown as GeniusIntentsSDKConfig & RaydiumSdkConfig,
            );
          }, 'RAYDIUM_V2'),
      },
      {
        protocol: ProtocolEnum.OPEN_OCEAN,
        factory: () =>
          this.createProtocolSafely(() => {
            return new OpenOceanService(
              this.config as unknown as GeniusIntentsSDKConfig & OpenOceanConfig,
            );
          }, 'OPEN_OCEAN'),
      },
      {
        protocol: ProtocolEnum.OKX,
        factory: () =>
          this.createProtocolSafely(() => {
            return new OkxService(this.config as unknown as GeniusIntentsSDKConfig & OKXConfig);
          }, 'OKX'),
      },
      {
        protocol: ProtocolEnum.KYBERSWAP,
        factory: () =>
          this.createProtocolSafely(() => {
            return new KyberswapService(
              this.config as unknown as GeniusIntentsSDKConfig & KyberswapConfig,
            );
          }, 'KYBERSWAP'),
      },
      {
        protocol: ProtocolEnum.AFTERMATH,
        factory: () =>
          this.createProtocolSafely(() => {
            return new AftermathService(
              this.config as unknown as GeniusIntentsSDKConfig & AftermathConfig,
            );
          }, 'AFTERMATH'),
      },
      {
        protocol: ProtocolEnum.ZEROX,
        factory: () =>
          this.createProtocolSafely(() => {
            return new ZeroXService(this.config as unknown as GeniusIntentsSDKConfig & ZeroXConfig);
          }, 'ZEROX'),
      },
      {
        protocol: ProtocolEnum.DEBRIDGE,
        factory: () =>
          this.createProtocolSafely(
            () =>
              new DeBridgeService(
                this.config as unknown as GeniusIntentsSDKConfig & DeBridgeConfig,
              ),
            'DEBRIDGE',
          ),
      },
      {
        protocol: ProtocolEnum.GENIUS_BRIDGE,
        factory: () =>
          this.createProtocolSafely(
            () =>
              new GeniusBridgeService(
                this.config as unknown as GeniusIntentsSDKConfig & GeniusBridgeConfig,
              ),
            'GENIUS_BRIDGE',
          ),
      },
      {
        protocol: ProtocolEnum.ACROSS,
        factory: () =>
          this.createProtocolSafely(
            () =>
              new AcrossService(this.config as unknown as GeniusIntentsSDKConfig & AcrossConfig),
            'ACROSS',
          ),
      },
    ];

    // Initialize protocols based on configuration
    for (const { protocol, factory } of protocolFactories) {
      // Skip if specifically excluded
      if (this.config.excludeProtocols?.includes(protocol)) {
        continue;
      }

      // Skip if includeProtocols is specified and this protocol is not included
      if (this.config.includeProtocols && !this.config.includeProtocols.includes(protocol)) {
        continue;
      }

      const protocolInstance = factory();
      if (protocolInstance) {
        this.protocols.set(protocol, protocolInstance);
        logger.debug(`Initialized protocol: ${protocol}`);
      }
    }

    logger.info(`Initialized ${this.protocols.size} protocols`);
  }

  /**
   * Safely create a protocol instance, handling potential errors
   */
  protected createProtocolSafely(
    factory: () => IIntentProtocol,
    protocolName: string,
  ): IIntentProtocol | null {
    try {
      // First check if the config is valid for this protocol by creating a temporary instance
      const tempInstance = factory();

      // Check if the config is correct for this protocol
      if (!tempInstance.isCorrectConfig(this.config as { [key: string]: string })) {
        logger.debug(`Skipping protocol ${protocolName} due to invalid config`);
        return null;
      }

      return tempInstance;
    } catch (error) {
      logger.warn(`Failed to initialize protocol ${protocolName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get compatible protocols for the given parameters
   */
  protected getCompatibleProtocols(
    params: IntentPriceParams | IntentQuoteParams,
  ): IIntentProtocol[] {
    const compatibleProtocols: IIntentProtocol[] = [];

    for (const protocol of this.protocols.values()) {
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
    const compatibleProtocols = this.getCompatibleProtocols(params);

    if (compatibleProtocols.length === 0) {
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `No compatible protocols found for swap from chain ${params.networkIn} to chain ${params.networkOut}`,
      );
    }

    logger.info(`Found ${compatibleProtocols.length} compatible protocols for price request`);

    const promises = compatibleProtocols.map(protocol =>
      this.executePriceRequest(protocol, params),
    );

    let allResults: IntentPriceResult[];
    let result: PriceResponse | undefined;

    if (this.config.method === 'race') {
      // Race mode: return the first successful response
      const raceResult = await this.executeRace(promises);
      allResults = raceResult.allResults;
      result = raceResult.winner?.response;
    } else {
      // Best mode: wait for all responses and select the best one
      allResults = await this.executeAll(promises);
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
    const compatibleProtocols = this.getCompatibleProtocols(params);

    if (this.config.simulateQuotes || this.config.checkApprovals) {
      if (!this.config.rpcs?.[params.networkIn]) {
        throw sdkError(
          SdkErrorEnum.MISSING_RPC_URL,
          'rpcs are required for quote simulation and approval checks',
        );
      }
    }

    if (compatibleProtocols.length === 0) {
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        `No compatible protocols found for quote from chain ${params.networkIn} to chain ${params.networkOut}`,
      );
    }

    logger.info(`Found ${compatibleProtocols.length} compatible protocols for quote request`);

    const promises = compatibleProtocols.map(protocol =>
      this.executeQuoteRequest(protocol, params),
    );

    let allResults: IntentQuoteResult[];
    let result: QuoteResponse | undefined;

    if (this.config.method === 'race') {
      // Race mode: return the first successful response
      const raceResult = await this.executeRace(promises);
      allResults = raceResult.allResults;
      result = raceResult.winner?.response;
    } else {
      // Best mode: wait for all responses and select the best one
      allResults = await this.executeAll(promises);
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
  getInitializedProtocols(): ProtocolEnum[] {
    return Array.from(this.protocols.keys());
  }

  /**
   * Get a specific protocol instance
   */
  getProtocol(protocol: ProtocolEnum): IIntentProtocol | undefined {
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
      this.initializeProtocols();
    }
  }

  protected isQuoteSimulationStatusOk(result: QuoteResponse | PriceResponse): boolean {
    // If undefined or missing, it means the simulation was not necessary for this protocol
    return !('simulationSuccess' in result) || result.simulationSuccess !== false;
  }
}
