#!/usr/bin/env node

/**
 * CORS Configuration Test Suite
 * 
 * Tests CORS functionality including:
 * - Allowed origins acceptance
 * - Unauthorized origins blocking
 * - Preflight request handling
 * - CORS headers validation
 * - Environment-specific behavior
 */

const BASE_URL = 'http://localhost:3000';

// Test origins
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000'
];

const BLOCKED_ORIGINS = [
  'http://evil.com',
  'https://malicious.example.com',
  'http://localhost:9999'
];

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: response.ok ? await response.json() : null
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message,
      headers: {}
    };
  }
}

async function testCors() {
  console.log('🌐 Starting CORS Test Suite\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Requests without Origin (should be allowed)
  console.log('📋 Test 1: Request without Origin header');
  try {
    const result = await makeRequest(`${BASE_URL}/health`);
    if (result.ok) {
      console.log('✅ Request without origin allowed');
      passed++;
    } else {
      console.log('❌ Request without origin blocked');
      failed++;
    }
  } catch (error) {
    console.log(`❌ Request without origin failed: ${error.message}`);
    failed++;
  }
  console.log('');

  // Test 2: Allowed origins
  console.log('📋 Test 2: Allowed Origins');
  for (const origin of ALLOWED_ORIGINS) {
    try {
      const result = await makeRequest(`${BASE_URL}/health`, {
        headers: { 'Origin': origin }
      });
      
      if (result.ok) {
        console.log(`✅ ${origin} - Allowed`);
        
        // Check CORS headers
        const corsHeaders = [
          'access-control-allow-origin',
          'access-control-allow-credentials'
        ];
        
        const hasCorsHeaders = corsHeaders.some(header => 
          result.headers[header] !== undefined
        );
        
        if (hasCorsHeaders) {
          console.log(`   CORS headers present`);
        } else {
          console.log(`   ⚠️  CORS headers missing`);
        }
        passed++;
      } else {
        console.log(`❌ ${origin} - Blocked (should be allowed)`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${origin} - Error: ${error.message}`);
      failed++;
    }
  }
  console.log('');

  // Test 3: Blocked origins
  console.log('📋 Test 3: Blocked Origins');
  for (const origin of BLOCKED_ORIGINS) {
    try {
      const result = await makeRequest(`${BASE_URL}/health`, {
        headers: { 'Origin': origin }
      });
      
      if (!result.ok) {
        console.log(`✅ ${origin} - Properly blocked`);
        passed++;
      } else {
        console.log(`❌ ${origin} - Allowed (should be blocked)`);
        failed++;
      }
    } catch (error) {
      // CORS errors are expected for blocked origins
      if (error.message.includes('CORS') || error.message.includes('blocked')) {
        console.log(`✅ ${origin} - Properly blocked (CORS error)`);
        passed++;
      } else {
        console.log(`❌ ${origin} - Unexpected error: ${error.message}`);
        failed++;
      }
    }
  }
  console.log('');

  // Test 4: Preflight requests (OPTIONS)
  console.log('📋 Test 4: Preflight Requests');
  try {
    const result = await makeRequest(`${BASE_URL}/health`, {
      method: 'OPTIONS',
      headers: {
        'Origin': ALLOWED_ORIGINS[0],
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    if (result.status === 200) {
      console.log('✅ Preflight request handled correctly');
      
      // Check for required preflight headers
      const preflightHeaders = [
        'access-control-allow-methods',
        'access-control-allow-headers',
        'access-control-max-age'
      ];
      
      const hasPreflightHeaders = preflightHeaders.some(header => 
        result.headers[header] !== undefined
      );
      
      if (hasPreflightHeaders) {
        console.log('   Preflight headers present');
      } else {
        console.log('   ⚠️  Some preflight headers missing');
      }
      passed++;
    } else {
      console.log(`❌ Preflight request failed: ${result.status}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ Preflight request error: ${error.message}`);
    failed++;
  }
  console.log('');

  // Test 5: CORS configuration endpoint
  console.log('📋 Test 5: CORS Configuration Info');
  try {
    const result = await makeRequest(`${BASE_URL}/config`);
    if (result.ok && result.data?.config?.security?.corsInfo) {
      const corsInfo = result.data.config.security.corsInfo;
      console.log('✅ CORS configuration accessible');
      console.log(`   Enabled: ${corsInfo.enabled}`);
      console.log(`   Origins: ${corsInfo.originsCount} configured`);
      console.log(`   Credentials: ${corsInfo.allowsCredentials}`);
      console.log(`   Wildcard: ${corsInfo.allowsWildcard}`);
      console.log(`   Environment: ${corsInfo.environment}`);
      passed++;
    } else {
      console.log('❌ CORS configuration not accessible');
      failed++;
    }
  } catch (error) {
    console.log(`❌ CORS configuration error: ${error.message}`);
    failed++;
  }
  console.log('');

  // Test 6: API Key with CORS
  console.log('📋 Test 6: API Endpoints with CORS');
  try {
    const result = await makeRequest(`${BASE_URL}/api-keys/tiers`, {
      headers: { 'Origin': ALLOWED_ORIGINS[0] }
    });
    
    if (result.ok) {
      console.log('✅ API endpoints work with CORS');
      passed++;
    } else {
      console.log('❌ API endpoints blocked with CORS');
      failed++;
    }
  } catch (error) {
    console.log(`❌ API endpoints CORS error: ${error.message}`);
    failed++;
  }
  console.log('');

  // Summary
  console.log('📊 CORS Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All CORS tests passed! CORS configuration is working correctly.');
  } else {
    console.log('\n⚠️  Some CORS tests failed. Please review the configuration.');
  }

  return { passed, failed };
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This test requires Node.js 18+ or a fetch polyfill');
  process.exit(1);
}

// Run tests
testCors().catch(error => {
  console.error('❌ CORS test suite failed:', error);
  process.exit(1);
});
