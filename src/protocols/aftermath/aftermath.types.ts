export type AftermathConfig = {
  suiRpcUrl: string;
  privateUrl?: string;
  quoteParamOverrides?: Partial<AftermathSwapParams>;
};

export type AftermathPriceParams = {
  /**
   * Required token type for the input token
   * The token the user is swapping from
   */
  coinInType: string;

  /**
   * Required token type for the output token
   * The token the user is swapping to
   */
  coinOutType: string;

  /**
   * Required amount to swap (as BigInt or string)
   */
  coinInAmount: BigInt | string;

  /**
   * Slippage tolerance as a decimal (0.01 = 1%)
   */
  slippage?: number;

  /**
   * Optional external fee configuration
   */
  externalFee?: {
    recipient: string;
    feePercentage: number;
  };
};

// New route-related types
export type AftermathRoutePool = {
  poolId: string;
  poolType: string;
  tokenXType: string;
  tokenYType: string;
  fee: string;
  tickSpacing?: number;
};

export type AftermathRouteStep = {
  pool: AftermathRoutePool;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  feeAmount: string;
};

export type AftermathRoute = {
  steps: AftermathRouteStep[];
  inputToken: string;
  outputToken: string;
  totalAmountIn: string;
  totalAmountOut: string;
  priceImpact: string;
  gasEstimate?: string;
};

export type AftermathSwapParams = {
  /**
   * Required wallet address of the user initiating the swap
   */
  walletAddress: string;

  /**
   * Complete route information from the price response
   */
  completeRoute: AftermathRoute;

  /**
   * Slippage tolerance as a decimal (0.01 = 1%)
   */
  slippage: number;

  /**
   * Whether the transaction is sponsored
   */
  isSponsoredTx?: boolean;
};

export type AftermathPriceResponse = {
  inToken: string;
  outToken: string;
  inAmount: string;
  outAmount: string;
  inTokenTradeFee: string;
  outTokenTradeFee: string;
  spotPrice: string;
  route: AftermathRoute;
  slippage: number;
};

export type AftermathTransactionData = {
  transactionBlock: string;
  lastValidBlockHeight?: number;
  gasEstimate?: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    totalGas: string;
  };
};

export type AftermathQuoteResponse = {
  transactions: string[];
};
