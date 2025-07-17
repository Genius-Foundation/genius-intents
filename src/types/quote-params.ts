import { JupiterSwapUrlParams } from '../protocols/jupiter';
import { IntentPriceParams } from './price-params';
import { PriceResponse } from './price-response';

export type IntentQuoteParams = IntentPriceParams & {
  receiver: string;
  priceResponse?: PriceResponse;

  // overide parameters for specific protocols
  overrideQuoteParamsJupiter?: Partial<JupiterSwapUrlParams>;
};
