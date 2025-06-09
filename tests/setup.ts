import { jest } from '@jest/globals';

// Mock axios at the module level first
const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
};

jest.mock('axios', () => ({
  default: mockAxios,
}));

// Global test setup
beforeAll(() => {
  // Set test timeout
  jest.setTimeout(30000);

  // Suppress console logs during tests unless debugging
  if (!process.env['DEBUG_TESTS']) {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

// Global test teardown
afterAll(() => {
  // Clean up any resources
});

// Export commonly used test utilities
export const mockAxiosResponse = <T>(data: T) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
});

export const mockAxiosError = (message: string, status: number = 400) => ({
  response: {
    data: { error: message },
    status,
    statusText: 'Error',
  },
  message,
  isAxiosError: true,
});

// Export the mock for use in tests
export { mockAxios };
