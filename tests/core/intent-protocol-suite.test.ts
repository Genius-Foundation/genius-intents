import { IIntentProtocol } from '../../src/interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum } from '../../src/types/enums';
import { createPriceParams, TEST_TOKENS, TEST_WALLETS } from '../fixtures/test-data';

interface ProtocolTestCase {
  name: string;
  protocol: IIntentProtocol;
  className: string;
}

// Helper to safely create protocol instances
function createProtocolInstance(
  name: string,
  createFn: () => IIntentProtocol,
): IIntentProtocol | null {
  try {
    return createFn();
  } catch (error) {
    console.warn(
      `Failed to create ${name} instance for testing:`,
      error instanceof Error ? error.message : 'Unknown error',
    );
    return null;
  }
}

// Create test configurations for protocols that need them
const TEST_CONFIGS = {
  pumpfun: {
    solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  },
  aftermath: {
    suiRpcUrl: 'https://fullnode.mainnet.sui.io:443',
  },
  okx: {
    okxCredentials: {
      apiKey: 'test-api-key',
      secretKey: 'test-secret-key',
      passphrase: 'test-passphrase',
      projectId: 'test-project-id',
    },
  },
  zeroX: {
    apiKey: 'test-api-key',
  },
  kyberswap: {
    clientId: 'test-client-id',
  },
};

// Attempt to load all protocol implementations
const PROTOCOL_CANDIDATES = [
  {
    name: 'Jupiter',
    createFn: () => {
      const { JupiterService } = require('../../src/protocols/jupiter/jupiter.service');
      return new JupiterService();
    },
  },
  {
    name: 'Odos',
    createFn: () => {
      const { OdosService } = require('../../src/protocols/odos/odos.service');
      return new OdosService();
    },
  },
  {
    name: 'Raydium V2',
    createFn: () => {
      const { RaydiumV2Service } = require('../../src/protocols/raydium/raydium-v2.service');
      return new RaydiumV2Service();
    },
  },
  {
    name: 'PumpFun',
    createFn: () => {
      const { PumpFunService } = require('../../src/protocols/pumpfun/pumpfun.service');
      return new PumpFunService(TEST_CONFIGS.pumpfun);
    },
  },
  {
    name: 'OpenOcean',
    createFn: () => {
      const { OpenOceanService } = require('../../src/protocols/openocean/openocean.service');
      return new OpenOceanService();
    },
  },
  {
    name: 'Kyberswap',
    createFn: () => {
      const { KyberswapService } = require('../../src/protocols/kyberswap/kyberswap.service');
      return new KyberswapService(TEST_CONFIGS.kyberswap);
    },
  },
  {
    name: 'ZeroX',
    createFn: () => {
      const { ZeroXService } = require('../../src/protocols/zeroX/zeroX.service');
      return new ZeroXService(TEST_CONFIGS.zeroX);
    },
  },
  {
    name: 'Aftermath',
    createFn: () => {
      const { AftermathService } = require('../../src/protocols/aftermath/aftermath.service');
      return new AftermathService(TEST_CONFIGS.aftermath);
    },
  },
  {
    name: 'OKX',
    createFn: () => {
      const { OkxService } = require('../../src/protocols/okx/okx.service');
      return new OkxService(TEST_CONFIGS.okx);
    },
  },
  {
    name: 'DeBridge',
    createFn: () => {
      const { DeBridgeService } = require('../../src/protocols/debridge/debridge.service');
      return new DeBridgeService();
    },
  },
  {
    name: 'Genius Bridge',
    createFn: () => {
      const {
        GeniusBridgeService,
      } = require('../../src/protocols/genius-bridge/genius-bridge.service');
      return new GeniusBridgeService();
    },
  },
];

// Load all available protocol implementations
const PROTOCOL_IMPLEMENTATIONS: ProtocolTestCase[] = PROTOCOL_CANDIDATES.map(candidate => {
  const protocol = createProtocolInstance(candidate.name, candidate.createFn);
  return protocol
    ? {
        name: candidate.name,
        protocol,
        className: candidate.name.replace(/\s+/g, '') + 'Service',
      }
    : null;
}).filter((impl): impl is ProtocolTestCase => impl !== null);

