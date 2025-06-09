export enum ProtocolEnum {
  ODOS = 'odos',
  PUMPFUN = 'pumpfun',
  RAYDIUM_V2 = 'raydium-v2',
  JUPITER = 'jupiter',
  OPEN_OCEAN = 'OpenOcean',
  KYBERSWAP = 'KyberSwap',
  DEBRIDGE = 'DeBridge',
  AFTERMATH = 'Aftermath',
  OKX = 'OKX',
  ZEROX = '0x',
  GENIUS_BRIDGE = 'genius-bridge',
}

export enum ChainIdEnum {
  SOLANA = 1399811149,
  AVALANCHE = 43114,
  SONIC = 146,
  BSC = 56,
  BASE = 8453,
  SUI = 101,
  ARBITRUM = 42161,
  OPTIMISM = 10,
  BLAST = 81457,
  POLYGON = 137,
  ETHEREUM = 1,
  APTOS = 999,
}

export enum ChainVmTypeEnum {
  EVM = 'evm',
  SOLANA = 'solana',
  MOVE = 'move',
}

export enum SdkErrorEnum {
  FAILED_HTTP_REQUEST = 'FAILED_HTTP_REQUEST',
  MISSING_RPC_URL = 'MISSING_RPC_URL',
  INVALID_PARAMS = 'INVALID_PARAMS',
  PRICE_NOT_FOUND = 'PRICE_NOT_FOUND',
  QUOTE_NOT_FOUND = 'QUOTE_NOT_FOUND',
  MISSING_TRANSACTION_DATA = 'MISSING_TRANSACTION_DATA',
  MISSING_INITIALIZATION = 'MISSING_INITIALIZATION_PARAMS',
}
