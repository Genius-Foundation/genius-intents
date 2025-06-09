import { ChainIdEnum } from '../../types/enums';

export type GeniusBridgeConfig = {
  geniusBridgeBaseUrl?: string;
};

export type PermitDetails = {
  token: string;
  amount: string;
  expiration: number;
  nonce: number;
};

export type PermitSingle = {
  details: PermitDetails;
  spender: string;
  sigDeadline: string;
};

export type PermitBatch = {
  details: PermitDetails[];
  spender: string;
  sigDeadline: string;
};

export type PermitSignatureParams = {
  types: unknown;
  domain: { name: string; number: number; verifyingContract: string };
  message: PermitBatch;
};

export type Permit = {
  signature: string;
  permitBatch: PermitBatch;
};

export type Authority = {
  networkInAddress: string;
  networkOutAddress: string;
};

export type GeniusBridgePriceParams = {
  networkIn: number;
  networkOut: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
  from: string;
  callTarget?: string;
  callData?: string;
};

export type GeniusBridgeQuoteParams = GeniusBridgePriceParams & {
  priceResponse?: GeniusBridgePriceResponse;
  to: string;
  authority?: Authority;
  permit?: Permit;
};

export type EvmArbitraryCall = {
  from?: string;
  to: string;
  data: string;
  value: string;
  gasPrice?: string;
  gasLimit?: string;
};

export type GeniusBridgeFeesBreakdown = {
  base: string;
  bps: string;
  insurance: string;
  swapOut?: string;
  call?: string;
  total: string;
};

export type ApprovalRequired = {
  spender: string;
  amount: string;
  payload: EvmArbitraryCall;
};

export type GeniusBaseBridgeResponse = {
  tokenIn: string;
  tokenOut: string;
  networkIn: ChainIdEnum;
  networkOut: ChainIdEnum;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  slippage: number;
  fee: string;
  feesDetails: GeniusBridgeFeesBreakdown;
  arbitraryCall?: EvmArbitraryCall;
};

export type GeniusBridgePriceResponse = GeniusBaseBridgeResponse & {
  swapInAmountOut?: string;
  swapOutAmountOut?: string;
  permit2ToSign?: PermitSignatureParams;
};

export type GeniusBridgeQuoteResponse = GeniusBaseBridgeResponse & {
  seed: string;
  evmExecutionPayload?: EvmArbitraryCall;
  svmExecutionPayload?: string[];
  approvalRequired?: ApprovalRequired | null;
};
