import { DeBridgePriceParams } from '../protocols/debridge/debridge.types';

export type IntentPriceParams = {
  networkIn: number;
  networkOut: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;

  /**
   * Slippage is the maximum allowed price deviation from the best price.
   * It is a percentage of the best price.
   * For example, if the best price is 100 and the slippage is 0.5,
   * the maximum allowed price is 100.5.
   * If the price is 100.5, the swap will fail.
   * If the price is 99.5, the swap will succeed.
   */
  slippage: number;
  from: string;

  overrideParamsDebridge?: Partial<DeBridgePriceParams>;
};
