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
  privateUrl?: string;
  okxCredentials: OKXCredentials;
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
  slippage?: number;
  maxAutoSlippage?: number;
  autoSlippage?: boolean;
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

export type OkxSignatureParams = {
  /**
   * The API method to utilize
   * (POST, GET, DELETE, PUT)
   */
  method: string;

  /**
   * The API endpoint to utilize
   */
  requestPath: string;

  /**
   * The request body to utilize
   */
  queryParams?: OkxQueryParams;

  /**
   * The request body to utilize
   */
  body?: string;
};

export type OkxSignatureResponse = {
  /**
   * The hashed signature to utilize
   */
  signature: string;

  /**
   * The timestamp to utilize
   */
  timestamp: string;
};

export type OkxSolanaQuoteResponse = {
  code: string;
  data: {
    addressLookupTableAddresses?: string[]; // Legacy field name
    addressLookupTableAccount?: string[]; // Current field name
    instructionLists: ISolanaInstruction[];
    routerResult?: unknown; // Additional fields from your actual response
    tx?: unknown;
  };
  msg: string;
};

interface ISolanaInstruction {
  data: string;
  accounts: ISolanaAccount[];
  programId: string;
}

interface ISolanaAccount {
  isSigner: boolean;
  isWritable: boolean;
  pubkey: string;
}

export type OkxEvmQuoteToExecutionPayloadParams = {
  tokenIn: string;
  amountIn: string;
  response: OkxQuoteResponse;
  networkIn: ChainIdEnum;
};

export type OkxSolanaQuoteToExecutionPayloadParams = {
  from: string;
  response: OkxSolanaQuoteResponse;
};
