import { ChainIdEnum } from '../../types/enums';

export const acrossConfig: {
  addresses: { [network: number]: string };
} = {
  addresses: {
    [ChainIdEnum.BASE]: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
    [ChainIdEnum.BLAST]: '0x2D509190Ed0172ba588407D4c2df918F955Cc6E1',
    [ChainIdEnum.ETHEREUM]: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
    [ChainIdEnum.OPTIMISM]: '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
    [ChainIdEnum.POLYGON]: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096',
    [ChainIdEnum.ARBITRUM]: '0xe35e9842fceaca96570b734083f4a58e8f7c5f2a',
  },
};
