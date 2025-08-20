export type JupiterConfig = {
  privateUrl?: string;
  priceParamOverrides?: Partial<JupiterPriceUrlParams>;
  quoteParamOverrides?: Partial<JupiterSwapUrlParams>;
};

export type JupiterSwapPlatformFee = {
  amount: string;
  feeBps: number;
};

export type JupiterSwapRoutePlanSwapInfo = {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
};

export type JupiterSwapRoutePlan = {
  swapInfo: JupiterSwapRoutePlanSwapInfo;
  percent: number;
};

export type JupiterPriceResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  computedAutoSlippage?: number;
  platformFee: JupiterSwapPlatformFee;
  priceImpactPct: string;
  routePlan: JupiterSwapRoutePlan[];
  contextSlot: number;
  timeTaken: number;
};

export type ComputeBudgetInstruction = {
  programId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accounts: any[];
  data: string;
};

export type SetupInstruction = {
  programId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accounts: any[];
  data: string;
};

export type Instructions = {
  computeBudgetInstructions: ComputeBudgetInstruction[];
  setupInstructions: SetupInstruction[];
};

export type JupiterPriceUrlParams = {
  /**
   * Required token mint address for the input token
   * The token the user is swapping from
   */
  inputMint: string;

  /**
   * Required token mint address for the output token
   * The token the user is swapping to
   */
  outputMint: string;

  /**
   * Required raw amount to swap (before decimals)
   * - If swapMode=ExactIn: This is the input amount
   * - If swapMode=ExactOut: This is the output amount
   */
  amount: number;

  /**
   * Slippage tolerance in basis points (1 bp = 0.01%)
   * Controls how much price movement is acceptable
   * Example: 50 = 0.5% slippage tolerance
   */
  slippageBps?: number;

  /**
   * Determines whether the input or output amount is fixed
   * - ExactIn: User specifies exact input amount, output may vary within slippage
   * - ExactOut: User specifies exact output amount, input may vary within slippage
   * Note: Not all AMMs support ExactOut
   * @default "ExactIn"
   */
  swapMode?: 'ExactIn' | 'ExactOut';

  /**
   * Specific DEXes to use for routing
   * If specified, the route will ONLY use these DEXes
   * Multiple DEXes can be passed as an array
   * Example: ["Raydium", "Orca V2", "Meteora DLMM"]
   */
  dexes?: string[];

  /**
   * DEXes to exclude from routing
   * If specified, the route will NOT use these DEXes
   * Multiple DEXes can be passed as an array
   * Example: ["Raydium", "Orca V2", "Meteora DLMM"]
   */
  excludeDexes?: string[];

  /**
   * Restricts intermediate tokens within a route to a set of more stable tokens
   * Helps reduce exposure to potential high slippage routes
   * @default true
   */
  restrictIntermediateTokens?: boolean;

  /**
   * Limits Jupiter routing to single hop routes only
   * May result in worse pricing but simpler routes
   * @default false
   */
  onlyDirectRoutes?: boolean;

  /**
   * Uses legacy transaction format instead of versioned transaction
   * @default false
   */
  asLegacyTransaction?: boolean;

  /**
   * Platform fee in basis points (1 bp = 0.01%)
   * Used together with feeAccount in /swap endpoint
   */
  platformFeeBps?: number;

  /**
   * Rough estimate of the max accounts to be used for the quote
   * Useful when composing your own transaction or for more precise resource accounting
   * @default 64
   */
  maxAccounts?: number;

  /**
   * Dynamic Slippage does not have any effect on price url
   */
  dynamicSlippage?: boolean;
};

