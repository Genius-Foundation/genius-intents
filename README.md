# Genius Intents SDK

A unified TypeScript SDK for interacting with multiple DeFi protocols and intent-based trading across various blockchains.

## 🚀 Features

- **Multi-Protocol Support**: Seamlessly interact with Jupiter, Raydium, Odos, OKX, Kyberswap, OpenOcean, and Aftermath
- **Cross-Chain Compatible**: Support for Solana, Ethereum, and Sui networks
- **Intent-Based Trading**: Execute complex trading strategies with simple intent definitions
- **TypeScript First**: Full type safety and excellent developer experience
- **Unified API**: Single interface for multiple DeFi protocols
- **Price Discovery**: Get quotes and prices across multiple protocols simultaneously

## 📦 Installation

```bash
npm install genius-intents
```

```bash
yarn add genius-intents
```

## 🏁 Quick Start

```typescript
import { IntentsProtocols, ChainIdEnum } from 'genius-intents';

// Initialize the SDK with configuration
const intentsSDK = new IntentsProtocols({
  method: 'best', // 'best' or 'race'
  debug: true,
  logger: console,
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  suiRpcUrl: 'https://sui-mainnet.blockvision.org/v1/YOUR_API_KEY',
  okxApiKey: 'your-okx-api-key',
  okxSecretKey: 'your-okx-secret-key',
  okxPassphrase: 'your-okx-passphrase',
  okxProjectId: 'your-okx-project-id',
  zeroXApiKey: 'your-0x-api-key',
  kyberswapClientId: 'your-kyberswap-client-id',
  timeout: 30000,
  maxConcurrency: 10
});

// Get price quotes across multiple protocols
const priceParams = {
  networkIn: ChainIdEnum.BASE,
  networkOut: ChainIdEnum.BASE,
  tokenIn: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  tokenOut: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
  amountIn: '1000000000000000000', // 1 token (18 decimals)
  slippage: 1, // 1%
  from: '0x5B1a738cfF4c6064C9C211C611f171a1567D2b9b'
};

const prices = await intentsSDK.fetchPrice(priceParams);
console.log('Best price:', prices.result);

// Execute a trade quote
const quoteParams = {
  networkIn: ChainIdEnum.BASE,
  networkOut: ChainIdEnum.BASE,
  tokenIn: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  tokenOut: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
  amountIn: '1000000000000000000',
  slippage: 1,
  from: '0x5B1a738cfF4c6064C9C211C611f171a1567D2b9b',
  receiver: '0x5B1a738cfF4c6064C9C211C611f171a1567D2b9b'
};

const quote = await intentsSDK.fetchQuote(quoteParams);
console.log('Quote:', quote.result);
```

## 🔧 Advanced Usage

### Using Individual Protocol Services

#### Option 1: Protocol Namespace Import (Recommended for Advanced Users)
```typescript
import { Jupiter, Raydium, Okx } from 'genius-intents';

// Access service and all protocol-specific types
const jupiter = new Jupiter.JupiterService(jupiterConfig);
const raydium = new Raydium.RaydiumV2Service(jupiterConfig);

// Access protocol-specific types for advanced usage
type JupiterConfig = Jupiter.JupiterConfig;
type JupiterPriceResponse = Jupiter.JupiterPriceResponse;
type RaydiumQuoteResponse = Raydium.RaydiumV2QuoteResponse;

// Use protocol-specific types for type-safe development
const jupiterParams: Jupiter.JupiterPriceUrlParams = {
  inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  outputMint: 'So11111111111111111111111111111111111111112',
  amount: '1000000',
  slippageBps: 50
};
```

#### Option 2: Granular Protocol Import
```typescript
// Import only what you need for better tree shaking
import { JupiterService, type JupiterConfig, type JupiterPriceResponse } from 'genius-intents/protocols/jupiter';
import { OkxService, type OKXConfig } from 'genius-intents/protocols/okx';

const jupiter = new JupiterService({ solanaRpcUrl: 'https://api.mainnet-beta.solana.com' });
```

