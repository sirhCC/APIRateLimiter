/**
 * Jest Test Setup
 * 
 * Global test configuration and setup for the API Rate Limiter test suite.
 * This file runs before each test to ensure consistent test environment.
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set default test environment variables if not provided
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.REDIS_DB = process.env.REDIS_DB || '15'; // Use different DB for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production';
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || 'test-api-key-secret-do-not-use-in-production';
process.env.PORT = process.env.PORT || '3001'; // Use different port for tests
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Global test timeout for long-running operations
jest.setTimeout(30000);

// Mock console methods to reduce noise in test output
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Global test cleanup
afterEach(() => {
  jest.clearAllMocks();
});
