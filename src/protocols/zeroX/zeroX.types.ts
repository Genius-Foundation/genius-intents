import { ChainIdEnum } from '../../types/enums';

export type ZeroXConfig = {
  zeroXApiKey: string;
  zeroXBaseUrl?: string;
};

// Price Request Types
export type ZeroXPriceRequestParams = {
  chainId: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  excludedSources?: string;
  slippageBps?: string;
};

// Quote Request Types
export type ZeroXQuoteRequestParams = {
  chainId: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker: string;
  excludedSources?: string;
  slippageBps?: string;
};

// Fee-related types
export type ZeroXFee = {
  amount: string;
  token: string;
  type: string;
};

export type ZeroXFees = {
  integratorFee: null | ZeroXFee;
  zeroExFee: ZeroXFee;
  gasFee: null | ZeroXFee;
};

// Issue-related types
export type ZeroXBalanceIssue = {
  token: string;
  actual: string;
  expected: string;
};

export type ZeroXIssues = {
  allowance: null | unknown;
  balance: ZeroXBalanceIssue | null;
  simulationIncomplete: boolean;
  invalidSourcesPassed: unknown[];
};

// Route-related types
export type ZeroXFill = {
  from: string;
  to: string;
  source: string;
  proportionBps: string;
};

export type ZeroXToken = {
  address: string;
  symbol: string;
};

export type ZeroXRoute = {
  fills: ZeroXFill[];
  tokens: ZeroXToken[];
};

// Token metadata types
export type ZeroXTokenTaxInfo = {
  buyTaxBps: string;
  sellTaxBps: string;
};

export type ZeroXTokenMetadata = {
  buyToken: ZeroXTokenTaxInfo;
  sellToken: ZeroXTokenTaxInfo;
};

// Transaction details
export type ZeroXTransaction = {
  to: string;
  data: string;
  gas: string;
  gasPrice: string;
  value: string;
};

// Main API response type - this matches the raw response from the 0x API
export type ZeroXSwapQuoteResponse = {
  blockNumber: string;
  buyAmount: string;
  buyToken: string;
  fees: ZeroXFees;
  issues: ZeroXIssues;
  liquidityAvailable: boolean;
  minBuyAmount: string;
  route: ZeroXRoute;
  sellAmount: string;
  sellToken: string;
  tokenMetadata: ZeroXTokenMetadata;
  totalNetworkFee: string;
  transaction: ZeroXTransaction;
  zid: string;
};

// Formatted response types to align with your unified interface
export type ZeroXPriceResponse = {
  routeSummary: {
    tokenIn: string;
    amountIn: string;
    tokenOut: string;
    amountOut: string;
    gas: string;
    route: unknown[][];
  };
  routerAddress: string;
};

export type ZeroXQuoteResponse = {
  amountIn: string;
  amountOut: string;
  gas: string;
  data: string;
  routerAddress: string;
  rawResponse: ZeroXSwapQuoteResponse;
};

// Multi-quote params (if needed)
export type ZeroXMultiPriceParams = {
  network: ChainIdEnum;
  from: string;
  tokensIn: string[];
  tokenOut: string;
  amountsIn: string[];
  slippage: string;
};

export type ZeroXMultiQuoteParams = {
  network: ChainIdEnum;
  fromAddress: string;
  routeSummary: unknown; // You may want to define a specific type here
  receiver?: string;
};
