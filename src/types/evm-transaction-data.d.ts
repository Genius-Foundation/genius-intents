export type EvmTransactionData = {
  to: string;
  data: string;
  value: string;
  gasLimit?: string;
  gasEstimate?: string;
};
