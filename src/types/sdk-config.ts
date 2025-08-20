import { ILogger } from '../utils/logger';

export type GeniusIntentsSDKConfig = {
  logger?: ILogger;
  debug?: boolean;
  rpcUrls?: Record<number, string>;
  //default false
  includeApprovals?: boolean;
};
