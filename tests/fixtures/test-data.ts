import { ChainIdEnum, ProtocolEnum } from '../../src/types/enums';
import { IntentPriceParams } from '../../src/types/price-params';
import { IntentQuoteParams } from '../../src/types/quote-params';

// Common token addresses for testing
export const TEST_TOKENS = {
  [ChainIdEnum.ETHEREUM]: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xa0b86a33e6c3b3f4ac24b8b6e95e80e1e5c2d68e',
    WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  },
  [ChainIdEnum.SOLANA]: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    WRAPPED_SOL: 'So11111111111111111111111111111111111111112',
  },
  [ChainIdEnum.BSC]: {
    BNB: '0x0000000000000000000000000000000000000000',
    USDT: '0x55d398326f99059ff775485246999027b3197955',
  },
  [ChainIdEnum.SUI]: {
    USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    WAL: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
  },
} as const;

// Test wallets (non-private, for testing only)
export const TEST_WALLETS = {
  EVM: '0x742d35cc6641c2344c2db5c9c7db0e5d5b0f7e2b',
  SOLANA: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  SUI: '0x1234567890abcdef1234567890abcdef12345678',
} as const;

// Standard test parameters for price requests
export const createPriceParams = (overrides: Partial<IntentPriceParams> = {}): IntentPriceParams => ({
  networkIn: ChainIdEnum.ETHEREUM,
  networkOut: ChainIdEnum.ETHEREUM,
  tokenIn: TEST_TOKENS[ChainIdEnum.ETHEREUM].ETH,
  tokenOut: TEST_TOKENS[ChainIdEnum.ETHEREUM].USDC,
  amountIn: '1000000000000000000', // 1 ETH in wei
  slippage: 100, // 1% in BPS
  from: TEST_WALLETS.EVM,
  ...overrides,
});

// Standard test parameters for quote requests
export const createQuoteParams = (overrides: Partial<IntentQuoteParams> = {}): IntentQuoteParams => ({
  ...createPriceParams(),
  from: TEST_WALLETS.EVM,
  receiver: TEST_WALLETS.EVM,
  priceResponse: undefined,
  ...overrides,
});

// Cross-chain test scenarios
export const CROSS_CHAIN_SCENARIOS = [
  {
    name: 'ETH to BSC USDT',
    params: createPriceParams({
      networkIn: ChainIdEnum.ETHEREUM,
      networkOut: ChainIdEnum.BSC,
      tokenIn: TEST_TOKENS[ChainIdEnum.ETHEREUM].ETH,
      tokenOut: TEST_TOKENS[ChainIdEnum.BSC].USDT,
    }),
  },
  {
    name: 'SOL to ETH USDC',
    params: createPriceParams({
      networkIn: ChainIdEnum.SOLANA,
      networkOut: ChainIdEnum.ETHEREUM,
      tokenIn: TEST_TOKENS[ChainIdEnum.SOLANA].SOL,
      tokenOut: TEST_TOKENS[ChainIdEnum.ETHEREUM].USDC,
      from: TEST_WALLETS.SOLANA,
    }),
  },
] as const;

// Protocol-specific expected behaviors
export const PROTOCOL_EXPECTATIONS = {
  [ProtocolEnum.JUPITER]: {
    supportedChains: [ChainIdEnum.SOLANA],
    singleChain: true,
    multiChain: false,
    requiresApprovals: false,
  },
  [ProtocolEnum.ODOS]: {
    supportedChains: [
      ChainIdEnum.ETHEREUM,
      ChainIdEnum.ARBITRUM,
      ChainIdEnum.OPTIMISM,
      ChainIdEnum.POLYGON,
      ChainIdEnum.BSC,
      ChainIdEnum.AVALANCHE,
      ChainIdEnum.BASE,
      ChainIdEnum.SONIC,
    ],
    singleChain: true,
    multiChain: false,
    requiresApprovals: true,
  },
  [ProtocolEnum.OPEN_OCEAN]: {
    supportedChains: [
      ChainIdEnum.ETHEREUM,
      ChainIdEnum.ARBITRUM,
      ChainIdEnum.OPTIMISM,
      ChainIdEnum.POLYGON,
      ChainIdEnum.BSC,
      ChainIdEnum.AVALANCHE,
      ChainIdEnum.BASE,
      ChainIdEnum.SOLANA,
      ChainIdEnum.SONIC,
    ],
    singleChain: true,
    multiChain: false,
    requiresApprovals: true,
  },
} as const;

// Mock API responses for different protocols
export const MOCK_RESPONSES = {
  JUPITER_PRICE: {
    inputMint: 'So11111111111111111111111111111111111111112',
    inAmount: '1000000000',
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    outAmount: '180000000',
    otherAmountThreshold: '178200000',
    swapMode: 'ExactIn',
    slippageBps: 100,
    platformFee: null,
    priceImpactPct: '0.01',
    routePlan: [],
  },
  ODOS_PRICE: {
    pathId: 'test-path-id-123',
    inAmounts: ['1000000000000000000'],
    outAmounts: ['1800000000'],
    gasEstimate: 150000,
    dataGasEstimate: 21000,
    gweiPerGas: 20,
    gasEstimateValue: 0.00003,
    inTokens: ['0x0000000000000000000000000000000000000000'],
    outTokens: ['0xa0b86a33e6c3b3f4ac24b8b6e95e80e1e5c2d68e'],
    netOutValue: 1800,
  },
} as const;