### Protocol Filtering

```typescript
import { IntentsProtocols, ProtocolEnum } from 'genius-intents';

// Only use specific protocols
const intentsSDK = new IntentsProtocols({
  method: 'best',
  includeProtocols: [ProtocolEnum.JUPITER, ProtocolEnum.RAYDIUM_V2],
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com'
});

// Exclude specific protocols
const intentsSDKExclude = new IntentsProtocols({
  method: 'race',
  excludeProtocols: [ProtocolEnum.RAYDIUM],
  timeout: 15000
});
```

### Cross-Chain Operations

```typescript
import { IntentsProtocols, ChainIdEnum } from 'genius-intents';

// Configure for multiple chains
const multiChainSDK = new IntentsProtocols({
  method: 'best',
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  suiRpcUrl: 'https://sui-mainnet.blockvision.org/v1/YOUR_API_KEY',
  okxApiKey: 'your-okx-api-key',
  okxSecretKey: 'your-okx-secret-key',
  okxPassphrase: 'your-okx-passphrase',
  okxProjectId: 'your-okx-project-id',
  zeroXApiKey: 'your-0x-api-key'
});

// Ethereum Base chain operations
const baseParams = {
  networkIn: ChainIdEnum.BASE,
  networkOut: ChainIdEnum.BASE,
  tokenIn: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  tokenOut: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
  amountIn: '1000000000000000000',
  slippage: 1,
  from: '0x5B1a738cfF4c6064C9C211C611f171a1567D2b9b'
};

// Sui network operations  
const suiParams = {
  networkIn: ChainIdEnum.SUI_MAINNET,
  networkOut: ChainIdEnum.SUI_MAINNET,
  tokenIn: '0x2::sui::SUI',
  tokenOut: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  amountIn: '1000000000', // 1 SUI (9 decimals)
  slippage: 1,
  from: '0x...' // Sui address
};
```

## 📚 API Reference

### IntentsProtocols

The main class for interacting with multiple protocols.

#### Constructor

```typescript
new IntentsProtocols(config?: IntentsProtocolsConfig)
```

**Configuration Options:**
- `method?: 'race' | 'best'` - Execution method ('race' returns fastest, 'best' returns optimal)
- `timeout?: number` - Timeout in milliseconds for individual protocol requests (default: 30000)
- `maxConcurrency?: number` - Maximum concurrent protocol requests (default: 10)
- `includeProtocols?: ProtocolEnum[]` - Specific protocols to include
- `excludeProtocols?: ProtocolEnum[]` - Specific protocols to exclude
- `logger?: ILogger` - Custom logger instance
- `debug?: boolean` - Enable debug logging

**Protocol-Specific Configuration:**
- `solanaRpcUrl?: string` - Solana RPC endpoint
- `suiRpcUrl?: string` - Sui RPC endpoint
- `okxApiKey?: string` - OKX API key
- `okxSecretKey?: string` - OKX secret key
- `okxPassphrase?: string` - OKX passphrase
- `okxProjectId?: string` - OKX project ID
- `zeroXApiKey?: string` - 0x API key
- `kyberswapClientId?: string` - Kyberswap client ID

#### Methods

##### `fetchPrice(params: IntentPriceParams): Promise<IntentsProtocolsResults<PriceResponse>>`

Get price quotes from multiple protocols.

