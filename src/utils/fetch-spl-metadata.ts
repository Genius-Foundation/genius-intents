import {
  getMint,
  getTokenMetadata,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Metadata } from '@metaplex-foundation/mpl-token-metadata';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { SPLMetadata } from '../types/slp-metadata';
import axios from 'axios';

/**
 * Fetches comprehensive SPL metadata for a given token address.
 * @param tokenAddress The address of the token.
 * @returns The fetched SPL metadata including extended token information.
 * @throws If there is an error fetching the SPL metadata.
 */
const getMetadataPDA = (mint: PublicKey): PublicKey => {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
      mint.toBuffer(),
    ],
    new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
  );
  return pda;
};

export async function fetchSPLMetadata(
  tokenAddress: string,
  connection: Connection,
): Promise<SPLMetadata | null> {
  const mintKey = new PublicKey(tokenAddress);

  try {
    const metaplex = Metaplex.make(connection);

    // Get basic token info and metadata
    const [token, nftMetadata] = await Promise.all([
      metaplex.tokens().findMintByAddress({ address: mintKey }),
      metaplex.nfts().findByMint({ mintAddress: mintKey }),
    ]);

    let metadata: SPLMetadata = {
      mint: tokenAddress,
      name: nftMetadata?.name || '',
      symbol: nftMetadata?.symbol || '',
      decimals: token.decimals,
      supply: Number(token.supply.basisPoints),
      uri: nftMetadata?.uri || '',
      isNFT: token.decimals === 0,
    };

    // If there's a URI, fetch additional metadata
    if (metadata.uri) {
      try {
        const response = await axios.get<SPLMetadata>(metadata.uri);
        metadata = {
          ...metadata,
          image: response.data.image,
          attributes: response.data.attributes,
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: unknown) {
        // Continue without extended metadata
      }
    }

    return metadata;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error: unknown) {
    try {
      try {
        const mintData = await getMint(connection, mintKey, undefined, TOKEN_PROGRAM_ID);

        // Try to fetch metadata from Token Metadata Program
        let name = '';
        let symbol = '';

        try {
          const metadataPDA = getMetadataPDA(mintKey);
          const metadataAccount = await Metadata.fromAccountAddress(connection, metadataPDA);
          name = metadataAccount.data.name.replace(/\0/g, '');
          symbol = metadataAccount.data.symbol.replace(/\0/g, '');

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (metadataError: unknown) {
          // console.log('No metadata found in Token Metadata Program');
        }

        return {
          mint: tokenAddress,
          name,
          symbol,
          decimals: mintData.decimals,
          supply: Number(mintData.supply),
        };

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (standardSplError: unknown) {
        // If standard SPL fails, try Token-2022
        const mintData = await getMint(connection, mintKey, undefined, TOKEN_2022_PROGRAM_ID);

        // Only try to get metadata if mint fetch succeeds
        const tokenMetadata = await getTokenMetadata(
          connection,
          mintKey,
          undefined,
          TOKEN_2022_PROGRAM_ID,
        );

        return {
          mint: tokenAddress,
          name: tokenMetadata?.name || '',
          symbol: tokenMetadata?.symbol || '',
          decimals: mintData.decimals,
          supply: Number(mintData.supply),
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown) {
      return null;
    }
  }
}
