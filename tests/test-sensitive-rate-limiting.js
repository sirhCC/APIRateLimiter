/**
 * Test script for sensitive endpoint rate limiting
 * 
 * This script tests the new rate limiting functionality for sensitive endpoints
 * to ensure proper protection against abuse and brute force attacks.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Test configuration
const tests = [
  {
    name: 'Authentication Endpoint Rate Limiting',
    endpoint: '/auth/login',
    method: 'POST',
    data: { email: 'test@example.com', password: 'wrongpassword' },
    expectedLimit: 10, // 10 attempts per 5 minutes
    description: 'Should limit brute force login attempts'
  },
  {
    name: 'API Key Generation Rate Limiting',
    endpoint: '/api-keys',
    method: 'POST',
    data: { name: 'test-key', tier: 'free' },
    expectedLimit: 20, // 20 requests per minute
    description: 'Should limit API key generation attempts'
  },
  {
    name: 'Rule Management Rate Limiting',
    endpoint: '/rules',
    method: 'POST',
    data: {
      id: 'test-rule',
      name: 'Test Rule',
      pattern: '/test',
      config: { windowMs: 60000, max: 100, algorithm: 'fixed-window' }
    },
    expectedLimit: 5, // 5 requests per minute
    description: 'Should strictly limit rule management operations'
  },
  {
    name: 'Stats Reset Rate Limiting',
    endpoint: '/stats/reset',
    method: 'POST',
    data: {},
    expectedLimit: 5, // 5 requests per minute
    description: 'Should strictly limit stats reset operations'
  },
  {
    name: 'API Key Listing Rate Limiting',
    endpoint: '/api-keys?userId=test-user',
    method: 'GET',
    data: null,
    expectedLimit: 20, // 20 requests per minute
    description: 'Should moderately limit API key listing'
  },
  {
    name: 'Information Endpoint Rate Limiting',
    endpoint: '/api-keys/tiers',
    method: 'GET',
    data: null,
    expectedLimit: 100, // 100 requests per minute
    description: 'Should lightly limit information endpoints'
  }
];

async function testEndpointRateLimit(test) {
  console.log(`\n🔍 Testing: ${test.name}`);
  console.log(`📝 Description: ${test.description}`);
  console.log(`🎯 Endpoint: ${test.method} ${test.endpoint}`);
  console.log(`📊 Expected limit: ${test.expectedLimit} requests`);

  let successCount = 0;
  let rateLimitedCount = 0;
  let errors = [];

  // Make rapid requests to trigger rate limiting
  const promises = [];
  for (let i = 0; i < test.expectedLimit + 10; i++) {
    const promise = makeRequest(test.endpoint, test.method, test.data)
      .then(response => {
        if (response.status === 200 || response.status === 201) {
          successCount++;
        } else if (response.status === 429) {
          rateLimitedCount++;
        }
        return response;
      })
      .catch(error => {
        if (error.response && error.response.status === 429) {
          rateLimitedCount++;
        } else {
          errors.push(error.message);
        }
        return error.response;
      });
    promises.push(promise);
  }

  await Promise.all(promises);

  // Analyze results
  console.log(`✅ Successful requests: ${successCount}`);
  console.log(`🚫 Rate limited (429): ${rateLimitedCount}`);
  console.log(`❌ Other errors: ${errors.length}`);

  if (rateLimitedCount > 0) {
    console.log(`🎉 Rate limiting is working! ${rateLimitedCount} requests were blocked.`);
  } else {
    console.log(`⚠️  Warning: No requests were rate limited. Check configuration.`);
  }

  if (errors.length > 0) {
    console.log(`⚠️  Errors encountered: ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
  }

  return {
    test: test.name,
    success: successCount,
    rateLimited: rateLimitedCount,
    errors: errors.length,
    working: rateLimitedCount > 0
  };
}

async function makeRequest(endpoint, method, data) {
  const config = {
    method: method.toLowerCase(),
    url: `${BASE_URL}${endpoint}`,
    timeout: 5000,
    validateStatus: function (status) {
      return status >= 200 && status < 500; // Don't throw errors for 4xx responses
    }
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    config.data = data;
    config.headers = {
      'Content-Type': 'application/json'
    };
  }

  return axios(config);
}

async function checkServerHealth() {
  try {
    const response = await axios.get(`${BASE_URL}/health`, {
      validateStatus: function (status) {
        return status >= 200 && status < 600; // Accept any valid HTTP status
      }
    });
    if (response.status === 200 || response.status === 503) {
      console.log('✅ Server is running and ready for testing');
      if (response.status === 503) {
        console.log('⚠️  Note: Redis is not connected, but rate limiting will still work with in-memory fallback');
      }
      return true;
    }
  } catch (error) {
    console.error('❌ Server health check failed:', error.message);
    console.log('📝 Make sure the server is running: npm run dev');
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 Starting Sensitive Endpoint Rate Limiting Tests');
  console.log('================================================\n');

  // Check server health first
  const isHealthy = await checkServerHealth();
  if (!isHealthy) {
    process.exit(1);
  }

  const results = [];

  // Run each test
  for (const test of tests) {
    try {
      const result = await testEndpointRateLimit(test);
      results.push(result);
      
      // Wait between tests to avoid interference
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Test failed: ${test.name} - ${error.message}`);
      results.push({
        test: test.name,
        success: 0,
        rateLimited: 0,
        errors: 1,
        working: false
      });
    }
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  
  const workingTests = results.filter(r => r.working).length;
  const totalTests = results.length;
  
  console.log(`✅ Working rate limiters: ${workingTests}/${totalTests}`);
  console.log(`🔍 Total requests made: ${results.reduce((sum, r) => sum + r.success + r.rateLimited, 0)}`);
  console.log(`🚫 Total rate limited: ${results.reduce((sum, r) => sum + r.rateLimited, 0)}`);
  
  results.forEach(result => {
    const status = result.working ? '✅' : '⚠️';
    console.log(`${status} ${result.test}: ${result.rateLimited} blocked`);
  });

  if (workingTests === totalTests) {
    console.log('\n🎉 All sensitive endpoint rate limiters are working correctly!');
  } else {
    console.log(`\n⚠️  ${totalTests - workingTests} rate limiters may need attention.`);
  }
}

// Export for use as a module or run directly
module.exports = { runAllTests, testEndpointRateLimit };

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
