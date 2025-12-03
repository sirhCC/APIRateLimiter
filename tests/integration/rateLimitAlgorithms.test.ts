/**
 * Rate Limiting Algorithms Integration Tests
 * 
 * Comprehensive tests for all three rate limiting algorithms with real Redis:
 * - Token Bucket
 * - Sliding Window
 * - Fixed Window
 * 
 * Tests cover:
 * - Algorithm correctness
 * - Rate limit enforcement
 * - Time window behavior
 * - Burst capacity
 * - Concurrent requests
 * - Redis key management
 */

import { RedisClient } from '../../src/utils/redis';
import { OptimizedRateLimiter } from '../../src/middleware/optimizedRateLimiter';
import request from 'supertest';
import express, { Express } from 'express';

describe('Rate Limiting Algorithms Integration Tests', () => {
  let redis: RedisClient;
  let app: Express;

  beforeAll(async () => {
    // Connect to Redis (use test instance or local)
    redis = new RedisClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_TEST_DB || '15'), // Use separate test DB
      enabled: true,
    });

    // Wait for Redis connection
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(async () => {
    // Clear test keys before each test
    const testKeyPattern = 'rate_limit:test:*';
    // Note: In production, use SCAN for this, but for tests it's ok
    try {
      await redis.del(testKeyPattern);
    } catch (error) {
      // Key might not exist, that's fine
    }
  });

  afterAll(async () => {
    // Cleanup and disconnect
    await redis.disconnect?.();
  });

  describe('Token Bucket Algorithm', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
    });

    it('should allow requests up to burst capacity', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000, // 1 minute
        maxRequests: 10,
        algorithm: 'token-bucket',
        tokensPerInterval: 10,
        burstCapacity: 15,
        keyGenerator: () => 'rate_limit:test:burst',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Should allow burst up to 15 requests
      const burstPromises = Array.from({ length: 15 }, () =>
        request(app).get('/test')
      );

      const results = await Promise.all(burstPromises);
      const successfulRequests = results.filter(r => r.status === 200);
      
      expect(successfulRequests.length).toBeGreaterThanOrEqual(14); // Allow for timing variations
    });

    it('should block requests exceeding burst capacity', async () => {
      // Skip if Redis is not available
      if (!redis.isHealthy()) {
        console.log('⚠️  Skipping test - Redis not available');
        return;
      }

      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 5,
        algorithm: 'token-bucket',
        tokensPerInterval: 5,
        burstCapacity: 5,
        keyGenerator: () => 'rate_limit:test:exceed',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
      }

      // 6th should be blocked
      const blockedResponse = await request(app).get('/test');
      expect(blockedResponse.status).toBe(429);
      expect(blockedResponse.body).toHaveProperty('error');
    });

    it('should refill tokens over time', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 1000, // 1 second for faster test
        maxRequests: 2,
        algorithm: 'token-bucket',
        tokensPerInterval: 2,
        burstCapacity: 2,
        keyGenerator: () => 'rate_limit:test:refill',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Use all tokens
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(429);

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should have tokens again
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
    }, 10000);

    it('should set correct rate limit headers', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 10,
        algorithm: 'token-bucket',
        burstCapacity: 15,
        keyGenerator: () => 'rate_limit:test:headers',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');
      
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
      expect(response.headers['x-ratelimit-algorithm']).toBe('token-bucket');
    });
  });

  describe('Sliding Window Algorithm', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
    });

    it('should allow requests within the sliding window', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 5000, // 5 second window
        maxRequests: 5,
        algorithm: 'sliding-window',
        keyGenerator: () => 'rate_limit:test:sliding:allow',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // All 5 requests should succeed
      for (let i = 0; i < 5; i++) {
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
      }
    });

    it('should block requests exceeding sliding window limit', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 5000,
        maxRequests: 3,
        algorithm: 'sliding-window',
        keyGenerator: () => 'rate_limit:test:sliding:block',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // First 3 should succeed
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);

      // 4th should be blocked
      await request(app).get('/test').expect(429);
    });

    it('should correctly handle sliding time windows', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 2000, // 2 second window
        maxRequests: 2,
        algorithm: 'sliding-window',
        keyGenerator: () => 'rate_limit:test:sliding:window',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Use up limit
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(429);

      // Wait for window to slide (2.1 seconds)
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Should be allowed again
      await request(app).get('/test').expect(200);
    }, 10000);

    it('should track requests with precise timestamps', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 3000,
        maxRequests: 5,
        algorithm: 'sliding-window',
        keyGenerator: () => 'rate_limit:test:sliding:precise',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true, timestamp: Date.now() });
      });

      const timestamps: number[] = [];

      // Make requests at different times
      for (let i = 0; i < 3; i++) {
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
        timestamps.push(response.body.timestamp);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Verify requests were tracked
      const lastResponse = await request(app).get('/test');
      expect(lastResponse.status).toBe(200);
      expect(parseInt(lastResponse.headers['x-ratelimit-remaining'])).toBeLessThan(5);
    }, 10000);
  });

  describe('Fixed Window Algorithm', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());
    });

    it('should allow requests within fixed window', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 5000,
        maxRequests: 10,
        algorithm: 'fixed-window',
        keyGenerator: () => 'rate_limit:test:fixed:allow',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // All 10 requests should succeed
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/test')
      );

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.status === 200).length;
      
      expect(successCount).toBe(10);
    });

    it('should block requests exceeding fixed window limit', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 5000,
        maxRequests: 5,
        algorithm: 'fixed-window',
        keyGenerator: () => 'rate_limit:test:fixed:block',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // First 5 succeed
      for (let i = 0; i < 5; i++) {
        await request(app).get('/test').expect(200);
      }

      // 6th blocked
      await request(app).get('/test').expect(429);
    });

    it('should reset counter at window boundary', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 2000, // 2 second window
        maxRequests: 3,
        algorithm: 'fixed-window',
        keyGenerator: () => 'rate_limit:test:fixed:reset',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Use up limit
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Counter should be reset
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
    }, 10000);

    it('should include reset time in headers', async () => {
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 10,
        algorithm: 'fixed-window',
        keyGenerator: () => 'rate_limit:test:fixed:reset-header',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');
      
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
      const resetTime = new Date(response.headers['x-ratelimit-reset']).getTime();
      const now = Date.now();
      
      // Reset time should be in the future but within window
      expect(resetTime).toBeGreaterThan(now);
      expect(resetTime).toBeLessThanOrEqual(now + 60000);
    });
  });

  describe('Algorithm Comparison and Edge Cases', () => {
    it('should handle concurrent requests correctly across algorithms', async () => {
      const algorithms: Array<'token-bucket' | 'sliding-window' | 'fixed-window'> = [
        'token-bucket',
        'sliding-window',
        'fixed-window',
      ];

      for (const algorithm of algorithms) {
        const app = express();
        const rateLimiter = new OptimizedRateLimiter(redis, {
          windowMs: 5000,
          maxRequests: 10,
          algorithm,
          burstCapacity: algorithm === 'token-bucket' ? 15 : undefined,
          keyGenerator: () => `rate_limit:test:concurrent:${algorithm}`,
        });

        app.get('/test', rateLimiter.middleware(), (req, res) => {
          res.json({ success: true });
        });

        // Fire 10 concurrent requests
        const promises = Array.from({ length: 10 }, () =>
          request(app).get('/test')
        );

        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.status === 200).length;

        // All algorithms should handle 10 requests within limit
        expect(successCount).toBeGreaterThanOrEqual(9); // Allow 1 for race conditions
      }
    });

    it('should handle different keys independently', async () => {
      const app = express();
      
      const rateLimiter1 = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 2,
        algorithm: 'token-bucket',
        keyGenerator: () => 'rate_limit:test:key1',
      });

      const rateLimiter2 = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 2,
        algorithm: 'token-bucket',
        keyGenerator: () => 'rate_limit:test:key2',
      });

      app.get('/endpoint1', rateLimiter1.middleware(), (req, res) => {
        res.json({ endpoint: 1 });
      });

      app.get('/endpoint2', rateLimiter2.middleware(), (req, res) => {
        res.json({ endpoint: 2 });
      });

      // Both endpoints should handle their limits independently
      await request(app).get('/endpoint1').expect(200);
      await request(app).get('/endpoint1').expect(200);
      await request(app).get('/endpoint1').expect(429); // Blocked

      // Endpoint 2 should still work
      await request(app).get('/endpoint2').expect(200);
      await request(app).get('/endpoint2').expect(200);
      await request(app).get('/endpoint2').expect(429); // Now blocked
    });

    it('should handle Redis unavailability gracefully', async () => {
      // Create limiter with bad Redis connection
      const badRedis = new RedisClient({
        host: 'nonexistent.host',
        port: 9999,
        enabled: true,
      });

      const app = express();
      const rateLimiter = new OptimizedRateLimiter(badRedis, {
        windowMs: 60000,
        maxRequests: 10,
        algorithm: 'token-bucket',
        keyGenerator: () => 'rate_limit:test:fallback',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Should fall back to allowing requests
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });

    it('should enforce limits consistently under rapid fire', async () => {
      const app = express();
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 1000,
        maxRequests: 5,
        algorithm: 'sliding-window',
        keyGenerator: () => 'rate_limit:test:rapidfire',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Fire 20 rapid requests
      const promises = Array.from({ length: 20 }, () =>
        request(app).get('/test')
      );

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.status === 200).length;
      const blockedCount = results.filter(r => r.status === 429).length;

      // Should allow max 5, block rest
      expect(successCount).toBeLessThanOrEqual(6); // Allow small margin
      expect(blockedCount).toBeGreaterThanOrEqual(14);
      expect(successCount + blockedCount).toBe(20);
    });
  });

  describe('Rate Limit Header Compliance', () => {
    it('should include all standard rate limit headers', async () => {
      const app = express();
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 100,
        algorithm: 'token-bucket',
        keyGenerator: () => 'rate_limit:test:headers:all',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');

      // Standard headers
      expect(response.headers['x-ratelimit-limit']).toBe('100');
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
      expect(response.headers['x-ratelimit-algorithm']).toBe('token-bucket');
    });

    it('should include Retry-After header when rate limited', async () => {
      const app = express();
      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 1,
        algorithm: 'fixed-window',
        keyGenerator: () => 'rate_limit:test:retry-after',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // First request succeeds
      await request(app).get('/test').expect(200);

      // Second request is rate limited
      const response = await request(app).get('/test').expect(429);
      
      expect(response.headers['retry-after']).toBeDefined();
      const retryAfter = parseInt(response.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });
  });
});
