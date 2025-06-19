import { EvmTransactionData } from '../types/evm-transaction-data';

export type Erc20Approval = {
  spender: string;
  token: string;
  amount: string;
  txnData?: EvmTransactionData;
  required?: boolean;
};
