export type GeniusBridgeConfig = {
  geniusBridgeBaseUrl?: string;
  geniusBridgePriceEndpoint?: string;
  geniusBridgeQuoteEndpoint?: string;
  debug?: boolean;
  rpcUrls?: Record<number, string | string[]>;
};

export type GeniusBridgeFeesBreakdown = {
  base: string;
  bps: string;
  insurance: string;
  swapOut?: string;
  call?: string;
  total: string;
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
  sponsor?: boolean;
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

export type GeniusBridgeFeesDetails = {
  base: string;
  swapOut: string;
  call: string;
  total: string;
};

export type AggregatorSwapExecution = {
  data: string;
  to: string;
  value?: string;
};

export type AggregatorSwapPriceResponse = {
  aggregator: string;
  tokenOut: string;
  amountOut: string;
  network: number;
  priceImpact?: number;
  response: unknown;
};

export type AggregatorSwapQuoteResponse = AggregatorSwapPriceResponse & {
  evmExecutionPayload: AggregatorSwapExecution[];
};

export type ApprovalRequired = {
  spender: string;
  amount: string;
  txn?: EvmArbitraryCall;
};

export type GeniusBridgePriceResponse = {
  tokenIn: string;
  tokenOut: string;
  networkIn: number;
  networkOut: number;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  fee: string;
  feesDetails: GeniusBridgeFeesDetails;
  swapIn?: AggregatorSwapPriceResponse;
  swapOut?: AggregatorSwapPriceResponse;
  permit2ToSign?: PermitSignatureParams;
};

export type GeniusBridgeQuoteResponse = {
  evmExecutionPayload?: AggregatorSwapExecution;
  svmExecutionPayload?: string[];
  isNativeSwap: boolean;
  gasEstimate: string;
  gasLimit: string;
  approvalRequired: ApprovalRequired | null;
  // swapInQuote?: any;
};

export type DebridgeStatusResponse = {
  orderIds: string[];
};

export type DebridgeCancelOrderResponse = {
  tx: {
    data: string;
    to: string;
    value: string;
    chainId: number;
  };
};

export type DebridgeDFeeResponse = {
  fixFee: string;
  transferFee: string;
  transferFeeBps: string;
};

export type GeniusBridgePriceRequestParams = {
  /**
   * The network ID of the source chain (e.g., Ethereum, Avalanche).
   */
  networkIn: number;

  /**
   * The network ID of the destination chain (e.g., Ethereum, Avalanche).
   */
  networkOut: number;

  /**
   * The address of the token being swapped from.
   */
  tokenIn: string;

  /**
   * The address of the token being swapped to.
   */
  tokenOut: string;

  /**
   * The amount of tokens being swapped.
   */
  amountIn: string;

  /**
   * The slippage tolerance for the swap.
   */
  slippage: number;

  /**
   * The address of the user initiating the swap.
   */
  from: string;

  /**
   * The target of the call secondary call on the destination chain.
   */
  callTarget?: string;

  /**
   * The data for the secondary call on the destination chain.
   */
  callData?: string;

  /**
   * Whether or not the transaction is to be sponsored.
   */
  sponsor?: boolean;
};

export type GeniusBrdidgeQuoteRequestParams = GeniusBridgePriceRequestParams & {
  /**
   * The address of the user receiving the tokens on the destination chain.
   */
  to: string;

  /**
   * The authority for the transaction.
   */
  authority?: Authority;

  /**
   * The permit for the transaction.
   */
  permit?: Permit;

  /**
   * The response from the price request.
   */
  priceResponse?: GeniusBridgePriceResponse;

  /**
   * The percentage of post swap SVM token amount to be used for the swap.
   */
  svmTokenAmountPercentage?: number;
};
