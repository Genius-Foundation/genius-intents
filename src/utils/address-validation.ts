import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';

export const SUI_REGEX = {
  coin: /^0x[a-fA-F0-9]{64}::[a-zA-Z_][a-zA-Z0-9_]*::[A-Z][A-Z0-9_]*$/,
  wallet: /^0x[a-fA-F0-9]{64}$/,
} as const;

export const validateAddress = (address: string): void => {
  validateSolanaAddress(address);
  validateAndChecksumEvmAddress(address);
  validateSuiAddress(address);
};

export const validateSolanaAddress = (address: string): void => {
  try {
    PublicKey.isOnCurve(new PublicKey(address));
  } catch {
    throw new Error(`${address} is not a valid SOLANA address.`);
  }
};

export const validateAndChecksumEvmAddress = (address: string): string => {
  const result = ethers.getAddress(address.toLowerCase());
  if (!result) throw new Error(`${address} is not a valid EVM address.`);
  else return result;
};

export const validateSuiAddress = (address: string): void => {
  const isValidCoinAddress = SUI_REGEX.coin.test(address);
  const isValidWalletAddress = SUI_REGEX.wallet.test(address);
  const isShortenedNative = address === '0x2::sui::SUI';

  if (!isValidCoinAddress && !isValidWalletAddress && !isShortenedNative) {
    throw new Error(`Invalid SUI address: ${address}`);
  }
};
