import { ChainIdEnum, ProtocolEnum } from '../types/enums';
import { IntentPriceParams } from '../types/price-params';
import { PriceResponse } from '../types/price-response';
import { IntentQuoteParams } from '../types/quote-params';
import { QuoteResponse } from '../types/quote-response';

export interface IIntentProtocol {
  protocol: ProtocolEnum;
  singleChain: boolean;
  multiChain: boolean;
  chains: ChainIdEnum[];
  baseUrl?: string;
  //EVM only
  includeApprovals?: boolean;
  fetchPrice(params: IntentPriceParams): Promise<PriceResponse>;
  fetchQuote(params: IntentQuoteParams): Promise<QuoteResponse>;
  isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T;
}