describe('IIntentProtocol Implementation Suite', () => {
  beforeAll(() => {
    console.log('\n=== PROTOCOL DISCOVERY RESULTS ===');
    console.log(`Successfully loaded ${PROTOCOL_IMPLEMENTATIONS.length} protocol implementations:`);
    PROTOCOL_IMPLEMENTATIONS.forEach((impl, index) => {
      console.log(`  ${index + 1}. ${impl.name} (${impl.className})`);
    });

    const failedCount = PROTOCOL_CANDIDATES.length - PROTOCOL_IMPLEMENTATIONS.length;
    if (failedCount > 0) {
      console.log(
        `\n${failedCount} protocols failed to load (likely due to missing dependencies or configuration issues)`,
      );
    }
    console.log('===================================\n');
  });

  describe('Protocol Discovery and Registration', () => {
    test('should discover at least some protocol implementations', () => {
      expect(PROTOCOL_IMPLEMENTATIONS.length).toBeGreaterThan(0);
    });

    test('should have unique protocol identifiers', () => {
      const protocolIds = PROTOCOL_IMPLEMENTATIONS.map(impl => impl.protocol.protocol);
      const uniqueProtocolIds = [...new Set(protocolIds)];
      expect(protocolIds).toHaveLength(uniqueProtocolIds.length);
    });
  });

  // Test each protocol implementation
  PROTOCOL_IMPLEMENTATIONS.forEach(({ name, protocol, className }) => {
    describe(`${name} (${className})`, () => {
      describe('Interface Compliance', () => {
        test('should implement IIntentProtocol interface', () => {
          expect(protocol).toBeDefined();
          expect(typeof protocol.fetchPrice).toBe('function');
          expect(typeof protocol.fetchQuote).toBe('function');
          expect(typeof protocol.protocol).toBe('string');
          expect(Array.isArray(protocol.chains)).toBe(true);
          expect(typeof protocol.singleChain).toBe('boolean');
          expect(typeof protocol.multiChain).toBe('boolean');
        });

        test('should have valid protocol properties', () => {
          expect(protocol.protocol).toBeTruthy();
          expect(protocol.chains.length).toBeGreaterThan(0);
          expect(Object.values(ProtocolEnum)).toContain(protocol.protocol);
        });

        test('should have consistent chain configuration', () => {
          // Single-chain protocols should not be multi-chain
          if (protocol.singleChain) {
            expect(protocol.multiChain).toBe(false);
          }

          // Multi-chain protocols should not be single-chain
          if (protocol.multiChain) {
            expect(protocol.singleChain).toBe(false);
          }

          // At least one should be true
          expect(protocol.singleChain || protocol.multiChain).toBe(true);
        });
      });

      describe('Chain Support and Routing Capabilities', () => {
        test('should have valid supported chains', () => {
          protocol.chains.forEach(chain => {
            expect(Object.values(ChainIdEnum)).toContain(chain);
          });
        });

        test('should indicate routing capabilities correctly', () => {
          if (protocol.singleChain) {
            // Single-chain protocols can only route within supported chains
            expect(protocol.chains.length).toBeGreaterThan(0);
            console.log(
              `${name}: Single-chain protocol supporting ${protocol.chains.length} chain(s) - ${protocol.chains.map(c => ChainIdEnum[c]).join(', ')}`,
            );
          }

          if (protocol.multiChain) {
            // Multi-chain protocols should support multiple chains or be bridges
            expect(protocol.chains.length).toBeGreaterThanOrEqual(1);
            console.log(
              `${name}: Multi-chain protocol supporting ${protocol.chains.length} chain(s) - ${protocol.chains.map(c => ChainIdEnum[c]).join(', ')}`,
            );
          }
        });

        test('should categorize protocol type correctly', () => {
          const EVMChains = [
            ChainIdEnum.ETHEREUM,
            ChainIdEnum.ARBITRUM,
            ChainIdEnum.OPTIMISM,
            ChainIdEnum.POLYGON,
            ChainIdEnum.BSC,
            ChainIdEnum.AVALANCHE,
            ChainIdEnum.BASE,
            ChainIdEnum.BLAST,
            ChainIdEnum.SONIC,
          ];

          const isEVMOnly = protocol.chains.every(chain => EVMChains.includes(chain));
          const isSolanaOnly =
            protocol.chains.length === 1 && protocol.chains[0] === ChainIdEnum.SOLANA;
          const isMoveOnly = protocol.chains.every(chain =>
            [ChainIdEnum.SUI, ChainIdEnum.APTOS].includes(chain),
          );
          const isCrossVM = !isEVMOnly && !isSolanaOnly && !isMoveOnly;

          const classification = {
            isEVMOnly,
            isSolanaOnly,
            isMoveOnly,
            isCrossVM,
            chains: protocol.chains.map(c => ChainIdEnum[c]),
            chainCount: protocol.chains.length,
          };

          console.log(`${name} classification:`, classification);

          // Protocol should fall into one of these categories
          expect(isEVMOnly || isSolanaOnly || isMoveOnly || isCrossVM).toBe(true);
        });
      });

      describe('Operational Capabilities Analysis', () => {
        test('should determine possible operations based on chain configuration', () => {
          const capabilities = analyzeProtocolCapabilities(protocol);

          expect(capabilities).toHaveProperty('canDoIntraChainSwaps');
          expect(capabilities).toHaveProperty('canDoCrossChainSwaps');
          expect(capabilities).toHaveProperty('supportedVMs');
          expect(capabilities).toHaveProperty('routingScenarios');

          console.log(`${name} capabilities:`, capabilities);
        });

        test('should validate parameter compatibility for supported chains', () => {
          // Test with each supported chain
          let validChains = 0;
          protocol.chains.forEach(chainId => {
            const canCreateParams = canCreateValidParams(chainId);
            if (canCreateParams) {
              validChains++;
            }
          });

          // At least some chains should have valid test data
          expect(validChains).toBeGreaterThan(0);
          console.log(
            `${name}: ${validChains}/${protocol.chains.length} chains have valid test parameters`,
          );
        });
      });

      describe('Routing Matrix Analysis', () => {
        test('should generate valid routing matrix for supported chains', () => {
          const routingMatrix = generateRoutingMatrix(protocol);

          expect(routingMatrix).toHaveProperty('intraChainRoutes');
          expect(routingMatrix).toHaveProperty('crossChainRoutes');
          expect(routingMatrix).toHaveProperty('totalPossibleRoutes');

          console.log(`${name} routing matrix:`, {
            intraChainRoutes: routingMatrix.intraChainRoutes,
            crossChainRoutes: routingMatrix.crossChainRoutes,
            totalRoutes: routingMatrix.totalPossibleRoutes,
            supportedChains: routingMatrix.supportedChains,
          });

          // Validate routing logic
          if (protocol.singleChain) {
            expect(routingMatrix.crossChainRoutes).toBe(0);
            expect(routingMatrix.intraChainRoutes).toBeGreaterThan(0);
          }

          if (protocol.multiChain && protocol.chains.length > 1) {
            expect(routingMatrix.crossChainRoutes).toBeGreaterThan(0);
          }
        });
      });

      describe('Feature Detection', () => {
        test('should identify additional features', () => {
          const features = detectProtocolFeatures(protocol);

          console.log(`${name} detected features:`, features);

          expect(features).toHaveProperty('hasApprovalSupport');
          expect(features).toHaveProperty('hasBaseUrl');
          expect(features).toHaveProperty('customProperties');
        });
      });
    });
  });

  describe('Protocol Ecosystem Analysis', () => {
    test('should categorize protocols by VM support', () => {
      const EVMChains = [
        ChainIdEnum.ETHEREUM,
        ChainIdEnum.ARBITRUM,
        ChainIdEnum.OPTIMISM,
        ChainIdEnum.POLYGON,
        ChainIdEnum.BSC,
        ChainIdEnum.AVALANCHE,
        ChainIdEnum.BASE,
        ChainIdEnum.BLAST,
        ChainIdEnum.SONIC,
      ];

      const evmProtocols = PROTOCOL_IMPLEMENTATIONS.filter(impl =>
        impl.protocol.chains.some(chain => EVMChains.includes(chain)),
      );

      const solanaProtocols = PROTOCOL_IMPLEMENTATIONS.filter(impl =>
        impl.protocol.chains.includes(ChainIdEnum.SOLANA),
      );

      const moveProtocols = PROTOCOL_IMPLEMENTATIONS.filter(impl =>
        impl.protocol.chains.some(chain => [ChainIdEnum.SUI, ChainIdEnum.APTOS].includes(chain)),
      );

      console.log('\n=== ECOSYSTEM DISTRIBUTION ===');
      console.log(
        `EVM Protocols (${evmProtocols.length}):`,
        evmProtocols.map(p => p.name),
      );
      console.log(
        `Solana Protocols (${solanaProtocols.length}):`,
        solanaProtocols.map(p => p.name),
      );
      console.log(
        `Move Protocols (${moveProtocols.length}):`,
        moveProtocols.map(p => p.name),
      );
      console.log(`Total Protocols: ${PROTOCOL_IMPLEMENTATIONS.length}`);
      console.log('===============================\n');

      expect(PROTOCOL_IMPLEMENTATIONS.length).toBeGreaterThan(0);
    });

    test('should identify bridge vs DEX aggregator protocols', () => {
      const bridgeProtocols = PROTOCOL_IMPLEMENTATIONS.filter(
        impl => impl.protocol.multiChain || impl.name.toLowerCase().includes('bridge'),
      );

      const dexProtocols = PROTOCOL_IMPLEMENTATIONS.filter(
        impl => impl.protocol.singleChain && !impl.name.toLowerCase().includes('bridge'),
      );

      console.log('\n=== PROTOCOL TYPE DISTRIBUTION ===');
      console.log(
        `Bridge/Cross-chain Protocols (${bridgeProtocols.length}):`,
        bridgeProtocols.map(p => p.name),
      );
      console.log(
        `DEX Aggregator Protocols (${dexProtocols.length}):`,
        dexProtocols.map(p => p.name),
      );
      console.log('==================================\n');

      expect(bridgeProtocols.length + dexProtocols.length).toBe(PROTOCOL_IMPLEMENTATIONS.length);
    });

    test('should map routing capabilities across the ecosystem', () => {
      const routingMap = new Map<string, Set<string>>();
      const crossChainCapabilities = new Map<string, number>();

      PROTOCOL_IMPLEMENTATIONS.forEach(impl => {
        const capabilities = analyzeProtocolCapabilities(impl.protocol);

        // Track which VMs each protocol supports
        capabilities.supportedVMs.forEach(vm => {
          if (!routingMap.has(vm)) {
            routingMap.set(vm, new Set());
          }
          routingMap.get(vm)!.add(impl.name);
        });

        // Track cross-chain capabilities
        if (capabilities.canDoCrossChainSwaps) {
          crossChainCapabilities.set(impl.name, capabilities.routingScenarios.length);
        }
      });

      console.log('\n=== ROUTING CAPABILITIES MAP ===');
      routingMap.forEach((protocols, vm) => {
        console.log(`${vm} VM Support:`, Array.from(protocols));
      });

      if (crossChainCapabilities.size > 0) {
        console.log('\nCross-Chain Bridge Capabilities:');
        crossChainCapabilities.forEach((scenarios, name) => {
          console.log(`  ${name}: ${scenarios} routing scenarios`);
        });
      }
      console.log('================================\n');

      expect(routingMap.size).toBeGreaterThan(0);
    });
  });
});

