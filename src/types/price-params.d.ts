export type IntentPriceParams = {
  networkIn: number;
  networkOut: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
  from: string; // TODO: check if really necessary in Odos, and if yes try to find workaround
};
