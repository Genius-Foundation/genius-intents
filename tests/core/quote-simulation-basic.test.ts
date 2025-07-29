import { jest } from '@jest/globals';
import { GeniusIntents } from '../../src/genius-intents';
import { ChainIdEnum, ProtocolEnum } from '../../src/types/enums';
import { GeniusIntentsConfig } from '../../src/types/genius-intents';

// Mock the problematic ES module package
jest.mock('@across-protocol/app-sdk', () => ({
  createAcrossClient: jest.fn(),
  AcrossClient: jest.fn(),
}));

// Mock all protocol services
jest.mock('../../src/protocols/odos/odos.service');
jest.mock('../../src/protocols/jupiter/jupiter.service');
jest.mock('../../src/protocols/raydium/raydium-v2.service');
jest.mock('../../src/protocols/openocean/openocean.service');
jest.mock('../../src/protocols/okx/okx.service');
jest.mock('../../src/protocols/kyberswap/kyberswap.service');
jest.mock('../../src/protocols/aftermath/aftermath.service');
jest.mock('../../src/protocols/zeroX/zeroX.service');
jest.mock('../../src/protocols/debridge/debridge.service');
jest.mock('../../src/protocols/genius-bridge/genius-bridge.service');
jest.mock('../../src/protocols/across/across.service');

// Mock ethers
jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    estimateGas: jest.fn(),
    send: jest.fn(),
  })),
  solidityPackedKeccak256: jest.fn(),
  toBeHex: jest.fn(),
}));