**Parameters:**
- `networkIn: number` - Input network chain ID
- `networkOut: number` - Output network chain ID
- `tokenIn: string` - Input token address
- `tokenOut: string` - Output token address
- `amountIn: string` - Amount to trade (in token's smallest unit)
- `slippage: number` - Slippage tolerance as percentage (e.g., 1 for 1%)
- `from: string` - User's wallet address

##### `fetchQuote(params: IntentQuoteParams): Promise<IntentsProtocolsResults<QuoteResponse>>`

Get detailed quotes including transaction data.

**Parameters:**
- All parameters from `IntentPriceParams` plus:
- `receiver: string` - Recipient address for the trade
- `priceResponse?: PriceResponse` - Optional pre-fetched price response

#### Utility Methods

- `getInitializedProtocols(): ProtocolEnum[]` - Get list of successfully initialized protocols
- `getProtocol(protocol: ProtocolEnum): IIntentProtocol | undefined` - Get specific protocol instance
- `updateConfig(config: Partial<IntentsProtocolsConfig>): void` - Update configuration

### Supported Protocols

| Protocol | Namespace | Chains | Description |
|----------|-----------|--------|-------------|
| Jupiter | `Jupiter` | Solana | Leading Solana DEX aggregator |
| Raydium V2 | `Raydium` | Solana | Automated market maker |
| Odos | `Odos` | Multi-chain | Multi-chain DEX aggregator |
| OKX | `Okx` | Multi-chain | Centralized exchange DEX |
| Kyberswap | `Kyberswap` | Multi-chain | Dynamic market maker |
| OpenOcean | `OpenOcean` | Multi-chain | DEX aggregator |
| 0x | `ZeroX` | Multi-chain | DEX aggregator protocol |
| Aftermath | `Aftermath` | Sui | Native Sui DEX |
| DeBridge | `DeBridge` | Multi-chain | Cross-chain bridge |
| Genius Bridge | `GeniusBridge` | Multi-chain | Custom bridge solution |

#### Protocol Namespace Exports

Each protocol namespace exports:
- **Service Class**: `[Protocol]Service` (e.g., `Jupiter.JupiterService`)
- **Configuration Types**: Protocol-specific config interfaces
- **Request/Response Types**: All API-related types
- **Internal Types**: Advanced types for protocol-specific development

```typescript
// Example: All available exports from Jupiter namespace
import {
  JupiterService,           // Service class
  type JupiterConfig,       // Configuration
  type JupiterPriceResponse,// Response types
  type JupiterSwapRoutePlan,// Internal types
  // ... and more
} from 'genius-intents';

const { JupiterService } = Jupiter; // Alternative access
```

### Response Structure

Both `fetchPrice()` and `fetchQuote()` return an `IntentsProtocolsResults` object:

```typescript
type IntentsProtocolsResults<T> = {
  result?: T;                    // Best/fastest result based on method
  allResults: Array<{            // All protocol results
    protocol: ProtocolEnum;
    response?: T;
    error?: Error;
    duration: number;
  }>;
  method: 'race' | 'best';       // Execution method used
  totalDuration: number;         // Total execution time
};
```

### Supported Chains

The SDK supports multiple blockchain networks. Chain IDs are numeric values:

```typescript
enum ChainIdEnum {
  SOLANA = 1399811149,
  AVALANCHE = 43114,
  SONIC = 146,
  BSC = 56,
  BASE = 8453,
  SUI = 101,
  ARBITRUM = 42161,
  OPTIMISM = 10,
  BLAST = 81457,
  POLYGON = 137,
  ETHEREUM = 1,
  APTOS = 999,
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:protocols     # Protocol-specific tests

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run linting
npm run lint

# Format code
npm run format
```

## 📝 Examples

Check out the `/tests` directory for comprehensive examples of how to use each protocol service.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [GitHub Repository](https://github.com/Genius-Foundation/genius-intents)
- [Issues](https://github.com/Genius-Foundation/genius-intents/issues)
- [NPM Package](https://www.npmjs.com/package/genius-intents)

## ⚠️ Disclaimer

This SDK is provided as-is. Always verify transactions and test thoroughly before using in production. DeFi protocols carry inherent risks including but not limited to smart contract risks, impermanent loss, and market volatility.

## 📞 Support

For support, questions, or feature requests:
- Open an issue on [GitHub](https://github.com/Genius-Foundation/genius-intents/issues)
- Contact the development team

---

**Built with ❤️ by the Shuttle Labs team** 