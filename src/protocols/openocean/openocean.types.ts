export type OpenOceanConfig = {
  privateUrl?: string;
  apiVersion?: string;
  disabledDexIds?: string;
  enabledDexIds?: string;
};

export type OpenOceanTokenInfo = {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  usd?: string;
  volume?: number;
};

export type OpenOceanDexInfo = {
  dexIndex: number;
  dexCode: string;
  swapAmount: string;
};

export type OpenOceanRouteInfo = {
  from: string;
  to: string;
  parts: number;
  routes: {
    parts: number;
    percentage: number;
    subRoutes: {
      from: string;
      to: string;
      parts: number;
      dexes: {
        dex: string;
        id: string;
        parts: number;
        percentage: number;
      }[];
    }[];
  }[];
};

export type OpenOceanPriceResponse = {
  inToken: OpenOceanTokenInfo;
  outToken: OpenOceanTokenInfo;
  inAmount: string;
  outAmount: string;
  estimatedGas: string;
  dexes?: OpenOceanDexInfo[];
  path?: OpenOceanRouteInfo;
  save?: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  price_impact?: string;
};

export type OpenOceanQuoteResponse = {
  inToken: OpenOceanTokenInfo;
  outToken: OpenOceanTokenInfo;
  inAmount: string;
  outAmount: string;
  estimatedGas: string;
  minOutAmount: string;
  from: string;
  to: string;
  value: string;
  gasPrice: string;
  data: string;
  chainId: number;
  rfqDeadline?: number;
  gmxFee?: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  price_impact?: string;
  dexId: number;
};
