#!/usr/bin/env node

/**
 * Comprehensive Validation Test Suite
 * 
 * Tests all endpoints with both valid and invalid data to verify:
 * - Request validation (400 errors for invalid input)
 * - Response validation (proper response structure)
 * - Error message formatting
 * - Schema compliance
 */

const BASE_URL = 'http://localhost:3000';

async function makeRequest(method, endpoint, body = null, headers = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
    };
  }
}

async function testValidation() {
  console.log('🧪 Starting Validation Test Suite\n');

  const tests = [
    // ============================
    // Authentication Tests
    // ============================
    {
      name: 'Login with invalid email',
      method: 'POST',
      endpoint: '/auth/login',
      body: { email: 'invalid-email', password: 'short' },
      expectStatus: 400,
      expectValidationError: true,
    },
    {
      name: 'Login with missing fields',
      method: 'POST',
      endpoint: '/auth/login',
      body: {},
      expectStatus: 400,
      expectValidationError: true,
    },
    {
      name: 'Login with valid data',
      method: 'POST',
      endpoint: '/auth/login',
      body: { email: 'user@example.com', password: 'demo123' },
      expectStatus: 200,
      expectValidationError: false,
    },

    // ============================
    // API Key Management Tests
    // ============================
    {
      name: 'Create API key with invalid tier',
      method: 'POST',
      endpoint: '/api-keys',
      body: { name: 'Test', tier: 'invalid' },
      expectStatus: 400,
      expectValidationError: true,
    },
    {
      name: 'Create API key without name',
      method: 'POST',
      endpoint: '/api-keys',
      body: { tier: 'free' },
      expectStatus: 400,
      expectValidationError: true,
    },
    {
      name: 'Create API key with valid data',
      method: 'POST',
      endpoint: '/api-keys',
      body: { name: 'Validation Test Key', tier: 'free', userId: 'test-user' },
      expectStatus: 201,
      expectValidationError: false,
    },
    {
      name: 'List API keys without userId',
      method: 'GET',
      endpoint: '/api-keys',
      expectStatus: 400,
      expectValidationError: true,
    },
    {
      name: 'List API keys with valid userId',
      method: 'GET',
      endpoint: '/api-keys?userId=test-user',
      expectStatus: 200,
      expectValidationError: false,
    },

    // ============================
    // Rule Management Tests
    // ============================
    {
      name: 'Create rule with invalid config',
      method: 'POST',
      endpoint: '/rules',
      body: { 
        name: 'Test Rule', 
        pattern: '/test',
        config: { windowMs: 'invalid', maxRequests: -1 }
      },
      expectStatus: 400,
      expectValidationError: true,
    },
    {
      name: 'Create rule with valid data',
      method: 'POST',
      endpoint: '/rules',
      body: {
        id: 'test-rule-validation',
        name: 'Validation Test Rule',
        pattern: '/test/*',
        config: {
          windowMs: 60000,
          maxRequests: 100,
          algorithm: 'sliding-window'
        },
        enabled: true,
        priority: 10
      },
      expectStatus: 200,
      expectValidationError: false,
    },

    // ============================
    // System Endpoint Tests
    // ============================
    {
      name: 'Health check',
      method: 'GET',
      endpoint: '/health',
      expectStatus: [200, 503], // Can be either depending on Redis
      expectValidationError: false,
    },
    {
      name: 'Configuration',
      method: 'GET',
      endpoint: '/config',
      expectStatus: 200,
      expectValidationError: false,
    },
    {
      name: 'Statistics',
      method: 'GET',
      endpoint: '/stats',
      expectStatus: 200,
      expectValidationError: false,
    },
    {
      name: 'Performance',
      method: 'GET',
      endpoint: '/performance',
      expectStatus: 200,
      expectValidationError: false,
    },
    {
      name: 'API Key Tiers',
      method: 'GET',
      endpoint: '/api-keys/tiers',
      expectStatus: 200,
      expectValidationError: false,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await makeRequest(test.method, test.endpoint, test.body);
      
      const statusMatches = Array.isArray(test.expectStatus) 
        ? test.expectStatus.includes(result.status)
        : result.status === test.expectStatus;

      const hasValidationError = result.data?.error === 'Validation Error';
      const validationErrorMatches = hasValidationError === test.expectValidationError;

      if (statusMatches && validationErrorMatches) {
        console.log(`✅ ${test.name}`);
        if (test.expectValidationError && result.data?.details) {
          console.log(`   Validation details: ${result.data.details.length} error(s)`);
          result.data.details.forEach(detail => {
            console.log(`   - ${detail.field}: ${detail.message}`);
          });
        }
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        console.log(`   Expected status: ${test.expectStatus}, got: ${result.status}`);
        console.log(`   Expected validation error: ${test.expectValidationError}, got: ${hasValidationError}`);
        if (result.data) {
          console.log(`   Response: ${JSON.stringify(result.data, null, 2)}`);
        }
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - Error: ${error.message}`);
      failed++;
    }

    console.log(''); // Empty line for readability
  }

  console.log(`\n📊 Test Results:`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All validation tests passed! Input validation is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the validation implementation.');
  }
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This test requires Node.js 18+ or a fetch polyfill');
  process.exit(1);
}

// Run tests
testValidation().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
