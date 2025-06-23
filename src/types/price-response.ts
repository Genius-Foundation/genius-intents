import { OdosPriceResponse } from '../protocols/odos/odos.types';
import { PumpFunPriceResponse } from '../protocols/pumpfun/pumpfun.types';
import { RaydiumV2PriceResponse } from '../protocols/raydium/raydium-v2.types';
import { JupiterPriceResponse } from '../protocols/jupiter/jupiter.types';
import { ProtocolEnum } from './enums';
import { OkxPriceResponse } from '../protocols/okx/okx.types';
import { AftermathPriceResponse } from '../protocols/aftermath/aftermath.types';
import { OpenOceanPriceResponse } from '../protocols/openocean/openocean.types';
import { ZeroXPriceResponse } from '../protocols/zeroX/zeroX.types';
import { GeniusBridgePriceResponse } from '../protocols/genius-bridge/genius-bridge.types';
import { DeBridgeQuoteResponse } from '../protocols/debridge/debridge.types';
import { AcrossQuoteResponse } from '../protocols/across/across.types';

export type RawProtocolPriceResponse =
  | OdosPriceResponse
  | RaydiumV2PriceResponse
  | PumpFunPriceResponse
  | JupiterPriceResponse
  | OkxPriceResponse
  | AftermathPriceResponse
  | OpenOceanPriceResponse
  | ZeroXPriceResponse
  | GeniusBridgePriceResponse
  | AcrossQuoteResponse
  // Debridge only supports quotes
  | DeBridgeQuoteResponse;

export type PriceResponse = {
  protocol: ProtocolEnum;
  networkIn: number;
  networkOut: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  estimatedGas?: string;
  protocolResponse: RawProtocolPriceResponse;
  slippage: number;
  priceImpact?: number;
};
