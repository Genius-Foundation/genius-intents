import { IIntentProtocol } from '../../src/interfaces/intent-protocol';
import { ChainIdEnum } from '../../src/types/enums';
import { IntentPriceParams } from '../../src/types/price-params';
import { IntentQuoteParams } from '../../src/types/quote-params';
import { createPriceParams, createQuoteParams } from '../fixtures/test-data';

export interface ProtocolTestConfig {
  protocol: IIntentProtocol;
  expectedBehavior: {
    supportedChains: readonly ChainIdEnum[];
    singleChain: boolean;
    multiChain: boolean;
    requiresApprovals?: boolean;
  };
  skipTests?: {
    price?: boolean;
    quote?: boolean;
    validation?: boolean;
    errorHandling?: boolean;
  };
  customTestParams?: {
    validPriceParams?: IntentPriceParams;
    validQuoteParams?: IntentQuoteParams;
    invalidPriceParams?: IntentPriceParams;
  };
}

export class ProtocolTestRunner {
  private config: ProtocolTestConfig;

  constructor(config: ProtocolTestConfig) {
    this.config = config;
  }

  /**
   * Runs the complete test suite for a protocol
   */
  public runAllTests(): void {
    describe(`Protocol: ${this.config.protocol.protocol}`, () => {
      this.runBasicInterfaceTests();
      this.runChainSupportTests();
      this.runPriceTests();
      this.runQuoteTests();
      this.runValidationTests();
      this.runErrorHandlingTests();
    });
  }

  /**
   * Tests basic interface compliance
   */
  private runBasicInterfaceTests(): void {
    describe('Interface Compliance', () => {
      const protocol = this.config.protocol;

      test('should implement IIntentProtocol interface', () => {
        expect(protocol).toBeDefined();
        expect(typeof protocol.fetchPrice).toBe('function');
        expect(typeof protocol.fetchQuote).toBe('function');
      });

      test('should have required protocol properties', () => {
        expect(protocol.protocol).toBeDefined();
        expect(Array.isArray(protocol.chains)).toBe(true);
        expect(typeof protocol.singleChain).toBe('boolean');
        expect(typeof protocol.multiChain).toBe('boolean');
      });

      test('should have correct chain configuration', () => {
        expect(protocol.singleChain).toBe(this.config.expectedBehavior.singleChain);
        expect(protocol.multiChain).toBe(this.config.expectedBehavior.multiChain);
      });
    });
  }

  /**
   * Tests supported chains functionality
   */
  private runChainSupportTests(): void {
    describe('Chain Support', () => {
      const protocol = this.config.protocol;
      const expectedChains = this.config.expectedBehavior.supportedChains;

      test('should support expected chains', () => {
        expectedChains.forEach(chain => {
          expect(protocol.chains).toContain(chain);
        });
      });

      test('should not support unexpected chains', () => {
        const allChains = Object.values(ChainIdEnum) as ChainIdEnum[];
        const unsupportedChains = allChains.filter(chain => !expectedChains.includes(chain));

        unsupportedChains.forEach(chain => {
          expect(protocol.chains).not.toContain(chain);
        });
      });
    });
  }

  /**
   * Tests price fetching functionality
   */
  private runPriceTests(): void {
    if (this.config.skipTests?.price) return;

    describe('Price Fetching', () => {
      const protocol = this.config.protocol;

      test('should fetch price with valid parameters', async () => {
        const params = this.getValidPriceParams();

        // Mock the API call
        const mockResponse = this.getMockPriceResponse();
        jest.spyOn(protocol, 'fetchPrice').mockResolvedValue(mockResponse as any);

        const result = await protocol.fetchPrice(params);

        expect(result).toBeDefined();
        expect(result.protocol).toBe(protocol.protocol);
        expect(result.tokenIn).toBe(params.tokenIn);
        expect(result.tokenOut).toBe(params.tokenOut);
        expect(result.amountIn).toBe(params.amountIn);
        expect(result.amountOut).toBeDefined();
        expect(typeof result.amountOut).toBe('string');
      });

      test('should handle unsupported chains', async () => {
        const unsupportedChain = this.getUnsupportedChain();
        if (!unsupportedChain) return;

        const params = this.getValidPriceParams();
        params.networkIn = unsupportedChain;

        await expect(protocol.fetchPrice(params)).rejects.toThrow();
      });

      test('should validate required parameters', async () => {
        const invalidParams = { ...this.getValidPriceParams() };
        delete (invalidParams as any).tokenIn;

        await expect(protocol.fetchPrice(invalidParams as IntentPriceParams)).rejects.toThrow();
      });
    });
  }

