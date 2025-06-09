# Test Strategy for Genius Intents

This document outlines the comprehensive test strategy for the Genius Intents repository, which aggregates DEX aggregators and bridges with standardized interfaces.

## Overview

The test suite is designed to be **dynamic and extensible**, allowing any protocol implementing the `IIntentProtocol` interface to be tested using the same standardized test framework.

## Test Architecture

### 1. **Dynamic Protocol Test Runner** (`tests/core/protocol-test-runner.ts`)
The core of our testing strategy is the `ProtocolTestRunner` class, which can test any protocol implementation against the standardized interface.

**Features:**
- ✅ Interface compliance validation
- ✅ Chain support verification  
- ✅ Price fetching functionality
- ✅ Quote generation testing
- ✅ Parameter validation
- ✅ Error handling verification
- ✅ Protocol-specific customization

### 2. **Test Categories**

#### **Unit Tests** (`tests/core/`, `tests/utils/`)
- Test individual protocol implementations
- Validate utility functions
- Test error handling and edge cases

#### **Protocol Tests** (`tests/protocols/`)
- Protocol-specific test files
- Each protocol gets its own test file using the dynamic test runner
- Custom test cases for protocol-specific behavior

#### **Integration Tests** (`tests/integration/`)
- Cross-chain functionality testing
- Multi-protocol interaction testing
- End-to-end workflow validation

#### **Fixtures & Test Data** (`tests/fixtures/`)
- Standardized test parameters
- Mock API responses
- Cross-chain test scenarios

## Usage

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test categories
npm run test:protocols     # Protocol-specific tests
npm run test:integration   # Integration tests
npm run test:unit         # Core utilities tests
```

### Testing a New Protocol

#### Option 1: Using the Test Generator
```typescript
import { TestGenerator } from '../utils/test-generator';
import { YourProtocolService } from '../../src/protocols/your-protocol/your-protocol.service';

// Analyze your protocol and generate test template
const protocol = new YourProtocolService();
const template = TestGenerator.analyzeProtocol(protocol);
const testCode = TestGenerator.generateProtocolTest(template);

// Save to tests/protocols/your-protocol.test.ts
```

#### Option 2: Manual Setup
```typescript
import { YourProtocolService } from '../../src/protocols/your-protocol/your-protocol.service';
import { ProtocolTestRunner } from '../core/protocol-test-runner';

