import { Erc20Approval } from './erc20-approval';
import { EvmTransactionData } from './evm-transaction-data';
import { SolanaTransactionData } from './solana-transaction-data';

export type EvmQuoteExecutionPayload = {
  transactionData: EvmTransactionData;
  approvalRequired?: Erc20Approval | false;
};

export type SolanaQuoteExecutionPayload = {
  transactionData: (SolanaTransactionData | string)[];
};

export type QuoteExecutionPayload = EvmQuoteExecutionPayload | SolanaQuoteExecutionPayload;
