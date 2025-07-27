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
        const health = await axios.get(`${BASE_URL}/health`);
        console.log(`✅ Health check: ${health.data.status}\n`);

        // 2. Get available tiers
        console.log('2. Getting available tiers...');
        const tiers = await axios.get(`${BASE_URL}/api-keys/tiers`);
        console.log('✅ Available tiers:', Object.keys(tiers.data.tiers));
        console.log('   Free tier limits:', tiers.data.tiers.free.rateLimit);
        console.log('   Premium tier limits:', tiers.data.tiers.premium.rateLimit);
        console.log('   Enterprise tier limits:', tiers.data.tiers.enterprise.rateLimit);
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
        const testResponse = await axios.get(`${BASE_URL}/test`, {
            headers: {
                'X-API-Key': apiKey
            }
        });
        console.log('✅ API key authentication successful');
        console.log('   Tier header:', testResponse.headers['x-api-key-tier']);
        console.log('   Quota limit:', testResponse.headers['x-quota-limit']);
        console.log('   Quota used:', testResponse.headers['x-quota-used']);
        console.log();

        // 5. Test rate limiting with API key (make multiple requests)
        console.log('5. Testing rate limiting with API key...');
        let successCount = 0;
        let rateLimitedCount = 0;

        for (let i = 0; i < 5; i++) {
            try {
                await axios.get(`${BASE_URL}/demo/strict`, {
                    headers: {
                        'X-API-Key': apiKey
                    }
                });
                successCount++;
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    rateLimitedCount++;
                }
            }
        }
        console.log(`✅ Made 5 requests: ${successCount} successful, ${rateLimitedCount} rate limited`);
        console.log();

        // 6. Get API key usage
        console.log('6. Checking API key usage...');
        const usage = await axios.get(`${BASE_URL}/api-keys/${keyId}/usage`);
        console.log('✅ Usage information retrieved');
        console.log('   Current month requests:', usage.data.usage.currentMonthRequests);
        console.log('   Total requests:', usage.data.usage.totalRequests);
        console.log('   Within quota:', usage.data.withinQuota);
        console.log();

        // 7. List user's keys
        console.log('7. Listing user keys...');
        const userKeys = await axios.get(`${BASE_URL}/api-keys?userId=test-user-123`);
        console.log('✅ User keys retrieved');
        console.log('   Number of keys:', userKeys.data.keys.length);
        console.log('   Key names:', userKeys.data.keys.map(k => k.name));
        console.log();

        // 8. Get API key details
        console.log('8. Getting API key details...');
        const keyDetails = await axios.get(`${BASE_URL}/api-keys/${keyId}`);
        console.log('✅ Key details retrieved');
        console.log('   Name:', keyDetails.data.metadata.name);
        console.log('   Status:', keyDetails.data.metadata.isActive ? 'Active' : 'Revoked');
        console.log('   Created:', new Date(keyDetails.data.metadata.created).toLocaleString());
        console.log();

        // 9. Test without API key (should use IP-based rate limiting)
        console.log('9. Testing without API key...');
        const noKeyResponse = await axios.get(`${BASE_URL}/test`);
        console.log('✅ Request without API key successful (using IP-based rate limiting)');
        console.log('   Rate limit algorithm:', noKeyResponse.headers['x-ratelimit-algorithm']);
        console.log();

        // 10. Revoke the API key
        console.log('10. Revoking API key...');
        await axios.delete(`${BASE_URL}/api-keys/${keyId}`);
        console.log('✅ API key revoked successfully');

        // 11. Try to use revoked key
        console.log('11. Testing revoked API key...');
        try {
            await axios.get(`${BASE_URL}/test`, {
                headers: {
                    'X-API-Key': apiKey
                }
            });
            console.log('❌ ERROR: Revoked key should not work!');
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('✅ Revoked key correctly rejected');
            } else {
                console.log('❌ Unexpected error:', error.message);
            }
        }

        console.log('\n🎉 All API key management tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

// Run the tests
testApiKeyManagement();
