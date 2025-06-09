import { EvmTransactionData } from './evm-transaction-data';

export type Erc20Approval = {
  spender: string;
  amount: string;
  payload?: EvmTransactionData;
};
