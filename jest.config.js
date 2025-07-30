/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns - simplified to unit tests only by default
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/unit/**/*.test.js'
  ],
  
  // Coverage configuration
  collectCoverage: false, // Disabled by default for simplicity
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Exclude main entry point from coverage
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  
  // No coverage thresholds - keep it simple
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Reset modules between tests
  resetModules: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Force exit to prevent hanging
  forceExit: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Max workers for parallel execution
  maxWorkers: 1, // Use single worker to avoid Redis connection conflicts
  
  // Global teardown for cleanup
  globalTeardown: undefined
};
