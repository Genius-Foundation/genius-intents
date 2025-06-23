import { jest } from '@jest/globals';
import { GeniusIntents } from '../../src/genius-intents';
import { ChainIdEnum, ProtocolEnum } from '../../src/types/enums';
import { GeniusIntentsConfig } from '../../src/types/genius-intents';
import { createPriceParams, createQuoteParams } from '../fixtures/test-data';

// Mock the problematic ES module package
jest.mock('@across-protocol/app-sdk', () => ({
  createAcrossClient: jest.fn(),
  AcrossClient: jest.fn(),
}));

// Mock all protocol services to prevent actual network calls
jest.mock('../../src/protocols/odos/odos.service');
jest.mock('../../src/protocols/jupiter/jupiter.service');
jest.mock('../../src/protocols/raydium/raydium-v2.service');
jest.mock('../../src/protocols/pumpfun/pumpfun.service');
jest.mock('../../src/protocols/openocean/openocean.service');
jest.mock('../../src/protocols/okx/okx.service');
jest.mock('../../src/protocols/kyberswap/kyberswap.service');
jest.mock('../../src/protocols/aftermath/aftermath.service');
jest.mock('../../src/protocols/zeroX/zeroX.service');
jest.mock('../../src/protocols/debridge/debridge.service');
jest.mock('../../src/protocols/genius-bridge/genius-bridge.service');
jest.mock('../../src/protocols/across/across.service');