// Mock Jito simulation
jest.mock('../../src/utils/jito', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock ERC20 service
jest.mock('../../src/lib/erc20/erc20.service', () => ({
  Erc20Service: jest.fn().mockImplementation(() => ({
    allowance: jest.fn(),
  })),
  getApproveTxData: jest.fn(),
}));

describe('Quote Simulation Basic Tests', () => {
  let geniusIntents: GeniusIntents;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration Validation', () => {
    test('should require rcps when simulateQuotes is enabled', async () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        // No rcps provided
      };

      geniusIntents = new GeniusIntents(config);

      const params = {
        networkIn: ChainIdEnum.ETHEREUM,
        networkOut: ChainIdEnum.ETHEREUM,
        tokenIn: '0x0000000000000000000000000000000000000000',
        tokenOut: '0xa0b86a33e6c3b3f4ac24b8b6e95e80e1e5c2d68e',
        amountIn: '1000000000000000000',
        from: '0x742d35cc6641c2344c2db5c9c7db0e5d5b0f7e2b',
        receiver: '0x742d35cc6641c2344c2db5c9c7db0e5d5b0f7e2b',
        slippage: 100,
      };

      await expect(geniusIntents.fetchQuote(params)).rejects.toThrow(
        'rcps are required for quote simulation and approval checks'
      );
    });

    test('should require rcps when checkApprovals is enabled', async () => {
      const config: GeniusIntentsConfig = {
        checkApprovals: true,
        // No rcps provided
      };

      geniusIntents = new GeniusIntents(config);

      const params = {
        networkIn: ChainIdEnum.ETHEREUM,
        networkOut: ChainIdEnum.ETHEREUM,
        tokenIn: '0x0000000000000000000000000000000000000000',
        tokenOut: '0xa0b86a33e6c3b3f4ac24b8b6e95e80e1e5c2d68e',
        amountIn: '1000000000000000000',
        from: '0x742d35cc6641c2344c2db5c9c7db0e5d5b0f7e2b',
        receiver: '0x742d35cc6641c2344c2db5c9c7db0e5d5b0f7e2b',
        slippage: 100,
      };

      await expect(geniusIntents.fetchQuote(params)).rejects.toThrow(
        'rcps are required for quote simulation and approval checks'
      );
    });

    test('should accept valid configuration with rcps', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        checkApprovals: true,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
          [ChainIdEnum.SOLANA]: 'https://api.mainnet-beta.solana.com',
        },
        jitoRpc: 'https://jito-api.mainnet.jito.network',
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });
  });

  describe('Custom Simulation Functions', () => {
    test('should accept custom EVM simulation function', () => {
      const customEvmSimulation = jest.fn() as any;

      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        customEvmSimulation,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
        },
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });

    test('should accept custom Solana simulation function', () => {
      const customSvmSimulation = jest.fn() as any;

      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        customSvmSimulation,
        rcps: {
          [ChainIdEnum.SOLANA]: 'https://api.mainnet-beta.solana.com',
        },
        jitoRpc: 'https://jito-api.mainnet.jito.network',
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });

    test('should accept both custom simulation functions', () => {
      const customEvmSimulation = jest.fn() as any;
      const customSvmSimulation = jest.fn() as any;

      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        customEvmSimulation,
        customSvmSimulation,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
          [ChainIdEnum.SOLANA]: 'https://api.mainnet-beta.solana.com',
        },
        jitoRpc: 'https://jito-api.mainnet.jito.network',
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });
  });

  describe('Simulation Status Helper', () => {
    test('should handle responses without simulation status', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
      };

      geniusIntents = new GeniusIntents(config);

      const responseWithoutSimulation = {
        amountOut: '1800000000',
      };

      expect((geniusIntents as any).isQuoteSimulationStatusOk(responseWithoutSimulation)).toBe(true);
    });

    test('should handle responses with successful simulation', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
      };

      geniusIntents = new GeniusIntents(config);

      const responseWithSuccess = {
        amountOut: '1800000000',
        simulationSuccess: true,
      };

      expect((geniusIntents as any).isQuoteSimulationStatusOk(responseWithSuccess)).toBe(true);
    });

    test('should handle responses with failed simulation', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
      };

      geniusIntents = new GeniusIntents(config);

      const responseWithFailure = {
        amountOut: '1800000000',
        simulationSuccess: false,
      };

      expect((geniusIntents as any).isQuoteSimulationStatusOk(responseWithFailure)).toBe(false);
    });

    test('should handle responses with undefined simulation status', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
      };

      geniusIntents = new GeniusIntents(config);

      const responseWithUndefined = {
        amountOut: '1800000000',
        simulationSuccess: undefined,
      };

      expect((geniusIntents as any).isQuoteSimulationStatusOk(responseWithUndefined)).toBe(true);
    });
  });

  describe('Method Integration', () => {
    test('should support race method with simulation', () => {
      const config: GeniusIntentsConfig = {
        method: 'race',
        simulateQuotes: true,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
        },
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });

    test('should support best method with simulation', () => {
      const config: GeniusIntentsConfig = {
        method: 'best',
        simulateQuotes: true,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
        },
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });

    test('should support both simulation and approval checking', () => {
      const config: GeniusIntentsConfig = {
        method: 'best',
        simulateQuotes: true,
        checkApprovals: true,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
        },
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });
  });

  describe('Protocol Compatibility', () => {
    test('should work with EVM protocols', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
        },
        includeProtocols: [ProtocolEnum.ODOS],
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });

    test('should work with Solana protocols', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        rcps: {
          [ChainIdEnum.SOLANA]: 'https://api.mainnet-beta.solana.com',
        },
        jitoRpc: 'https://jito-api.mainnet.jito.network',
        includeProtocols: [ProtocolEnum.JUPITER],
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });

    test('should work with cross-chain protocols', () => {
      const config: GeniusIntentsConfig = {
        simulateQuotes: true,
        rcps: {
          [ChainIdEnum.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/test',
          [ChainIdEnum.POLYGON]: 'https://polygon-rpc.com',
        },
        includeProtocols: [ProtocolEnum.DEBRIDGE],
      };

      geniusIntents = new GeniusIntents(config);
      expect(geniusIntents).toBeDefined();
    });
  });
}); 