import { Erc20Approval } from './erc20-approval';
import { EvmTransactionData } from './evm-transaction-data';

export type EvmQuoteExecutionPayload = {
  transactionData: EvmTransactionData;
  approval: Erc20Approval;
};

export type SolanaQuoteExecutionPayload = {
  // The transaction data is an array of bs58 encoded versioned transaction
  transactionData: string[];
};

export type QuoteExecutionPayload = EvmQuoteExecutionPayload | SolanaQuoteExecutionPayload;
