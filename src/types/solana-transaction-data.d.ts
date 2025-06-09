type ComputeBudget = {
  microLamports: number;
  estimatedMicroLamports: number;
};

type PrioritizationType = {
  computeBudget: ComputeBudget;
};

export type SolanaTransactionData = {
  transaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  prioritizationType: PrioritizationType;
  simulationSlot: number | null;
  dynamicSlippageReport: unknown | null;
  simulationError: unknown | null;
};