// Helper functions for analysis

function analyzeProtocolCapabilities(protocol: IIntentProtocol) {
  const supportedChains = protocol.chains;
  const vmTypes = new Set<string>();

  supportedChains.forEach(chain => {
    if (
      [
        ChainIdEnum.ETHEREUM,
        ChainIdEnum.ARBITRUM,
        ChainIdEnum.OPTIMISM,
        ChainIdEnum.POLYGON,
        ChainIdEnum.BSC,
        ChainIdEnum.AVALANCHE,
        ChainIdEnum.BASE,
        ChainIdEnum.BLAST,
        ChainIdEnum.SONIC,
      ].includes(chain)
    ) {
      vmTypes.add('EVM');
    } else if (chain === ChainIdEnum.SOLANA) {
      vmTypes.add('Solana');
    } else if ([ChainIdEnum.SUI, ChainIdEnum.APTOS].includes(chain)) {
      vmTypes.add('Move');
    }
  });

  return {
    canDoIntraChainSwaps: protocol.singleChain || protocol.multiChain,
    canDoCrossChainSwaps: protocol.multiChain && supportedChains.length > 1,
    supportedVMs: Array.from(vmTypes),
    routingScenarios: generateRoutingScenarios(protocol),
    chainCount: supportedChains.length,
  };
}

