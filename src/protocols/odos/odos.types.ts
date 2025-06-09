import { ChainIdEnum } from '../../types/enums';

export type OdosPriceResponse = {
  inTokens: string[];
  outTokens: string[];
  inAmounts: string[];
  outAmounts: string[];
  gasEstimate: number;
  dataGasEstimate: number;
  gweiPerGas: number;
  gasEstimateValue: number;
  inValues: number[];
  outValues: number[];
  netOutValue: number;
  priceImpact: number;
  percentDiff: number;
  partnerFeePercent: number;
  pathId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pathViz: any;
  blockNumber: number;
};

export type OdosTransaction = {
  gas: number;
  gasPrice: number;
  value: string;
  to: string;
  from: string;
  data: string;
  nonce: number;
  chainId: number;
};

export type OdosQuoteResponse = {
  deprecated: string;
  blockNumber: number;
  gasEstimate: number;
  gasEstimateValue: number;
  inputTokens: { tokenAddress: string; amount: string }[];
  outputTokens: { tokenAddress: string; amount: string }[];
  netOutValue: number;
  outValues: string[];
  transaction: OdosTransaction;
  simulation: {
    isSuccess: boolean;
    amountsOut: number[];
    gasEstimate: number;
    simulationError: {
      type: string;
      errorMessage: string;
    };
  };
};

export type OdosQuoteRequestBody = {
  chainId: number | string;
  inputTokens: OdosRequestTokenInput[];
  outputTokens: OdosRequestTokenOutput[];
  slippageLimitPercent: string;
  referralCode: number;
  disableRFQs: boolean;
  compact: boolean;
  userAddr: string;
  simple: boolean;
};

export type OdosAssembleRequestBody = {
  userAddr: string;
  pathId: string;
  simulate: boolean;
  receiver?: string;
};

export type OdosMultiPriceParams = {
  network: ChainIdEnum;
  from: string;
  tokensIn: string[];
  tokenOut: string;
  amountsIn: string[];
  slippage: string;
};

export type OdosMultiQuoteParams = {
  network: ChainIdEnum;
  fromAddress: string;
  pathId: string;
  receiver?: string;
};

export type OdosMultiPriceRequestBody = {
  chainId: number;
  inputTokens: OdosRequestTokenInput[];
  outputTokens: OdosRequestTokenOutput[];
  userAddr: string;
  slippageLimitPercent: string;
  referralCode: number;
  disableRFQs: boolean;
  compact: boolean;
  simple: true;
};

export type OdosMultiQuoteRequestBody = {
  userAddr: string;
  pathId: string;
  simulate: boolean;
  receiver?: string;
};

type OdosRequestTokenInput = {
  tokenAddress: string;
  amount: string;
};

type OdosRequestTokenOutput = {
  tokenAddress: string;
  proportion: number;
};
