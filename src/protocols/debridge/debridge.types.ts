import { ChainIdEnum } from '../../types/enums';

export type DeBridgeConfig = {
  deBridgePrivateUrl?: string;
  debridgeAccessToken?: string;
  solanaRpcUrl?: string;
};

export type DeBridgePriceParams = {
  // Additional fields specific to DeBridge price params
  networkIn: ChainIdEnum;
  networkOut: ChainIdEnum;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
  from: string;
  to?: string;
  authority?: {
    networkInAddress: string;
    networkOutAddress: string;
  };
};

export type DeBridgeQuoteParams = DeBridgePriceParams & {
  to: string;
  authority: {
    networkInAddress: string;
    networkOutAddress: string;
  };
  priceResponse?: DeBridgeQuoteResponse;
};

// Token type for both source and destination chains
export type Token = {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  amount: string;
  approximateUsdValue: number;
};

// Source chain token input
export type SrcChainTokenIn = Token & {
  approximateOperatingExpense: string;
  mutatedWithOperatingExpense: boolean;
  originApproximateUsdValue: number;
};

// Source chain token output
export type SrcChainTokenOut = Token & {
  maxRefundAmount: string;
};

// Destination chain token output
export type DstChainTokenOut = Token & {
  recommendedAmount: string;
  maxTheoreticalAmount: string;
  recommendedApproximateUsdValue: number;
  maxTheoreticalApproximateUsdValue: number;
};

// Cost details type
export type CostDetail = {
  name: string;
  amount: string;
  token: {
    symbol: string;
    address: string;
  };
  amountUsd: number;
};

// Transaction type
export type Transaction = {
  allowanceTarget?: string;
  allowanceValue?: string;
  value?: string;
  data?: string;
  to?: string;
};

// Order type
export type Order = {
  approximateFulfillmentDelay: number;
  salt?: number;
  metadata?: string;
};

export type DeBridgeQuoteResponse = {
  estimation: {
    srcChainTokenIn: SrcChainTokenIn;
    srcChainTokenOut: SrcChainTokenOut;
    dstChainTokenOut: DstChainTokenOut;
    costsDetails: CostDetail[];
    recommendedSlippage: number;
  };
  tx: Transaction;
  order: Order;
  orderId?: string;
  fixFee: string;
  userPoints: number;
  integratorPoints: number;
};

export type DebridgeFeeResponse = {
  /**
   * The fixed native fee for the bridging operation.
   */
  fixFee: string;

  /**
   * The transfer fee for the bridging operation. (in token base units)
   */
  transferFee: string;

  /**
   * The transfer fee in basis points (bps) for the bridging operation.
   */
  transferFeeBps: string;
};

export type DebridgeStatusResponse = {
  orderIds: string[];
};

export type DebridgeCancelOrderResponse = {
  tx: {
    data: string;
    to: string;
    value: string;
    chainId: number;
  };
};
