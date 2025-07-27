#!/usr/bin/env node

/**
 * Simple API Rate Limiter Test (No Redis Required)
 * Tests the basic functionality and API endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testBasicFunctionality() {
    console.log('🧪 Testing API Rate Limiter Basic Functionality...\n');

    try {
        // 1. Test health check
        console.log('1. Testing health check...');
        let health;
        try {
            health = await axios.get(`${BASE_URL}/health`);
        } catch (error) {
            // Health endpoint might return 503 when Redis is down, but still provide data
            if (error.response && error.response.status === 503) {
                health = error.response;
            } else {
                throw error;
            }
        }
        console.log(`✅ Server Status: ${health.data.status}`);
        console.log(`   Redis Status: ${health.data.redis ? '✅ Connected' : '❌ Disconnected'}`);
        console.log(`   Uptime: ${Math.floor(health.data.uptime)}s`);
        console.log();

        // 2. Test basic endpoints
        console.log('2. Testing basic endpoints...');
        const testResponse = await axios.get(`${BASE_URL}/test`);
        console.log('✅ /test endpoint working');
        console.log('   Response:', testResponse.data.message);
        console.log();

        // 3. Test configuration endpoint
        console.log('3. Testing configuration...');
        const config = await axios.get(`${BASE_URL}/config`);
        console.log('✅ Configuration loaded');
        console.log('   Default algorithm:', config.data.defaultRateLimit.algorithm);
        console.log('   Window:', config.data.defaultRateLimit.windowMs + 'ms');
        console.log('   Max requests:', config.data.defaultRateLimit.max);
        console.log('   Rules configured:', config.data.rules.length);
        console.log();

        // 4. Test API key tiers endpoint
        console.log('4. Testing API key tiers...');
        try {
            const tiers = await axios.get(`${BASE_URL}/api-keys/tiers`);
            console.log('✅ API key tiers available');
            Object.entries(tiers.data.tiers).forEach(([name, tier]) => {
                console.log(`   ${name.toUpperCase()}: ${tier.rateLimit.maxRequests} req/min (${tier.rateLimit.algorithm})`);
            });
        } catch (error) {
            console.log('❌ API key tiers endpoint error:', error.response?.status || error.message);
        }
        console.log();

        // 5. Test dashboard
        console.log('5. Testing dashboard...');
        try {
            const dashboard = await axios.get(`${BASE_URL}/dashboard`);
            console.log('✅ Dashboard accessible (HTML returned)');
        } catch (error) {
            console.log('❌ Dashboard error:', error.response?.status || error.message);
        }
        console.log();

        // 6. Test statistics endpoint
        console.log('6. Testing statistics...');
        try {
            const stats = await axios.get(`${BASE_URL}/stats`);
            console.log('✅ Statistics endpoint working');
            console.log('   Total requests:', stats.data.stats.totalRequests || 0);
            console.log('   Blocked requests:', stats.data.stats.blockedRequests || 0);
        } catch (error) {
            console.log('❌ Statistics error:', error.response?.status || error.message);
        }
        console.log();

        // 7. Test performance monitoring
        console.log('7. Testing performance monitoring...');
        try {
            const performance = await axios.get(`${BASE_URL}/performance`);
            console.log('✅ Performance monitoring working');
            console.log('   Request count:', performance.data.performance.totalRequests || 0);
            console.log('   Average response time:', performance.data.performance.averageResponseTime || 'N/A');
        } catch (error) {
            console.log('❌ Performance monitoring error:', error.response?.status || error.message);
        }
        console.log();

        // 8. Test demo endpoints (these should work even without Redis in some cases)
        console.log('8. Testing demo endpoints...');
        const demoEndpoints = ['/demo/strict', '/demo/moderate', '/demo/heavy', '/demo/interactive'];
        
        for (const endpoint of demoEndpoints) {
            try {
                const response = await axios.get(`${BASE_URL}${endpoint}`);
                console.log(`✅ ${endpoint}: ${response.status} - ${response.data.message.split(' ').slice(0, 5).join(' ')}...`);
            } catch (error) {
                console.log(`❌ ${endpoint}: ${error.response?.status || 'Error'} - ${error.response?.data?.error || error.message}`);
            }
        }
        console.log();

        // 9. Test API key generation (will likely fail without Redis)
        console.log('9. Testing API key generation...');
        try {
            const newKey = await axios.post(`${BASE_URL}/api-keys`, {
                name: 'Test Key',
                tier: 'free',
                userId: 'test-user'
            });
            console.log('✅ API key generated successfully!');
            console.log('   Key ID:', newKey.data.metadata.id);
            console.log('   Tier:', newKey.data.metadata.tier);
            console.log('   Key preview:', newKey.data.apiKey.substring(0, 20) + '...');
        } catch (error) {
            console.log('❌ API key generation failed:', error.response?.status || error.message);
            if (error.response?.data) {
                console.log('   Error details:', error.response.data.error || error.response.data.message);
            }
        }
        console.log();

        // 10. Summary and next steps
        console.log('📋 Test Summary:');
        console.log('==================');
        if (health.data.redis) {
            console.log('✅ Redis connected - Full functionality available');
            console.log('   • Rate limiting with persistence');
            console.log('   • API key management');
            console.log('   • Usage tracking and quotas');
            console.log('   • Advanced statistics');
        } else {
            console.log('⚠️  Redis not connected - Limited functionality');
            console.log('   • Server is running and responsive');
            console.log('   • API endpoints are accessible');
            console.log('   • Rate limiting will use fallback mode');
            console.log('   • API key features require Redis');
            console.log();
            console.log('🚀 To enable full functionality:');
            console.log('   1. Install Redis: https://redis.io/download');
            console.log('   2. Start Redis server: redis-server');
            console.log('   3. Or use Docker: docker run -d -p 6379:6379 redis:alpine');
            console.log('   4. Restart the API Rate Limiter server');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('🔧 Server not running. Start it with: npm run dev');
        }
    }
}

// Run the tests
testBasicFunctionality();
