export type FourMemeConfig = {
  bscRpcUrl: string;
};

export type FourMemePriceResponse = {
  routeSummary: {
    tokenIn: string;
    amountIn: string;
    tokenOut: string;
    amountOut: string;
    gas: string;
    route: Array<{ protocol: string; percentage: number }>;
  };
  routerAddress: string;
};

export type FourMemeQuoteResponse = {
  amountIn: string;
  amountOut: string;
  gas: string;
  data: string;
  routerAddress: string;
  tokenManagerVersion: string;
  isBuying: boolean;
};

export type TokenInfo = {
  version: bigint;
  tokenManager: string;
  quote: string;
  lastPrice: bigint;
  tradingFeeRate: bigint;
  minTradingFee: bigint;
  launchTime: bigint;
  offers: bigint;
  maxOffers: bigint;
  funds: bigint;
  maxFunds: bigint;
  liquidityAdded: boolean;
};
