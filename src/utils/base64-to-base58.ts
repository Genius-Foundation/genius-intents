import bs58 from 'bs58';

export const convertBase64ToBase58 = (base64String: string): string => {
  try {
    // First, decode the Base64 string to a Buffer/Uint8Array
    const binaryData = Buffer.from(base64String, 'base64');

    // Then encode the binary data to Base58
    const base58String = bs58.encode(binaryData);

    return base58String;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    throw new Error(`Failed to convert Base64 to Base58: ${error.message}`);
  }
};
