import { ChainIdEnum } from '../../types/enums';

export type OKXCredentials = {
  apiKey: string | null;
  secretKey: string | null;
  passphrase: string | null;
  projectId: string | null;
};

export type ApprovalContracts = {
  [ChainIdEnum.ETHEREUM]: string;
  [ChainIdEnum.ARBITRUM]: string;
  [ChainIdEnum.OPTIMISM]: string;
  [ChainIdEnum.POLYGON]: string;
  [ChainIdEnum.BSC]: string;
  [ChainIdEnum.AVALANCHE]: string;
  [ChainIdEnum.BASE]: string;
};

export type OKXConfig = {
  okxPrivateUrl?: string;
  okxApiKey: string;
  okxSecretKey: string;
  okxPassphrase: string;
  okxProjectId: string;
};

export type OkxQueryParams = {
  [key: string]: string | number;
};

export type OkxPriceRequestBody = {
  amount: string;
  chainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
};

export type OkxQuoteRequestBody = {
  amount: string;
  chainId: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  userWalletAddress: string;
  slippage: number;
  swapReceiverAddress: string;
};

export type Token = {
  decimals: number;
  tokenContractAddress: string;
  tokenSymbol: string;
};

export type TokenWithPrice = Token & {
  tokenUnitPrice: string;
};

export type DexProtocol = {
  dexName: string;
  percent: string;
};

export type SinglechainDexRouter = {
  router: string;
  routerPercent: string;
  subRouterList: SinglechainSubRouter[];
};

export type SinglechainSubRouter = {
  dexProtocol: DexProtocol[];
  fromToken: TokenWithPrice;
  toToken: TokenWithPrice;
};

export type QuoteCompareItem = {
  amountOut: string;
  dexLogo: string;
  dexName: string;
  tradeFee: string;
};

export type SinglechainTransaction = {
  data: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasLimit: string;
  gasPrice: string;
  maxPriorityFeePerGas: string;
  minReceiveAmount: string;
};

export type OkxPriceData = {
  chainId: string;
  dexRouterList: SinglechainDexRouter[];
  estimateGasFee: string;
  fromToken: TokenWithPrice;
  fromTokenAmount: string;
  quoteCompareList: QuoteCompareItem[];
  toToken: TokenWithPrice;
  toTokenAmount: string;
};

export type OkxQuoteData = {
  routerResult: OkxPriceData;
  tx: SinglechainTransaction;
};

export type OkxPriceResponse = {
  code: string | number;
  msg: string;
  data: OkxPriceData[];
};

export type OkxQuoteResponse = {
  code: string | number;
  msg: string;
  data: OkxQuoteData[];
};

export type OkxMultiPriceParams = {
  network: ChainIdEnum;
  from: string;
  tokensIn: string[];
  tokenOut: string;
  amountsIn: string[];
  slippage: string;
};

export type OkxMultiQuoteParams = {
  network: ChainIdEnum;
  fromAddress: string;
  priceData: OkxPriceData;
  receiver?: string;
};
