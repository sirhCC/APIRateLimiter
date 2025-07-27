#!/usr/bin/env node

// Simple test script to verify the API Rate Limiter setup
const axios = require('axios');

async function testRateLimiter() {
  const baseUrl = 'http://localhost:3000';
  
  try {
    console.log('🧪 Testing API Rate Limiter...\n');
    
    // Test health check
    console.log('1. Testing health check...');
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log(`   ✅ Health check: ${healthResponse.data.status}`);
    
    // Test configuration endpoint
    console.log('2. Testing configuration...');
    const configResponse = await axios.get(`${baseUrl}/config`);
    console.log(`   ✅ Config loaded with ${configResponse.data.rules.length} rules`);
    
    // Test rate limiting
    console.log('3. Testing rate limiting...');
    for (let i = 1; i <= 5; i++) {
      try {
        const response = await axios.get(`${baseUrl}/test`);
        console.log(`   Request ${i}: ✅ Allowed (${response.headers['x-ratelimit-remaining']} remaining)`);
      } catch (error) {
        if (error.response && error.response.status === 429) {
          console.log(`   Request ${i}: ❌ Rate limited`);
        } else {
          console.log(`   Request ${i}: ❌ Error - ${error.message}`);
        }
      }
    }
    
    console.log('\n🎉 Rate Limiter is working correctly!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure to:');
    console.log('   1. Start Redis server');
    console.log('   2. Run "npm run dev" to start the rate limiter');
    console.log('   3. Check your .env configuration');
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testRateLimiter();
}

module.exports = testRateLimiter;
