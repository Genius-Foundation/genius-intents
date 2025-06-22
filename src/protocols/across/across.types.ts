export type AcrossConfig = {
  acrossIntegratorId: `0x${string}`;
  fillDeadlineS?: number; // default 21600
};

export type DepositV3Params = {
  depositor: string;
  recipient: string;
  inputToken: string;
  outputToken: string;
  inputAmount: string | bigint;
  outputAmount: string | bigint;
  destinationChainId: number;
  exclusiveRelayer: string;
  quoteTimestamp: number;
  fillDeadline: number;
  exclusivityDeadlineOffset: number;
  message?: string;
};

export type AcrossQuoteResponse = {
  deposit: {
    inputAmount: bigint;
    outputAmount: bigint;
    destinationChainId: number;
    exclusiveRelayer: string;
    exclusivityDeadline?: number;
    isNative?: boolean;
  };
};
