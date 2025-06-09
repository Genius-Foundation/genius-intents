import { getAddress } from 'ethers';
import { ChainVmTypeEnum } from '../types/enums';

export const identifyAddress = (address: string): false | ChainVmTypeEnum => {
  // Check if the input is a string
  if (typeof address !== 'string') {
    return false;
  }

  if (isEthAddress(address)) return ChainVmTypeEnum.EVM;
  else if (isSolanaAddress(address)) return ChainVmTypeEnum.SOLANA;
  else return false;
};

export const isSolanaAddress = (address: string): boolean => {
  // Regular expression for Solana addresses (base58 encoding, 32-44 characters)
  const solanaRegex = /^[a-zA-Z0-9]{32,44}$/;
  return solanaRegex.test(address);
};

export const validateSolanaAddress = (address: string): void => {
  if (!isSolanaAddress(address)) {
    throw new Error('Invalid Solana address');
  }
};

export const isEthAddress = (address: string): boolean => {
  // Regular expression for Ethereum addresses
  const ethRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethRegex.test(address);
};

export const validateEthAddress = (address: string): void => {
  if (!isEthAddress(address)) {
    throw new Error('Invalid Ethereum address');
  }
};

export function validateSuiAddress(address: string): boolean {
  // Check if address is null or empty
  if (!address) {
    return false;
  }

  // Check if address starts with '0x'
  if (!address.startsWith('0x')) {
    return false;
  }

  // Check if address has correct length (32 bytes = 64 chars + '0x')
  if (address.length !== 66) {
    return false;
  }

  // Check if address contains only valid hexadecimal characters
  const hexRegex = /^0x[0-9a-fA-F]+$/;
  if (!hexRegex.test(address)) {
    return false;
  }

  return true;
}

export const formatAddress = (address: string): string => {
  const addressType = identifyAddress(address);
  if (!addressType) throw new Error(`Invalid address ${address}`);
  else if (addressType === ChainVmTypeEnum.EVM) return getAddress(address.toLowerCase());
  else return address;
};
