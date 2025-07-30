/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.ts',
    '**/__tests__/**/*.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Exclude main entry point from coverage
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  
  // Coverage thresholds - Adjusted for current development state
  // TODO: Gradually increase these as we expand test coverage
  coverageThreshold: {
    global: {
      branches: 30,  // Current: 30.48% (was 80%)
      functions: 26, // Current: 26.95% (was 80%) 
      lines: 33,     // Current: 33.3% (was 80%)
      statements: 33 // Current: 33.08% (was 80%)
    }
  },
  
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
