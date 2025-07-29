#!/usr/bin/env node

/**
 * Simple JWT Authentication Test
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function simpleJWTTest() {
    console.log('🔐 Simple JWT Authentication Test...\n');

    try {
        // 1. Login as admin
        console.log('1. Login as admin...');
        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'admin@example.com',
            password: 'demo123',
        });

        console.log(`✅ Login successful`);
        console.log(`   Role: ${loginResponse.data.user.role}`);
        console.log(`   Token: ${loginResponse.data.token.substring(0, 30)}...`);
        console.log();

        const token = loginResponse.data.token;

        // 2. Verify token
        console.log('2. Verify token...');
        const verifyResponse = await axios.get(`${BASE_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`✅ Token verified`);
        console.log(`   User: ${verifyResponse.data.user.email}`);
        console.log();

        // 3. Test admin endpoint
        console.log('3. Test admin endpoint...');
        const adminResponse = await axios.get(`${BASE_URL}/admin/users`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(`✅ Admin endpoint access successful`);
        console.log(`   Total users: ${adminResponse.data.data.totalUsers}`);
        console.log();

        // 4. Test without token
        console.log('4. Test endpoint without token...');
        try {
            await axios.get(`${BASE_URL}/admin/users`);
            console.log('❌ ERROR: Should require authentication!');
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('✅ Correctly requires authentication');
            }
        }

        console.log('\n🎉 JWT Authentication working perfectly!');
        console.log('\n📊 Dashboard available at: http://localhost:3000/dashboard');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

simpleJWTTest();
