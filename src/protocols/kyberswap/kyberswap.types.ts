import { ChainIdEnum } from '../../types/enums';
import { RawProtocolPriceResponse } from '../../types/price-response';

export type KyberswapConfig = {
  clientId: string;
  privateUrl?: string;
};

export type KyberswapPriceRequestBody = {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  to: string;
  saveGas: boolean;
  gasInclude: boolean;
  slippageTolerance: number;
  source?: string;
};

export type KyberswapQuoteRequestBody = {
  source: string;
  routeSummary: RouteSummary;
  sender: string;
  slippageTolerance: number;
  recipient: string;
  enableGasEstimation?: boolean;
};

export type PoolExtra = {
  tokenInIndex?: number;
  tokenOutIndex?: number;
  underlying?: boolean;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  TokenInIsNative?: boolean;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  TokenOutIsNative?: boolean;
  blockNumber?: number;
  vault?: string;
  poolId?: string;
  fee?: number;
  feePrecision?: number;
};

export type ExtraFee = {
  feeAmount: string;
  chargeFeeBy: string;
  isInBps: boolean;
  feeReceiver: string;
};

export type Pool = {
  pool: string;
  tokenIn: string;
  tokenOut: string;
  limitReturnAmount: string;
  swapAmount: string;
  amountOut: string;
  exchange: string;
  poolLength: number;
  poolType: string;
  poolExtra: PoolExtra | null;
  extra: Record<string, unknown> | null;
};

export type RouteSummary = {
  tokenIn: string;
  amountIn: string;
  amountInUsd: string;
  tokenInMarketPriceAvailable: boolean;
  tokenOut: string;
  amountOut: string;
  amountOutUsd: string;
  tokenOutMarketPriceAvailable: boolean;
  gas: string;
  gasPrice: string;
  gasUsd: string;
  extraFee: ExtraFee;
  route: Pool[][];
  extra: {
    chunksInfo: {
      amountIn: string;
      amountOut: string;
      amountInUsd: string;
      amountOutUsd: string;
    }[];
  };
};

export type KyberswapPriceResponse = {
  routeSummary: RouteSummary;
  routerAddress: string;
} & RawProtocolPriceResponse;

export type KyberswapQuoteResponse = {
  amountIn: string;
  amountInUsd: string;
  amountOut: string;
  amountOutUsd: string;
  gas: string;
  gasUsd: string;
  additionalCostUsd: string;
  additionalCostError?: string;
  outputChange: {
    amount: string;
    percent: number;
    level: number;
  };
  data: string;
  routerAddress: string;
};

export type KyberswapMultiPriceParams = {
  network: ChainIdEnum;
  from: string;
  tokensIn: string[];
  tokenOut: string;
  amountsIn: string[];
  slippage: string;
};

export type KyberswapMultiQuoteParams = {
  network: ChainIdEnum;
  fromAddress: string;
  routeSummary: RouteSummary;
  receiver?: string;
};
