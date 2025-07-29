import { PriceResponse } from './price-response';
import { QuoteResponse } from './quote-response';
import { ProtocolEnum } from './enums';
import { GeniusIntentsSDKConfig } from './sdk-config';
import { OKXConfig } from '../protocols/okx/okx.types';
import { JupiterConfig } from '../protocols/jupiter/jupiter.types';
import { RaydiumSdkConfig } from '../protocols/raydium/raydium-v2.types';
import { DeBridgeConfig } from '../protocols/debridge/debridge.types';
import { GeniusBridgeConfig } from '../protocols/genius-bridge/genius-bridge.types';
import { KyberswapConfig } from '../protocols/kyberswap/kyberswap.types';
import { OpenOceanConfig } from '../protocols/openocean/openocean.types';
import { AftermathConfig } from '../protocols/aftermath/aftermath.types';
import { ZeroXConfig } from '../protocols/zeroX/zeroX.types';
import { AcrossConfig } from '../protocols/across';
import { EvmQuoteExecutionPayload, SvmQuoteExecutionPayload } from './quote-execution-payload';

/**
 * Configuration interface for IntentsProtocols class
 */
export type GeniusIntentsConfig = OptionalIntentsProtocolsConfig &
  GeniusIntentsSDKConfig & {
    /**
     * Execution method for price and quote operations
     * - 'race': Return the fastest response using Promise.race()
     * - 'best': Wait for all responses and return the best one (highest output amount for price, best execution for quote)
     */
    method?: 'race' | 'best';

    /**
     * Timeout in milliseconds for individual protocol requests
     */
    timeout?: number;

    /**
     * RCPs to use for the protocols & approval checks
     */
    rcps?: { [network: number]: string };

    /**
     * Maximum number of concurrent protocol requests
     */
    maxConcurrency?: number;

    /**
     * When fetching a quote, it will be checked if the sender needs to execute an approval and
     * the quote will be returned with the approval tx data if approval required
     * @requires rpcs to be provided in the config
     */
    checkApprovals?: boolean;

    /**
     * When fetching a quote, it will be simulated to check if the quote is valid
     * @requires rpcs to be provided in the config
     */
    simulateQuotes?: boolean;

    /**
     * Custom simulation function to use for evm quote simulation
     */
    customEvmSimulation?: (
      network: number,
      from: string,
      evmExecutionPayload: EvmQuoteExecutionPayload,
    ) => Promise<boolean>;

    /**
     * Custom simulation function to use for svm quote simulation
     */
    customSvmSimulation?: (svmExecutionPayload: SvmQuoteExecutionPayload) => Promise<boolean>;

    /**
     * Specific protocols to include (if not specified, all compatible protocols will be used)
     */
    includeProtocols?: ProtocolEnum[];

    /**
     * Specific protocols to exclude
     */
    excludeProtocols?: ProtocolEnum[];
  };

export type OptionalIntentsProtocolsConfig = Partial<
  OKXConfig &
    JupiterConfig &
    RaydiumSdkConfig &
    DeBridgeConfig &
    GeniusBridgeConfig &
    KyberswapConfig &
    OpenOceanConfig &
    AftermathConfig &
    ZeroXConfig &
    AcrossConfig
>;

/**
 * Result interface for individual price requests
 */
export type IntentPriceResult = {
  protocol: ProtocolEnum;
  response?: PriceResponse;
  error?: Error;
  duration: number;
};

/**
 * Result interface for individual quote requests
 */
export type IntentQuoteResult = {
  protocol: ProtocolEnum;
  response?: QuoteResponse;
  error?: Error;
  duration: number;
};

/**
 * Combined results interface for IntentsProtocols operations
 */
export type GeniusIntentsResults<T> = {
  /**
   * The selected best result (for 'best' method) or fastest result (for 'race' method)
   */
  result?: T;

  /**
   * All results from individual protocols
   */
  allResults: Array<IntentPriceResult | IntentQuoteResult>;

  /**
   * Execution method used
   */
  method: 'race' | 'best';

  /**
   * Total execution time
   */
  totalDuration: number;
};

/**
 * Race execution result interface
 */
export type IntentRaceExecutionResult<T extends IntentPriceResult | IntentQuoteResult> = {
  winner?: T;
  allResults: T[];
};
