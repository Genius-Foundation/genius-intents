export type PumpFunConfig = {
  solanaRpcUrl: string;
};

export type PumpFunPriceResponse = {
  // Direct operations (SOL ⟷ Pumpfun)
  tokenMint: string;
  tokenAmount: string;
  solAmount: string;
  operation: 'buy' | 'sell';
  feeBasisPoint: string;
};

export type PumpFunQuoteResponse = {
  transactions: string[];
};
