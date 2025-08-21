import { JupiterService } from '../../src/protocols/jupiter/jupiter.service';
import {
  PROTOCOL_EXPECTATIONS,
  TEST_TOKENS,
  TEST_WALLETS,
  createPriceParams,
} from '../fixtures/test-data';
import { ChainIdEnum, ProtocolEnum } from '../../src/types/enums';

describe('Protocol Interface Tests', () => {
  let jupiterService: JupiterService;

  beforeEach(() => {
    jupiterService = new JupiterService();
  });

  describe('Interface Compliance', () => {
    test('should implement IIntentProtocol interface', () => {
      expect(jupiterService).toBeDefined();
      expect(typeof jupiterService.fetchPrice).toBe('function');
      expect(typeof jupiterService.fetchQuote).toBe('function');
    });

    test('should have required protocol properties', () => {
      expect(jupiterService.protocol).toBe(ProtocolEnum.JUPITER);
      expect(Array.isArray(jupiterService.chains)).toBe(true);
      expect(typeof jupiterService.singleChain).toBe('boolean');
      expect(typeof jupiterService.multiChain).toBe('boolean');
    });

    test('should have correct chain configuration', () => {
      const expectedBehavior = PROTOCOL_EXPECTATIONS[ProtocolEnum.JUPITER];
      expect(jupiterService.singleChain).toBe(expectedBehavior.singleChain);
      expect(jupiterService.multiChain).toBe(expectedBehavior.multiChain);
    });
  });

  describe('Chain Support', () => {
    test('should support expected chains', () => {
      const expectedChains = PROTOCOL_EXPECTATIONS[ProtocolEnum.JUPITER].supportedChains;
      expectedChains.forEach(chain => {
        expect(jupiterService.chains).toContain(chain);
      });
    });

    test('should only support Solana', () => {
      expect(jupiterService.chains).toEqual([ChainIdEnum.SOLANA]);
    });
  });

  describe('Configuration', () => {
    test('should allow price parameter overrides', () => {
      const configuredService = new JupiterService({
      });

      expect(configuredService).toBeDefined();
    });

    test('should handle private URL configuration', () => {
      const jupiterPrivateUrl = 'https://private-jupiter-api.example.com';
      const configuredService = new JupiterService({
        jupiterPrivateUrl,
      });

      expect(configuredService.baseUrl).toBe(jupiterPrivateUrl);
    });
  });

  describe('Parameter Validation', () => {
    test('should reject non-Solana networks without making API calls', async () => {
      const params = createPriceParams({
        networkIn: ChainIdEnum.ETHEREUM,
        networkOut: ChainIdEnum.ETHEREUM,
      });

      await expect(jupiterService.fetchPrice(params)).rejects.toThrow(
        'Jupiter only supports Solana network',
      );
    });

    test('should create valid Solana price parameters', () => {
      const params = createPriceParams({
        networkIn: ChainIdEnum.SOLANA,
        networkOut: ChainIdEnum.SOLANA,
        tokenIn: TEST_TOKENS[ChainIdEnum.SOLANA].SOL,
        tokenOut: TEST_TOKENS[ChainIdEnum.SOLANA].USDC,
        from: TEST_WALLETS.SOLANA,
      });

      expect(params.networkIn).toBe(ChainIdEnum.SOLANA);
      expect(params.networkOut).toBe(ChainIdEnum.SOLANA);
      expect(params.tokenIn).toBe(TEST_TOKENS[ChainIdEnum.SOLANA].SOL);
      expect(params.tokenOut).toBe(TEST_TOKENS[ChainIdEnum.SOLANA].USDC);
      expect(params.from).toBe(TEST_WALLETS.SOLANA);
    });
  });
});
