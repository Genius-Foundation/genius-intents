import { Connection, SimulateTransactionConfig, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { ITXSimulationResults } from './jito';

export default async function simulateSolana(
  rpcUrl: string,
  transaction: string,
): Promise<ITXSimulationResults> {
  try {
    const connection = new Connection(rpcUrl);
    const simulateConfig: SimulateTransactionConfig = {
      sigVerify: false,
    };
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    const vTxn = VersionedTransaction.deserialize(bs58.decode(transaction));
    vTxn.message.recentBlockhash = blockhash;
    const singleSimResponse = await connection.simulateTransaction(vTxn, simulateConfig);
    if (!singleSimResponse || !singleSimResponse?.value || singleSimResponse?.value?.err) {
      return {
        simsPassed: false,
        status: 'error',
        error: JSON.stringify(singleSimResponse),
      };
    } else {
      return {
        simsPassed: true,
        status: 'success',
      };
    }
  } catch (e) {
    return {
      simsPassed: false,
      status: 'error',
      error: (e as Error).message,
    };
  }
}
