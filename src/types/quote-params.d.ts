import { IntentPriceParams } from './price-params';
import { PriceResponse } from './price-response';

export type IntentQuoteParams = IntentPriceParams & {
  from: string;
  receiver: string;
  priceResponse?: PriceResponse;
};