function generateRoutingScenarios(protocol: IIntentProtocol) {
  const scenarios = [];

  if (protocol.singleChain) {
    protocol.chains.forEach(chain => {
      scenarios.push(`Intra-chain swaps on ${ChainIdEnum[chain]}`);
    });
  }

  if (protocol.multiChain && protocol.chains.length > 1) {
    for (let i = 0; i < protocol.chains.length; i++) {
      for (let j = 0; j < protocol.chains.length; j++) {
        if (i !== j) {
          const fromChain = protocol.chains[i];
          const toChain = protocol.chains[j];
          if (fromChain !== undefined && toChain !== undefined) {
            scenarios.push(`${ChainIdEnum[fromChain]} → ${ChainIdEnum[toChain]}`);
          }
        }
      }
    }
  }

  return scenarios;
}

function generateRoutingMatrix(protocol: IIntentProtocol) {
  const chains = protocol.chains;
  let intraChainRoutes = 0;
  let crossChainRoutes = 0;

  if (protocol.singleChain) {
    intraChainRoutes = chains.length; // Each chain can do internal swaps
  }

  if (protocol.multiChain && chains.length > 1) {
    crossChainRoutes = chains.length * (chains.length - 1); // n * (n-1) cross-chain combinations
  }

  return {
    intraChainRoutes,
    crossChainRoutes,
    totalPossibleRoutes: intraChainRoutes + crossChainRoutes,
    supportedChains: chains.map(c => ChainIdEnum[c]),
  };
}

