import { ChainIdEnum } from '../types/enums';

export function isEVMNetwork(network: ChainIdEnum): boolean {
  return (
    network === ChainIdEnum.ETHEREUM ||
    network === ChainIdEnum.ARBITRUM ||
    network === ChainIdEnum.OPTIMISM ||
    network === ChainIdEnum.POLYGON ||
    network === ChainIdEnum.BSC ||
    network === ChainIdEnum.AVALANCHE ||
    network === ChainIdEnum.BASE ||
    network == ChainIdEnum.SONIC ||
    network == ChainIdEnum.BLAST
  );
}

export function isL2Network(network: ChainIdEnum): boolean {
  return (
    network === ChainIdEnum.ARBITRUM ||
    network === ChainIdEnum.OPTIMISM ||
    network === ChainIdEnum.BASE ||
    network === ChainIdEnum.BLAST
  );
}

export function isMoveNetwork(network: ChainIdEnum): boolean {
  return network === ChainIdEnum.SUI || network === ChainIdEnum.APTOS;
}

export function isSuiNetwork(network: ChainIdEnum): boolean {
  return network === ChainIdEnum.SUI;
}

export function isAptosNetwork(network: ChainIdEnum): boolean {
  return network === ChainIdEnum.APTOS;
}

export function isSolanaNetwork(network: ChainIdEnum): boolean {
  return network === ChainIdEnum.SOLANA;
}
