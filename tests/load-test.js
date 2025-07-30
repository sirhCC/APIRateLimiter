/**
 * Load Testing Configuration with k6
 * Priority #5: Testing & Quality Infrastructure
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 100 },  // Ramp up to 100 users  
    { duration: '2m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 200 },  // Peak load
    { duration: '1m', target: 200 },   // Sustain peak
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],    // Error rate under 10%
    errors: ['rate<0.1'],             // Custom error rate under 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  group('Health Check Tests', () => {
    const response = http.get(`${BASE_URL}/health`);
    
    const success = check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 200ms': (r) => r.timings.duration < 200,
      'has status field': (r) => JSON.parse(r.body).status === 'ok',
    });
    
    if (!success) {
      errorRate.add(1);
    }
  });

  group('Stats Endpoint Tests', () => {
    const response = http.get(`${BASE_URL}/stats`);
    
    const success = check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500,
      'has totalRequests field': (r) => 'totalRequests' in JSON.parse(r.body),
    });
    
    if (!success) {
      errorRate.add(1);
    }
  });

  group('Performance Endpoint Tests', () => {
    const response = http.get(`${BASE_URL}/performance`);
    
    const success = check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 1000ms': (r) => r.timings.duration < 1000,
      'has memory usage': (r) => 'memoryUsage' in JSON.parse(r.body),
    });
    
    if (!success) {
      errorRate.add(1);
    }
  });

  group('Rate Limiting Tests', () => {
    // Test normal API endpoints
    const response = http.get(`${BASE_URL}/demo/moderate`);
    
    const success = check(response, {
      'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
      'has rate limit headers': (r) => r.headers['X-RateLimit-Limit'] !== undefined,
      'response time < 300ms': (r) => r.timings.duration < 300,
    });
    
    if (!success) {
      errorRate.add(1);
    }
  });

  group('API Key Tests', () => {
    // Test with API key
    const params = {
      headers: {
        'X-API-Key': 'test-api-key-123',
        'Content-Type': 'application/json',
      },
    };
    
    const response = http.get(`${BASE_URL}/demo/heavy`, params);
    
    const success = check(response, {
      'handles API key': (r) => r.status === 200 || r.status === 401 || r.status === 429,
      'response time < 400ms': (r) => r.timings.duration < 400,
    });
    
    if (!success) {
      errorRate.add(1);
    }
  });

  group('Stress Test - Burst Requests', () => {
    // Simulate burst of requests
    for (let i = 0; i < 5; i++) {
      const response = http.get(`${BASE_URL}/demo/strict`);
      check(response, {
        'handles burst': (r) => r.status === 200 || r.status === 429,
      });
    }
  });

  // Random sleep between 1-3 seconds
  sleep(Math.random() * 2 + 1);
}

// Setup function run once before all VUs
export function setup() {
  console.log('Starting load test against:', BASE_URL);
  
  // Health check before starting
  const response = http.get(`${BASE_URL}/health`);
  if (response.status !== 200) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  
  return { baseUrl: BASE_URL };
}

// Teardown function run once after all VUs
export function teardown(data) {
  console.log('Load test completed against:', data.baseUrl);
}
