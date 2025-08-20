import { IntentPriceParams } from './price-params';
import { PriceResponse } from './price-response';

export type IntentQuoteParams = IntentPriceParams & {
  receiver: string;
  priceResponse?: PriceResponse;
  priorityFee?: string; // in wei for EVM chains, in lamports for Solana
};
