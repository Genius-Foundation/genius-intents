import { OdosPriceResponse } from '../protocols/odos/odos.types';
import { RaydiumV2PriceResponse } from '../protocols/raydium/raydium-v2.types';
import { JupiterPriceResponse } from '../protocols/jupiter/jupiter.types';
import { ProtocolEnum } from './enums';
import { OkxPriceResponse } from '../protocols/okx/okx.types';
import { AftermathPriceResponse } from '../protocols/aftermath/aftermath.types';
import { OpenOceanPriceResponse } from '../protocols/openocean/openocean.types';
import { ZeroXPriceResponse } from '../protocols/zeroX/zeroX.types';
import { DeBridgeQuoteResponse } from '../protocols/debridge/debridge.types';
import { AcrossQuoteResponse } from '../protocols/across/across.types';
import { GeniusBridgePriceResponse } from 'genius-bridge-sdk';

export type RawProtocolPriceResponse =
  | OdosPriceResponse
  | RaydiumV2PriceResponse
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