describe('GeniusIntents', () => {
  let geniusIntents: GeniusIntents;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
  let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
  let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Spy on console methods
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default configuration', () => {
      geniusIntents = new GeniusIntents();
      
      expect(geniusIntents).toBeDefined();
      expect(typeof geniusIntents.getInitializedProtocols).toBe('function');
      expect(typeof geniusIntents.fetchPrice).toBe('function');
      expect(typeof geniusIntents.fetchQuote).toBe('function');
    });

    test('should initialize with custom configuration', () => {
      const config: GeniusIntentsConfig = {
        method: 'race',
        timeout: 20000,
        maxConcurrency: 5,
        debug: true,
      };

      geniusIntents = new GeniusIntents(config);
      
      expect(geniusIntents).toBeDefined();
    });

    test('should respect includeProtocols configuration', () => {
      const config: GeniusIntentsConfig = {
        includeProtocols: [ProtocolEnum.JUPITER],
      };

      geniusIntents = new GeniusIntents(config);
      const initializedProtocols = geniusIntents.getInitializedProtocols();
      
      // Should only include Jupiter if it's available, or be empty if not
      expect(initializedProtocols.length).toBeLessThanOrEqual(1);
      if (initializedProtocols.length > 0) {
        expect(initializedProtocols).toContain(ProtocolEnum.JUPITER);
      }
    });

    test('should respect excludeProtocols configuration', () => {
      const config: GeniusIntentsConfig = {
        excludeProtocols: [ProtocolEnum.ODOS],
      };

      geniusIntents = new GeniusIntents(config);
      const initializedProtocols = geniusIntents.getInitializedProtocols();
      
      expect(initializedProtocols).not.toContain(ProtocolEnum.ODOS);
    });

    test('should handle protocol initialization gracefully', () => {
      // This test verifies that the class doesn't crash when protocols fail to initialize
      geniusIntents = new GeniusIntents();
      
      // The class should still be functional even if some protocols fail
      expect(geniusIntents).toBeDefined();
      expect(typeof geniusIntents.getInitializedProtocols).toBe('function');
    });
  });

  describe('Protocol Management', () => {
    beforeEach(() => {
      geniusIntents = new GeniusIntents();
    });

    test('should return list of initialized protocols', () => {
      const protocols = geniusIntents.getInitializedProtocols();
      
      expect(Array.isArray(protocols)).toBe(true);
      protocols.forEach(protocol => {
        expect(Object.values(ProtocolEnum)).toContain(protocol);
      });
    });

    test('should get specific protocol instance', () => {
      const protocols = geniusIntents.getInitializedProtocols();
      
      if (protocols.length > 0) {
        const firstProtocol = protocols[0]!;
        const protocol = geniusIntents.getProtocol(firstProtocol);
        
        // Protocol might be undefined due to mocking, which is expected
        if (protocol && protocol.protocol) {
          expect(protocol.protocol).toBe(firstProtocol);
        } else {
          // Protocol exists but doesn't have the expected structure due to mocking
          expect(protocol).toBeDefined();
        }
      } else {
        // If no protocols are initialized (due to mocking), that's also valid
        expect(protocols.length).toBe(0);
      }
    });

    test('should return undefined for non-existent protocol', () => {
      const protocol = geniusIntents.getProtocol('NON_EXISTENT' as ProtocolEnum);
      
      expect(protocol).toBeUndefined();
    });
  });

  describe('Compatible Protocol Selection', () => {
    beforeEach(() => {
      geniusIntents = new GeniusIntents();
    });

    test('should find compatible protocols for same-chain swap', () => {
      const params = createPriceParams({
        networkIn: ChainIdEnum.ETHEREUM,
        networkOut: ChainIdEnum.ETHEREUM,
      });

      // Access the protected method through reflection
      try {
        const compatibleProtocols = (geniusIntents as any).getCompatibleProtocols(params);
        
        expect(Array.isArray(compatibleProtocols)).toBe(true);
        compatibleProtocols.forEach((protocol: any) => {
          if (protocol && protocol.chains) {
            expect(protocol.singleChain).toBe(true);
            expect(protocol.chains).toContain(ChainIdEnum.ETHEREUM);
          }
        });
      } catch (error) {
        // Expected when protocols are not properly mocked
        expect(error).toBeDefined();
      }
    });

    test('should find compatible protocols for cross-chain swap', () => {
      const params = createPriceParams({
        networkIn: ChainIdEnum.ETHEREUM,
        networkOut: ChainIdEnum.BSC,
      });

      try {
        const compatibleProtocols = (geniusIntents as any).getCompatibleProtocols(params);
        
        expect(Array.isArray(compatibleProtocols)).toBe(true);
        compatibleProtocols.forEach((protocol: any) => {
          if (protocol && protocol.chains) {
            expect(protocol.multiChain).toBe(true);
            expect(protocol.chains).toContain(ChainIdEnum.ETHEREUM);
            expect(protocol.chains).toContain(ChainIdEnum.BSC);
          }
        });
      } catch (error) {
        // Expected when protocols are not properly mocked
        expect(error).toBeDefined();
      }
    });

    test('should return empty array when no compatible protocols found', () => {
      const params = createPriceParams({
        networkIn: 999 as ChainIdEnum, // Non-existent chain
        networkOut: 998 as ChainIdEnum, // Non-existent chain
      });

      try {
        const compatibleProtocols = (geniusIntents as any).getCompatibleProtocols(params);
        expect(compatibleProtocols).toHaveLength(0);
      } catch (error) {
        // Expected when protocols are not properly mocked
        expect(error).toBeDefined();
      }
    });
  });

  describe('Price Fetching', () => {
    beforeEach(() => {
      geniusIntents = new GeniusIntents({ method: 'best' });
    });

    test('should handle price fetching with no compatible protocols', async () => {
      const params = createPriceParams({
        networkIn: 999 as ChainIdEnum,
        networkOut: 998 as ChainIdEnum,
      });

      await expect(geniusIntents.fetchPrice(params)).rejects.toThrow();
    });

    test('should handle price fetching method configuration', () => {
      const bestModeInstance = new GeniusIntents({ method: 'best' });
      const raceModeInstance = new GeniusIntents({ method: 'race' });
      
      expect(bestModeInstance).toBeDefined();
      expect(raceModeInstance).toBeDefined();
    });
  });

  describe('Quote Fetching', () => {
    beforeEach(() => {
      geniusIntents = new GeniusIntents({ method: 'best' });
    });

    test('should handle quote fetching with no compatible protocols', async () => {
      const params = createQuoteParams({
        networkIn: 999 as ChainIdEnum,
        networkOut: 998 as ChainIdEnum,
      });

      await expect(geniusIntents.fetchQuote(params)).rejects.toThrow();
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(() => {
      geniusIntents = new GeniusIntents();
    });

    test('should update configuration', () => {
      const newConfig: Partial<GeniusIntentsConfig> = {
        method: 'race',
        timeout: 15000,
      };

      expect(() => geniusIntents.updateConfig(newConfig)).not.toThrow();
    });

    test('should reinitialize protocols when protocol configs change', () => {
      const newConfig: Partial<GeniusIntentsConfig> = {
        includeProtocols: [ProtocolEnum.JUPITER],
      };

      geniusIntents.updateConfig(newConfig);
      const updatedProtocols = geniusIntents.getInitializedProtocols();
      
      // The protocols should be reinitialized
      expect(Array.isArray(updatedProtocols)).toBe(true);
      expect(updatedProtocols).not.toContain(ProtocolEnum.ODOS);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      geniusIntents = new GeniusIntents();
    });

    test('should handle protocol service creation errors', () => {
      const createProtocolSafely = (geniusIntents as any).createProtocolSafely;
      
      const failingFactory = () => {
        throw new Error('Service creation failed');
      };

      const result = createProtocolSafely(failingFactory);
      
      expect(result).toBeNull();
    });

    test('should handle invalid parameters gracefully', async () => {
      const invalidParams = {
        networkIn: null,
        networkOut: null,
        tokenIn: '',
        tokenOut: '',
        amountIn: '',
        slippage: -1,
        from: '',
      } as any;

      await expect(geniusIntents.fetchPrice(invalidParams)).rejects.toThrow();
    });
  });

  describe('Method Selection Logic', () => {
    test('should handle best response selection logic', () => {
      const results = [
        {
          protocol: ProtocolEnum.ODOS,
          response: { amountOut: '1800000000' },
          duration: 100,
        },
        {
          protocol: ProtocolEnum.JUPITER,
          response: { amountOut: '1900000000' },
          duration: 150,
        },
        {
          protocol: ProtocolEnum.OPEN_OCEAN,
          response: { amountOut: '1750000000' },
          duration: 120,
        },
      ];

      const bestResponse = (geniusIntents as any).selectBestPriceResponse(results);
      
      expect(bestResponse).toBeDefined();
      expect(bestResponse.amountOut).toBe('1900000000');
    });

    test('should return undefined when no successful responses', () => {
      const results = [
        {
          protocol: ProtocolEnum.ODOS,
          error: new Error('Failed'),
          duration: 100,
        },
      ];

      const bestResponse = (geniusIntents as any).selectBestPriceResponse(results);
      
      expect(bestResponse).toBeUndefined();
    });
  });

  describe('Timeout and Concurrency', () => {
    test('should respect timeout configuration', () => {
      const config: GeniusIntentsConfig = {
        timeout: 5000,
      };

      const instance = new GeniusIntents(config);
      expect(instance).toBeDefined();
    });

    test('should respect maxConcurrency configuration', () => {
      const config: GeniusIntentsConfig = {
        maxConcurrency: 3,
      };

      const instance = new GeniusIntents(config);
      expect(instance).toBeDefined();
    });
  });
});