describe('Your Protocol Tests', () => {
  let protocolService: YourProtocolService;
  let testRunner: ProtocolTestRunner;

  beforeEach(() => {
    protocolService = new YourProtocolService();
    
    testRunner = new ProtocolTestRunner({
      protocol: protocolService,
      expectedBehavior: {
        supportedChains: [ChainIdEnum.ETHEREUM], // Your supported chains
        singleChain: true,
        multiChain: false,
        requiresApprovals: true,
      },
    });
  });

  // Run all standard tests
  testRunner.runAllTests();

  // Add your custom tests
  describe('Protocol-Specific Tests', () => {
    test('your custom functionality', async () => {
      // Custom test implementation
    });
  });
});
```

### Test Configuration

#### Skipping Tests
You can skip specific test categories for protocols that don't support certain functionality:

```typescript
new ProtocolTestRunner({
  protocol: yourProtocol,
  expectedBehavior: { /* ... */ },
  skipTests: {
    price: false,        // Skip price tests
    quote: false,        // Skip quote tests  
    validation: false,   // Skip validation tests
    errorHandling: false // Skip error handling tests
  }
});
```

#### Custom Test Parameters
Provide protocol-specific test parameters:

```typescript
new ProtocolTestRunner({
  protocol: yourProtocol,
  expectedBehavior: { /* ... */ },
  customTestParams: {
    validPriceParams: createPriceParams({
      networkIn: ChainIdEnum.SOLANA,
      tokenIn: 'your-token-address',
      // ... other params
    }),
    validQuoteParams: createQuoteParams({
      from: 'your-wallet-address',
      // ... other params  
    }),
  }
});
```

## Test Data & Fixtures

### Standard Test Tokens (`tests/fixtures/test-data.ts`)
```typescript
TEST_TOKENS = {
  [ChainIdEnum.ETHEREUM]: {
    ETH: '0x0000000000000000000000000000000000000000',
    USDC: '0xa0b86a33e6c3b3f4ac24b8b6e95e80e1e5c2d68e',
  },
  [ChainIdEnum.SOLANA]: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  // ... other chains
}
```

### Cross-Chain Scenarios
```typescript
CROSS_CHAIN_SCENARIOS = [
  {
    name: 'ETH to BSC USDT',
    params: createPriceParams({
      networkIn: ChainIdEnum.ETHEREUM,
      networkOut: ChainIdEnum.BSC,
      // ...
    }),
  },
  // ... other scenarios
]
```

## Best Practices

### 1. **Mocking External APIs**
Always mock external API calls in tests:

```typescript
beforeEach(() => {
  mockedAxios.get.mockResolvedValue(mockAxiosResponse({
    // Your mock response data
  }));
});
```

### 2. **Protocol-Specific Mock Data**
Create realistic mock responses for each protocol:

```typescript
export const MOCK_RESPONSES = {
  JUPITER_PRICE: {
    inputMint: 'So11111111111111111111111111111111111111112',
    outAmount: '180000000',
    // ... Jupiter-specific response format
  },
  ODOS_PRICE: {
    pathId: 'test-path-id-123',
    outAmounts: ['1800000000'],
    // ... Odos-specific response format
  },
};
```

### 3. **Test Organization**
Organize tests by functionality:

```typescript
describe('Protocol Name', () => {
  // Standard interface tests (using ProtocolTestRunner)
  testRunner.runAllTests();
  
  describe('Protocol-Specific Functionality', () => {
    // Custom protocol tests
  });
  
  describe('Error Handling', () => {
    // Protocol-specific error scenarios
  });
});
```

### 4. **Chain-Specific Testing**
Test each supported chain with appropriate parameters:

```typescript
describe.each(protocol.chains)('Chain %s', (chainId) => {
  test('should handle chain-specific parameters', async () => {
    const params = createPriceParams({
      networkIn: chainId,
      networkOut: chainId,
      tokenIn: getChainSpecificToken(chainId),
    });
    
    // Test with chain-specific setup
  });
});
```

## Adding New Test Types

### 1. **Extend Protocol Test Runner**
Add new test categories to the `ProtocolTestRunner`:

```typescript
class ProtocolTestRunner {
  runAllTests() {
    // ... existing tests
    this.runYourNewTestCategory();
  }
  
  private runYourNewTestCategory() {
    describe('Your New Test Category', () => {
      // Implement new test logic
    });
  }
}
```

### 2. **Create Specialized Test Utilities**
For complex testing scenarios, create specialized utilities:

```typescript
// tests/utils/performance-tester.ts
export class PerformanceTester {
  static async testResponseTime(protocol: IIntentProtocol, params: PriceParams) {
    const start = Date.now();
    await protocol.fetchPrice(params);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000); // 5 second timeout
  }
}
```

## Coverage Goals

- **Interface Compliance**: 100% - All protocols must implement the interface correctly
- **Core Functionality**: 95% - Price/quote fetching, validation, error handling  
- **Protocol-Specific**: 80% - Custom protocol features and edge cases
- **Integration**: 70% - Cross-chain and multi-protocol scenarios

## Continuous Integration

The test suite is designed to run in CI/CD pipelines:

```yaml
# .github/workflows/test.yml
- name: Run Tests
  run: |
    npm ci
    npm run test:coverage
    
- name: Upload Coverage
  uses: codecov/codecov-action@v1
```

## Future Enhancements

1. **Property-Based Testing**: Generate random but valid test inputs
2. **Performance Benchmarking**: Track protocol response times  
3. **Real API Integration Tests**: Optional tests against live APIs
4. **Fuzz Testing**: Test with malformed/edge case inputs
5. **Visual Test Reports**: Generate HTML reports showing protocol compliance

## Contributing

When adding a new protocol:

1. Implement the `IIntentProtocol` interface
2. Add protocol expectations to `PROTOCOL_EXPECTATIONS`
3. Use `TestGenerator` to create initial test file
4. Add protocol-specific test cases
5. Update test data fixtures if needed
6. Ensure all tests pass with `npm test`

For questions or issues with the test framework, please refer to the test files or create an issue. 