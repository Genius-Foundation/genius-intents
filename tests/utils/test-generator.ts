import { ChainIdEnum } from '../../src/types/enums';
import { IIntentProtocol } from '../../src/interfaces/intent-protocol';

export type ProtocolTestTemplate = {
  protocolName: string;
  className: string;
  supportedChains: ChainIdEnum[];
  singleChain: boolean;
  multiChain: boolean;
  requiresApprovals?: boolean;
  customTestCases?: string[];
};

export class TestGenerator {
  /**
   * Generates a test file template for a new protocol
   */
  static generateProtocolTest(template: ProtocolTestTemplate): string {
    const {
      protocolName,
      className,
      supportedChains,
      singleChain,
      multiChain,
      requiresApprovals = false,
      customTestCases = [],
    } = template;

    return `import { ${className} } from '../../src/protocols/${protocolName.toLowerCase()}/${protocolName.toLowerCase()}.service';
import { ProtocolTestRunner } from '../core/protocol-test-runner';
import { PROTOCOL_EXPECTATIONS, TEST_TOKENS, TEST_WALLETS, createPriceParams, createQuoteParams } from '../fixtures/test-data';
import { ChainIdEnum, ProtocolEnum } from '../../src/types/enums';
import { mockAxiosResponse } from '../setup';
import axios from 'axios';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('${protocolName} Protocol Tests', () => {
  let ${protocolName.toLowerCase()}Service: ${className};
  let testRunner: ProtocolTestRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    ${protocolName.toLowerCase()}Service = new ${className}();
    
    testRunner = new ProtocolTestRunner({
      protocol: ${protocolName.toLowerCase()}Service,
      expectedBehavior: {
        supportedChains: [${supportedChains.map(chain => `ChainIdEnum.${ChainIdEnum[chain]}`).join(', ')}],
        singleChain: ${singleChain},
        multiChain: ${multiChain},
        requiresApprovals: ${requiresApprovals},
      },
      customTestParams: {
        validPriceParams: createPriceParams({
          networkIn: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
          networkOut: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
          // Add chain-specific token addresses
        }),
        validQuoteParams: createQuoteParams({
          networkIn: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
          networkOut: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
          // Add chain-specific parameters
        }),
      },
    });
  });

  // Run the standard protocol tests
  testRunner.runAllTests();

  // ${protocolName}-specific tests
  describe('${protocolName}-Specific Functionality', () => {
    beforeEach(() => {
      // Mock successful API responses
      mockedAxios.get.mockResolvedValue(mockAxiosResponse({
        // Add protocol-specific mock response
      }));

      mockedAxios.post.mockResolvedValue(mockAxiosResponse({
        // Add protocol-specific mock response
      }));
    });

    ${customTestCases
      .map(
        testCase => `
    test('${testCase}', async () => {
      // Implement ${testCase} test
      expect(true).toBe(true); // Placeholder
    });`,
      )
      .join('')}

    test('should handle protocol-specific configuration', () => {
      const configuredService = new ${className}({
        // Add protocol-specific configuration
      });

      expect(configuredService).toBeDefined();
    });
  });

  describe('${protocolName} Error Handling', () => {
    test('should handle API error responses', async () => {
      mockedAxios.get.mockResolvedValue(mockAxiosResponse({
        error: 'Protocol-specific error',
      }));

      const params = createPriceParams({
        networkIn: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
        networkOut: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
      });

      await expect(${protocolName.toLowerCase()}Service.fetchPrice(params)).rejects.toThrow();
    });

    test('should handle network timeouts', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network timeout'));

      const params = createPriceParams({
        networkIn: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
        networkOut: ${supportedChains.length > 0 ? `ChainIdEnum.${ChainIdEnum[supportedChains[0] as ChainIdEnum]}` : 'ChainIdEnum.ETHEREUM'},
      });

      await expect(${protocolName.toLowerCase()}Service.fetchPrice(params)).rejects.toThrow();
    });
  });
});`;
  }

  /**
   * Generates test expectations for protocol expectations fixture
   */
  static generateProtocolExpectations(template: ProtocolTestTemplate): string {
    const { protocolName, supportedChains, singleChain, multiChain, requiresApprovals } = template;

    return `[ProtocolEnum.${protocolName.toUpperCase()}]: {
  supportedChains: [${supportedChains.map(chain => `ChainIdEnum.${ChainIdEnum[chain]}`).join(', ')}],
  singleChain: ${singleChain},
  multiChain: ${multiChain},
  requiresApprovals: ${requiresApprovals || false},
},`;
  }

  /**
   * Analyzes a protocol implementation to suggest test templates
   */
  static analyzeProtocol(protocol: IIntentProtocol): ProtocolTestTemplate {
    return {
      protocolName: protocol.protocol,
      className: `${protocol.protocol.charAt(0).toUpperCase()}${protocol.protocol.slice(1)}Service`,
      supportedChains: protocol.chains,
      singleChain: protocol.singleChain,
      multiChain: protocol.multiChain,
      requiresApprovals:
        'includeApprovals' in protocol ? Boolean(protocol.includeApprovals) : false,
      customTestCases: [
        'should handle typical swap scenario',
        'should validate protocol-specific parameters',
        'should handle protocol-specific errors',
      ],
    };
  }

  /**
   * Generates a complete test suite for all protocols
   */
  static generateTestSuite(protocols: IIntentProtocol[]): string {
    const testFiles = protocols.map(protocol => {
      const template = this.analyzeProtocol(protocol);
      return this.generateProtocolTest(template);
    });

    return testFiles.join('\n\n');
  }
}
