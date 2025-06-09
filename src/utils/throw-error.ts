import { SdkErrorEnum } from '../types/enums';

export const sdkError = (errorType: SdkErrorEnum, message: string): Error => {
  return new Error(`${errorType}: ${message}`);
};