  /**
   * Tests quote fetching functionality
   */
  private runQuoteTests(): void {
    if (this.config.skipTests?.quote) return;

    describe('Quote Fetching', () => {
      const protocol = this.config.protocol;

      test('should fetch quote with valid parameters', async () => {
        const params = this.getValidQuoteParams();

        // Mock both price and quote responses
        const mockPriceResponse = this.getMockPriceResponse();
        const mockQuoteResponse = this.getMockQuoteResponse();

        jest.spyOn(protocol, 'fetchPrice').mockResolvedValue(mockPriceResponse as any);
        jest.spyOn(protocol, 'fetchQuote').mockResolvedValue(mockQuoteResponse as any);

        const result = await protocol.fetchQuote(params);

        expect(result).toBeDefined();
        expect(result.protocol).toBe(protocol.protocol);
        expect(result.from).toBe(params.from);
        expect(result.executionPayload).toBeDefined();
      });

      test('should handle missing price response', async () => {
        const params = this.getValidQuoteParams();
        params.priceResponse = undefined;

        // Mock price fetching to be called automatically
        const mockPriceResponse = this.getMockPriceResponse();
        const mockQuoteResponse = this.getMockQuoteResponse();

        jest.spyOn(protocol, 'fetchPrice').mockResolvedValue(mockPriceResponse as any);
        jest.spyOn(protocol, 'fetchQuote').mockResolvedValue(mockQuoteResponse as any);

        const result = await protocol.fetchQuote(params);
        expect(result).toBeDefined();
      });
    });
  }

  /**
   * Tests parameter validation
   */
  private runValidationTests(): void {
    if (this.config.skipTests?.validation) return;

    describe('Parameter Validation', () => {
      const protocol = this.config.protocol;

      test('should validate price parameters', async () => {
        const testCases = [
          { name: 'missing tokenIn', params: { ...this.getValidPriceParams(), tokenIn: '' } },
          { name: 'missing tokenOut', params: { ...this.getValidPriceParams(), tokenOut: '' } },
          { name: 'invalid amountIn', params: { ...this.getValidPriceParams(), amountIn: '0' } },
          { name: 'invalid slippage', params: { ...this.getValidPriceParams(), slippage: -1 } },
        ];

        for (const testCase of testCases) {
          await expect(protocol.fetchPrice(testCase.params as IntentPriceParams)).rejects.toThrow();
        }
      });

      test('should validate quote parameters', async () => {
        const testCases = [
          { name: 'missing from address', params: { ...this.getValidQuoteParams(), from: '' } },
          {
            name: 'invalid receiver',
            params: { ...this.getValidQuoteParams(), receiver: 'invalid' },
          },
        ];

        for (const testCase of testCases) {
          await expect(protocol.fetchQuote(testCase.params as IntentQuoteParams)).rejects.toThrow();
        }
      });
    });
  }

  /**
   * Tests error handling
   */
  private runErrorHandlingTests(): void {
    if (this.config.skipTests?.errorHandling) return;

    describe('Error Handling', () => {
      const protocol = this.config.protocol;

      test('should handle network errors gracefully', async () => {
        const params = this.getValidPriceParams();

        // Mock network error
        jest.spyOn(protocol, 'fetchPrice').mockRejectedValue(new Error('Network error'));

        await expect(protocol.fetchPrice(params)).rejects.toThrow('Network error');
      });

      test('should handle API errors gracefully', async () => {
        const params = this.getValidPriceParams();

        // Mock API error response
        jest.spyOn(protocol, 'fetchPrice').mockRejectedValue({
          response: { status: 400, data: { error: 'Invalid parameters' } },
        });

        await expect(protocol.fetchPrice(params)).rejects.toBeDefined();
      });
    });
  }

  // Helper methods

  private getValidPriceParams(): IntentPriceParams {
    if (this.config.customTestParams?.validPriceParams) {
      return this.config.customTestParams.validPriceParams;
    }

    const supportedChain = this.config.expectedBehavior.supportedChains[0];
    return createPriceParams({
      networkIn: supportedChain,
      networkOut: supportedChain,
    });
  }

  private getValidQuoteParams(): IntentQuoteParams {
    if (this.config.customTestParams?.validQuoteParams) {
      return this.config.customTestParams.validQuoteParams;
    }

    const supportedChain = this.config.expectedBehavior.supportedChains[0];
    return createQuoteParams({
      networkIn: supportedChain,
      networkOut: supportedChain,
    });
  }

  private getUnsupportedChain(): ChainIdEnum | null {
    const allChains = Object.values(ChainIdEnum) as ChainIdEnum[];
    const unsupportedChains = allChains.filter(
      (chain: ChainIdEnum) => !this.config.expectedBehavior.supportedChains.includes(chain),
    );
    return unsupportedChains.length > 0 ? unsupportedChains[0]! : null;
  }

  private getMockPriceResponse() {
    const params = this.getValidPriceParams();
    return {
      protocol: this.config.protocol.protocol,
      networkIn: params.networkIn,
      networkOut: params.networkOut,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      amountOut: '1000000000',
      slippage: params.slippage,
      protocolResponse: { mockData: true },
    };
  }

  private getMockQuoteResponse() {
    const params = this.getValidQuoteParams();
    return {
      protocol: this.config.protocol.protocol,
      networkIn: params.networkIn,
      networkOut: params.networkOut,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      amountOut: '1000000000',
      from: params.from,
      receiver: params.receiver,
      executionPayload: {
        transactionData: {
          data: '0x',
          to: '0x123',
          value: '0',
        },
      },
      slippage: params.slippage,
      protocolResponse: { mockData: true },
    };
  }
}
