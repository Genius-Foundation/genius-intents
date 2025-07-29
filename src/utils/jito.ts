import { Connection, VersionedTransaction } from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';

export interface ITXSimulationResults {
  jitoSimulations?: unknown;
  simsPassed: boolean;
  status: 'success' | 'error';
  error?: string;
}

export default async function simulateJito(
  jitoRpc: string,
  rpcUrl: string,
  transactions: string[],
): Promise<ITXSimulationResults> {
  const connection = new Connection(rpcUrl);
  const { blockhash } = await connection.getLatestBlockhash('finalized');

  transactions = transactions as string[];
  const encodedTransactions = await Promise.all(
    transactions.map(async txn => {
      const vTxn = VersionedTransaction.deserialize(bs58.decode(txn));
      vTxn.message.recentBlockhash = blockhash;
      return Buffer.from(vTxn.serialize()).toString('base64');
    }),
  );

  const data = {
    jsonrpc: '2.0',
    id: 1,
    method: 'simulateBundle',
    params: [
      {
        encodedTransactions,
      },
      {
        preExecutionAccountsConfigs: Array(encodedTransactions.length).fill(null),
        postExecutionAccountsConfigs: Array(encodedTransactions.length).fill(null),
        skipSigVerify: true,
      },
    ],
  };

  const jitoSimResp = await axios.post(jitoRpc, data);
  const jitoSim = jitoSimResp.data;
  const simsFailed = jitoSim?.result?.value?.summary !== 'succeeded';

  return {
    jitoSimulations: jitoSim,
    simsPassed: !simsFailed,
    status: simsFailed ? 'error' : 'success',
  };
}