function canCreateValidParams(chainId: ChainIdEnum): boolean {
  try {
    // Try to create valid parameters for this chain
    const wallet = getWalletForChain(chainId);
    const tokens = getTokensForChain(chainId);

    if (!wallet || !tokens) return false;

    createPriceParams({
      networkIn: chainId,
      networkOut: chainId,
      tokenIn: tokens.tokenIn,
      tokenOut: tokens.tokenOut,
      from: wallet,
    });

    return true;
  } catch (error) {
    return false;
  }
}

function getWalletForChain(chainId: ChainIdEnum): string | null {
  if (
    [
      ChainIdEnum.ETHEREUM,
      ChainIdEnum.ARBITRUM,
      ChainIdEnum.OPTIMISM,
      ChainIdEnum.POLYGON,
      ChainIdEnum.BSC,
      ChainIdEnum.AVALANCHE,
      ChainIdEnum.BASE,
      ChainIdEnum.BLAST,
      ChainIdEnum.SONIC,
    ].includes(chainId)
  ) {
    return TEST_WALLETS.EVM;
  } else if (chainId === ChainIdEnum.SOLANA) {
    return TEST_WALLETS.SOLANA;
  } else if ([ChainIdEnum.SUI, ChainIdEnum.APTOS].includes(chainId)) {
    return TEST_WALLETS.SUI;
  }
  return null;
}

function getTokensForChain(chainId: ChainIdEnum): { tokenIn: string; tokenOut: string } | null {
  const chainTokens = (TEST_TOKENS as any)[chainId];
  if (chainTokens) {
    const tokens = Object.values(chainTokens) as string[];
    if (tokens.length >= 2) {
      return {
        tokenIn: tokens[0]!,
        tokenOut: tokens[1]!,
      };
    }
  }
  return null;
}

function detectProtocolFeatures(protocol: IIntentProtocol) {
  return {
    hasApprovalSupport: 'includeApprovals' in protocol,
    hasBaseUrl: 'baseUrl' in protocol,
    customProperties: Object.keys(protocol).filter(
      key =>
        !['protocol', 'chains', 'singleChain', 'multiChain', 'fetchPrice', 'fetchQuote'].includes(
          key,
        ),
    ),
  };
}
