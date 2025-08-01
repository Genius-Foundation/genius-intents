import { OdosQuoteResponse } from '../protocols/odos/odos.types';
import { RaydiumV2QuoteResponse } from '../protocols/raydium/raydium-v2.types';
import { JupiterQuoteResponses } from '../protocols/jupiter/jupiter.types';
import { ProtocolEnum } from './enums';
import { EvmQuoteExecutionPayload, SvmQuoteExecutionPayload } from './quote-execution-payload';
import { OkxQuoteResponse } from '../protocols/okx/okx.types';
import { AftermathQuoteResponse } from '../protocols/aftermath/aftermath.types';
import { OpenOceanQuoteResponse } from '../protocols/openocean/openocean.types';
import { KyberswapQuoteResponse } from '../protocols/kyberswap/kyberswap.types';
import { ZeroXQuoteResponse } from '../protocols/zeroX/zeroX.types';
import { DeBridgeQuoteResponse } from '../protocols/debridge/debridge.types';
import { AcrossQuoteResponse } from '../protocols/across/across.types';
import { GeniusBridgeQuoteResponse } from 'genius-bridge-sdk';

export type QuoteResponse = {
  protocol: ProtocolEnum;
  networkIn: number;
  networkOut: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  estimatedGas?: string;
  simulationSuccess?: boolean;
  slippage: number;
  priceImpact?: number;
  from: string;
  receiver: string;
  evmExecutionPayload?: EvmQuoteExecutionPayload;
  svmExecutionPayload?: SvmQuoteExecutionPayload;
  protocolResponse: RawProtocolQuoteResponse;
};

export type RawProtocolQuoteResponse =
  | OdosQuoteResponse
  | RaydiumV2QuoteResponse
  | JupiterQuoteResponses
  | OkxQuoteResponse
  | AftermathQuoteResponse
  | OpenOceanQuoteResponse
  | KyberswapQuoteResponse
  | ZeroXQuoteResponse
  | GeniusBridgeQuoteResponse
  | AcrossQuoteResponse
  | DeBridgeQuoteResponse;
