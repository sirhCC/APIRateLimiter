#!/usr/bin/env node

/**
 * Test JWT Role-based Rate Limiting
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testJWTRateLimiting() {
    console.log('⚡ Testing JWT Role-based Rate Limiting...\n');

    try {
        // Get tokens for different roles
        const users = [
            { email: 'admin@example.com', role: 'admin' },
            { email: 'user@example.com', role: 'user' },
            { email: 'guest@example.com', role: 'guest' },
        ];

        const tokens = {};

        // Login all users
        for (const user of users) {
            console.log(`🔑 Logging in ${user.role}...`);
            const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
                email: user.email,
                password: 'demo123',
            });
            tokens[user.role] = loginResponse.data.token;
            console.log(`   ✅ ${user.role} logged in`);
        }
        console.log();

        // Test rate limiting for each role
        for (const [role, token] of Object.entries(tokens)) {
            console.log(`🚀 Testing rate limits for ${role}...`);
            
            let successCount = 0;
            let rateLimitedCount = 0;

            // Make 15 requests to test rate limiting
            for (let i = 0; i < 15; i++) {
                try {
                    await axios.get(`${BASE_URL}/test`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    successCount++;
                } catch (error) {
                    if (error.response && error.response.status === 429) {
                        rateLimitedCount++;
                    } else {
                        console.log(`   Unexpected error: ${error.response?.status}`);
                    }
                }
            }

            console.log(`   ${role.toUpperCase()}: ${successCount} successful, ${rateLimitedCount} rate limited (out of 15)`);
            
            // Show expected vs actual
            const expected = {
                admin: 'Very high limits (should allow most/all requests)',
                user: 'Normal limits (some rate limiting expected)',
                guest: 'Lower limits (more rate limiting expected)'
            };
            console.log(`   Expected: ${expected[role]}`);
        }

        console.log('\n📋 Rate Limiting Summary:');
        console.log('   • Admin users should have very high rate limits');
        console.log('   • Regular users should have moderate rate limits');
        console.log('   • Guest users should have the lowest rate limits');
        console.log('   • Different roles get different rate limiting algorithms');

        console.log('\n🎉 JWT role-based rate limiting test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

testJWTRateLimiting();
