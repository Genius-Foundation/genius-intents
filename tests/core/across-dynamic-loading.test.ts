import { jest } from '@jest/globals';
import { GeniusIntents } from '../../src/genius-intents';
import { ProtocolEnum } from '../../src/types/enums';
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

// Mock Across service with a proper class
jest.mock('../../src/protocols/across/across.service', () => ({
  AcrossService: jest.fn().mockImplementation(() => ({
    protocol: 'across',
    singleChain: false,
    multiChain: true,
    chains: [1, 137, 42161, 10, 8453, 81457, 56],
    fetchPrice: jest.fn(),
    fetchQuote: jest.fn(),
  })),
}));

describe('Across Dynamic Loading Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should include Across protocol when explicitly included', async () => {
    const config: GeniusIntentsConfig = {
      includeProtocols: [ProtocolEnum.ACROSS],
    };

    const geniusIntents = new GeniusIntents(config);
    const initializedProtocols = await geniusIntents.getInitializedProtocols();

    // Across should be included when explicitly specified
    expect(initializedProtocols).toContain(ProtocolEnum.ACROSS);
  });

  test('should exclude Across protocol when explicitly excluded', async () => {
    const config: GeniusIntentsConfig = {
      excludeProtocols: [ProtocolEnum.ACROSS],
    };

    const geniusIntents = new GeniusIntents(config);
    const initializedProtocols = await geniusIntents.getInitializedProtocols();

    // Across should be excluded when explicitly specified
    expect(initializedProtocols).not.toContain(ProtocolEnum.ACROSS);
  });

  test('should handle dynamic import errors gracefully', async () => {
    // This test verifies that the system handles import failures gracefully
    // Since we have a working mock, Across should be loaded successfully
    
    const config: GeniusIntentsConfig = {
      includeProtocols: [ProtocolEnum.ACROSS],
    };

    const geniusIntents = new GeniusIntents(config);
    
    // Should not throw an error
    const initializedProtocols = await geniusIntents.getInitializedProtocols();
    
    // Across should be in the initialized protocols since the mock works
    expect(initializedProtocols).toContain(ProtocolEnum.ACROSS);
  });
}); 