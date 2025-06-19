import { JsonRpcProvider, Contract, Interface } from 'ethers';
import { erc20Abi } from './erc20.abi';

export class Erc20Service {
  public address: string;

  protected client: JsonRpcProvider;
  protected contract: Contract;

  constructor(address: string, rpcUrl: string) {
    this.address = address;
    this.client = new JsonRpcProvider(rpcUrl);
    this.contract = new Contract(this.address, erc20Abi, this.client);
  }

  public async allowance(owner: string, spender: string): Promise<bigint> {
    if (!this.contract['allowance']) throw new Error('Allowance not supported');
    return this.contract['allowance'](owner, spender);
  }

  static getApproveTxData(spender: string, amount: string): string {
    const iface = new Interface(erc20Abi);
    return iface.encodeFunctionData('approve', [spender, amount]);
  }
}
