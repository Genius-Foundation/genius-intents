import { SOL_NATIVE_ADDRESS, NATIVE_ADDRESS, ZERO_ADDRESS, NATIVE_SOL } from './constants';

export const isNative = (address?: string): boolean => {
  if (!address) return false;
  if (address.toLowerCase() === SOL_NATIVE_ADDRESS.toLowerCase()) return true;
  if (address.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) return true;
  if (address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) return true;
  if (address.toLowerCase() === NATIVE_SOL.toLowerCase()) return true;

  if (address.toLowerCase().includes('native')) return true;
  if (
    ['sol', 'solana', 'ethereum', 'eth', 'bsc', 'binance', 'avax', 'avalanche'].includes(
      address.toLowerCase(),
    )
  )
    return true;

  return false;
};
