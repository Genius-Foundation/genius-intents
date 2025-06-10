type TokenAttribute = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  trait_type: string;
  value: string | number;
};

export type SPLMetadata = {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: number;
  uri?: string;
  image?: string;
  attributes?: TokenAttribute[];
  isNFT?: boolean;
};
