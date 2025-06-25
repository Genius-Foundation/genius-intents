export type GeniusBridgeConfig = {
  geniusBridgeBaseUrl?: string;
};

export type PermitDetails = {
  token: string;
  amount: string;
  expiration: number;
  nonce: number;
};

export type PermitSingle = {
  details: PermitDetails;
  spender: string;
  sigDeadline: string;
};

export type PermitBatch = {
  details: PermitDetails[];
  spender: string;
  sigDeadline: string;
};

export type PermitSignatureParams = {
  types: unknown;
  domain: { name: string; number: number; verifyingContract: string };
  message: PermitBatch;
};

export type Permit = {
  signature: string;
  permitBatch: PermitBatch;
};

export type Authority = {
  networkInAddress: string;
  networkOutAddress: string;
};

export type EvmArbitraryCall = {
  from?: string;
  to: string;
  data: string;
  value: string;
  gasPrice?: string;
  gasLimit?: string;
};

export type GeniusBridgeFeesBreakdown = {
  base: string;
  bps: string;
  insurance: string;
  swapOut?: string;
  call?: string;
  total: string;
};

export type ApprovalRequired = {
  spender: string;
  amount: string;
  payload: EvmArbitraryCall;
};
