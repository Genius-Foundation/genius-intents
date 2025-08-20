import { Erc20Approval } from './erc20-approval';
import { EvmTransactionData } from './evm-transaction-data';

export type EvmQuoteExecutionPayload = {
  transactionData: EvmTransactionData;
  approval: Erc20Approval;
};

export type SvmQuoteExecutionPayload = string[];