export type JupiterSwapUrlParams = {
  /**
   * Required public key of the user initiating the swap
   * This is the account that will sign the transaction
   */
  userPublicKey: string;

  /**
   * Required quote response object returned from a previous call to the quote endpoint
   * Contains pricing information and routing details for the swap
   */
  quoteResponse: object;

  /**
   * Whether to automatically wrap/unwrap SOL in the transaction
   * If false, it will use wSOL token account
   * Parameter will be ignored if destinationTokenAccount is set because the
   * destinationTokenAccount may belong to a different user that we have no authority to close
   * @default true
   */
  wrapAndUnwrapSol?: boolean;

  /**
   * Enables the usage of shared program accounts
   * Essential for complex routing that requires multiple intermediate token accounts
   * The default is determined dynamically by the routing engine to optimize for compute units
   * Note: shared accounts route will fail on some new AMMs with low liquidity tokens
   */
  useSharedAccounts?: boolean;

  /**
   * Token account that will be used to collect fees
   * The mint of the token account can only be either the input or output mint of the swap
   * No longer requires using the Referral Program
   */
  feeAccount?: string;

  /**
   * Any public key that belongs to you to track the transactions
   * Useful for integrators to get all swap transactions from this public key
   * Data can be queried using block explorers or analytics platforms
   */
  trackingAccount?: string;

  /**
   * Specifies additional fees to prioritize the transaction
   * Can be used for EITHER priority fee OR Jito tip (not both simultaneously)
   * For both, use /swap-instructions endpoint
   * Can be set to 0 to skip adding priority fees
   */
  prioritizationFeeLamports?:
    | {
        /**
         * Sets a priority level with a maximum lamport cap
         */
        priorityLevelWithMaxLamports?: {
          /**
           * Priority level for transaction processing
           */
          priorityLevel: 'medium' | 'high' | 'veryHigh';

          /**
           * Maximum lamports to cap the priority fee estimation
           * Prevents overpaying for transaction priority
           */
          maxLamports: number;
        };

        /**
         * Exact amount of tip to use in a Jito tip instruction
         * Must be used with a connection to a Jito RPC
         */
        jitoTipLamports?: number;
      }
    | number;

  /**
   * Builds a legacy transaction rather than the default versioned transaction
   * Should be used together with asLegacyTransaction in /quote
   * @default false
   */
  asLegacyTransaction?: boolean;

  /**
   * Public key of a token account that will receive the output tokens
   * If not provided, the signer's token account will be used
   * If provided, we assume the token account is already initialized
   */
  destinationTokenAccount?: string;

  /**
   * When enabled, performs a swap simulation to determine compute unit usage
   * Sets the value in ComputeBudget's compute unit limit
   * Requires one extra RPC call for simulation
   * Recommended to estimate compute units correctly and reduce priority fees
   * @default false
   */
  dynamicComputeUnitLimit?: boolean;

  /**
   * When enabled, skips additional RPC calls to check required accounts
   * Only enable when you've already set up all accounts needed for the transaction
   * @default false
   */
  skipUserAccountsRpcCalls?: boolean;

  /**
   * When enabled, estimates slippage and applies it directly in the swap transaction
   * Overwrites the slippageBps parameter in the quote response
   * Should be used together with dynamicSlippage in /quote
   * @default false
   */
  dynamicSlippage?: boolean;

  /**
   * Exact compute unit price to calculate priority fee
   * Total fee = computeUnitLimit (1400000) * computeUnitPriceMicroLamports
   * Using prioritizationFeeLamports with dynamicComputeUnitLimit is recommended instead
   */
  computeUnitPriceMicroLamports?: number;

  /**
   * Number of slots for which the transaction will be valid
   * Example: 10 slots ≈ 4 seconds (at ~400ms per slot) before expiration
   */
  blockhashSlotsToExpiry?: number;
};

export type JupiterTransactionData = {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  prioritizationType: JupiterPrioritizationType;
  simulationSlot: number | null;
  dynamicSlippageReport: JupiterDynamicSlippageReport | null;
  simulationError: JupiterSimulationError | null;
  addressesByLookupTableAddress: null;
  transaction: string;
};

export type JupiterQuoteResponses = {
  transactions: string[];
};

export type JupiterPrioritizationType = {
  computeBudget: {
    microLamports: number;
    estimatedMicroLamports: number;
  };
};

export type JupiterDynamicSlippageReport = {
  slippageBps: number;
  otherAmount: null;
  simulatedIncurredSlippageBps: null;
  amplificationRatio: null;
  categoryName: string;
  heuristicMaxSlippageBps: number;
  rtseSlippageBps: null;
  failedTxnEstSlippage: number;
  emaEstSlippage: number;
};

export type JupiterSimulationError = {
  errorCode: string;
  error: string;
};

export type JupiterPriceParamsToRequestParams = {
  /**
   * The address of the token to be swapped.
   */
  tokenIn: string;

  /**
   * The address of the token to be swapped for.
   */
  tokenOut: string;

  /**
   * The amount of tokens to be swapped.
   */
  amountIn: string;

  /**
   * The slippage tolerance for the swap (decimal percentage).
   */
  slippage: number;

  /**
   * The chainId of the source network.
   */
  from?: string;
};
