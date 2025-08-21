// Protocol imports from their index files
export * as Jupiter from './protocols/jupiter';
export * as Okx from './protocols/okx';
export * as Raydium from './protocols/raydium';
export * as Odos from './protocols/odos';
export * as Kyberswap from './protocols/kyberswap';
export * as OpenOcean from './protocols/openocean';
export * as Aftermath from './protocols/aftermath';
export * as ZeroX from './protocols/zeroX';
export * as DeBridge from './protocols/debridge';
export * as GeniusBridge from './protocols/genius-bridge';
export * as Across from './protocols/across';
export * as FourMeme from './protocols/four-meme';

// Core types and utilities
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum, ChainVmTypeEnum } from './types/enums';
import { IntentPriceParams } from './types/price-params';
import { PriceResponse, RawProtocolPriceResponse } from './types/price-response';
import { IntentQuoteParams } from './types/quote-params';
import { QuoteResponse, RawProtocolQuoteResponse } from './types/quote-response';
import { GeniusIntentsSDKConfig } from './types/sdk-config';
import { GeniusIntents } from './genius-intents';
import {
  GeniusIntentsConfig,
  GeniusIntentsResults,
  IntentPriceResult,
  IntentQuoteResult,
} from './types/genius-intents';
import { IIntentProtocol } from './interfaces/intent-protocol';
import {
  EvmQuoteExecutionPayload,
  SvmQuoteExecutionPayload,
} from './types/quote-execution-payload';
import { EvmTransactionData } from './types/evm-transaction-data';
import { SolanaTransactionData } from './types/solana-transaction-data';
import { Erc20Approval } from './types/erc20-approval';
import { ILogger, LogLevelEnum, LoggerFactory, ConsoleLogger, NoOpLogger } from './utils/logger';

export {
  // Main IntentsProtocols class - the primary entrypoint
  GeniusIntents,

  // Configuration types
  GeniusIntentsConfig as IntentsProtocolsConfig,
  GeniusIntentsConfig,
  GeniusIntentsSDKConfig,

  // Results and response types
  GeniusIntentsResults,
  IntentPriceResult,
  IntentQuoteResult,
  PriceResponse,
  QuoteResponse,
  RawProtocolPriceResponse,
  RawProtocolQuoteResponse,

  // Parameter types
  IntentPriceParams,
  IntentQuoteParams,

  // Transaction and execution types
  EvmQuoteExecutionPayload,
  SvmQuoteExecutionPayload,
  EvmTransactionData,
  SolanaTransactionData,
  Erc20Approval,

  // Enums
  ChainIdEnum,
  ProtocolEnum,
  SdkErrorEnum,
  ChainVmTypeEnum,
  LogLevelEnum,

  // Interface for extensibility
  IIntentProtocol,

  // Logging utilities
  ILogger,
  LoggerFactory,
  ConsoleLogger,
  NoOpLogger,
};
