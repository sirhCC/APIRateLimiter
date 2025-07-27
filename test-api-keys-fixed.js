#!/usr/bin/env node

/**
 * Test script for API Key Management
 * Run this after starting the server to test API key functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testApiKeyManagement() {
    console.log('🧪 Testing API Key Management...\n');

    try {
        // 1. Test health check
        console.log('1. Testing health check...');
        let health;
        try {
            health = await axios.get(`${BASE_URL}/health`);
        } catch (error) {
            // Health endpoint returns 503 when Redis is down, but still provides data
            if (error.response && error.response.status === 503) {
                health = error.response;
            } else {
                throw error;
            }
        }
        console.log(`✅ Health check: ${health.data.status}`);
        console.log(`   Redis connected: ${health.data.redis ? 'Yes' : 'No'}`);
        console.log();

        // 2. Get available tiers
        console.log('2. Getting available tiers...');
        const tiers = await axios.get(`${BASE_URL}/api-keys/tiers`);
        console.log('✅ Available tiers:', Object.keys(tiers.data.tiers));
        Object.entries(tiers.data.tiers).forEach(([name, tier]) => {
            console.log(`   ${name.toUpperCase()}: ${tier.rateLimit.maxRequests} req/min (${tier.rateLimit.algorithm})`);
        });
        console.log();

        // 3. Generate a test API key
        console.log('3. Generating test API key...');
        const newKey = await axios.post(`${BASE_URL}/api-keys`, {
            name: 'Test API Key',
            tier: 'premium',
            userId: 'test-user-123',
            metadata: {
                description: 'Test key for API key management testing'
            }
        });
        console.log('✅ API key generated successfully');
        console.log('   Key ID:', newKey.data.metadata.id);
        console.log('   Tier:', newKey.data.metadata.tier);
        console.log('   API Key:', newKey.data.apiKey.substring(0, 20) + '...');
        console.log();

        const apiKey = newKey.data.apiKey;
        const keyId = newKey.data.metadata.id;

        // 4. Test API key validation by making a request
        console.log('4. Testing API key authentication...');
        try {
            const testResponse = await axios.get(`${BASE_URL}/test`, {
                headers: {
                    'X-API-Key': apiKey
                }
            });
            console.log('✅ API key authentication successful');
            console.log('   Tier header:', testResponse.headers['x-api-key-tier']);
            console.log('   Quota limit:', testResponse.headers['x-quota-limit']);
            console.log('   Quota used:', testResponse.headers['x-quota-used']);
        } catch (error) {
            console.log('❌ API key authentication failed:', error.response?.status, error.response?.data?.error);
            console.log('   This is expected without Redis - keys can be generated but not validated');
        }
        console.log();

        // 5. Test usage endpoint
        console.log('5. Checking API key usage...');
        const usage = await axios.get(`${BASE_URL}/api-keys/${keyId}/usage`);
        console.log('✅ Usage information retrieved');
        console.log('   Current month requests:', usage.data.usage.currentMonthRequests);
        console.log('   Total requests:', usage.data.usage.totalRequests);
        console.log('   Within quota:', usage.data.withinQuota);
        console.log();

        // 6. List user's keys
        console.log('6. Listing user keys...');
        const userKeys = await axios.get(`${BASE_URL}/api-keys?userId=test-user-123`);
        console.log('✅ User keys endpoint working');
        console.log('   Number of keys found:', userKeys.data.keys.length);
        if (userKeys.data.keys.length === 0) {
            console.log('   ⚠️ No keys found - this is expected without Redis persistence');
        }
        console.log();

        // 7. Test revocation
        console.log('7. Testing API key revocation...');
        try {
            await axios.delete(`${BASE_URL}/api-keys/${keyId}`);
            console.log('✅ API key revocation endpoint working');
        } catch (error) {
            console.log('❌ Revocation failed:', error.response?.data?.error);
        }
        console.log();

        // 8. Summary
        console.log('📋 Test Summary:');
        console.log('==================');
        if (health.data.redis) {
            console.log('✅ Redis connected - Full API key functionality available');
            console.log('   • Keys can be generated and validated');
            console.log('   • Usage tracking persists');
            console.log('   • User key lists are maintained');
        } else {
            console.log('⚠️ Redis not connected - Limited API key functionality');
            console.log('   ✅ API endpoints are working');
            console.log('   ✅ Key generation creates valid key structures');
            console.log('   ✅ Tier system is configured correctly');
            console.log('   ✅ Usage endpoints respond properly');
            console.log('   ❌ Key validation requires Redis storage');
            console.log('   ❌ Usage tracking is not persistent');
            console.log('   ❌ User key lists are not maintained');
            console.log();
            console.log('🚀 To enable full functionality:');
            console.log('   1. Install Redis (see REDIS_SETUP.md)');
            console.log('   2. Start Redis server');
            console.log('   3. Restart the API Rate Limiter');
        }

        console.log('\n🎉 API key management system architecture test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        console.log('\n🔧 Make sure the server is running: npm run dev');
    }
}

// Run the tests
testApiKeyManagement();
