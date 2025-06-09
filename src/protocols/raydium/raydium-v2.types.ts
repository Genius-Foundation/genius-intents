import { TokenAccount, TokenAccountRaw } from '@raydium-io/raydium-sdk-v2';

export type RaydiumSdkConfig = {
  solanaRpcUrl: string;
};

export type RaydiumApiPriceParams = {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
};

export type RaydiumApiQuoteParams = {
  computeBudget: number;
  priceResponse: RaydiumV2PriceResponse;
  from: string;
  isInputSol: boolean;
  isOutputSol: boolean;
  inputAccount?: string;
  outputAccount?: string;
};

export type RaydiumTokenAccountsResponse = {
  tokenAccounts: TokenAccount[];
  tokenAccountRawInfos: TokenAccountRaw[];
};

export type RaydiumV2PriceResponse = {
  id: string;
  success: boolean;
  version: 'V0' | 'V1';
  openTime?: undefined;
  msg: undefined;
  data: SwapData;
};

export type RaydiumV2QuoteResponse = {
  id: string;
  version: string;
  success: boolean;
  data: { transaction: string }[];
};

export type RaydiumV2QuoteErrorResponse = {
  id: string;
  version: string;
  success: boolean;
  msg: string;
};

export type RaydiumV2FeesResponse = {
  id: string;
  success: boolean;
  data: RaydiumV2FeeData;
};

export type RaydiumV2TransactionResponse = {
  id: string;
  version: string;
  success: boolean;
  data: TransactionData[];
};

export type RaydiumV2FeeData = {
  id: string;
  success: boolean;
  data: { default: { vh: number; h: number; m: number } };
};

type TransactionData = {
  transaction: string;
};

type RoutePlanItem = {
  poolId: string;
  inputMint: string;
  outputMint: string;
  feeMint: string;
  feeRate: number;
  feeAmount: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remainingAccounts: any[];
};

type SwapData = {
  swapType: 'BaseIn';
  inputMint: string;
  inputAmount: string;
  outputMint: string;
  outputAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: number;
  referrerAmount: string;
  routePlan: RoutePlanItem[];
};

export type RaydiumQuoteResponses = {
  transactions: string[];
};
