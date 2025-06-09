import { ChainIdEnum } from '../types/enums';

export const chainIdToName = (chainId: ChainIdEnum): string => {
  const chainMap: Record<number, string> = {
    [ChainIdEnum.ETHEREUM]: 'ethereum',
    [ChainIdEnum.BSC]: 'bsc',
    [ChainIdEnum.POLYGON]: 'polygon',
    [ChainIdEnum.AVALANCHE]: 'avalanche',
    [ChainIdEnum.ARBITRUM]: 'arbitrum',
    [ChainIdEnum.OPTIMISM]: 'optimism',
    [ChainIdEnum.BASE]: 'base',
    [ChainIdEnum.SONIC]: 'sonic',
  };

  const name = chainMap[chainId];
  if (!name) {
    throw new Error(`Unsupported network: ${chainId}`);
  }
  return name;
};
