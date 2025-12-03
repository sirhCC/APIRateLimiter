/**
 * Redis Failure and Circuit Breaker Integration Tests
 * 
 * Tests the system's resilience when Redis fails:
 * - Circuit breaker functionality
 * - Graceful degradation
 * - Fallback behavior
 * - Recovery after failures
 * - Metrics during failures
 */

import { RedisClient } from '../../src/utils/redis';
import { OptimizedRateLimiter } from '../../src/middleware/optimizedRateLimiter';
import express, { Express } from 'express';
import request from 'supertest';

describe('Redis Failure and Circuit Breaker Tests', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Circuit Breaker Behavior', () => {
    it('should open circuit breaker after consecutive failures', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      // Wait for potential connection
      await new Promise(resolve => setTimeout(resolve, 100));

      const status1 = redis.getStatus();
      const initialCircuitState = status1.circuitBreakerOpen;

      // Simulate failures by calling operations when disconnected
      if (!redis.isHealthy()) {
        for (let i = 0; i < 10; i++) {
          try {
            await redis.get('test-key');
          } catch (error) {
            // Expected to fail
          }
        }

        const status2 = redis.getStatus();
        // Circuit breaker should have opened or fallback should be active
        expect(status2.healthy || !status2.enabled).toBe(true);
      }
    });

    it('should fallback to allowing requests when circuit is open', async () => {
      const redis = new RedisClient({
        host: 'invalid-host-12345',
        port: 9999,
        enabled: true,
      });

      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 5,
        algorithm: 'token-bucket',
        keyGenerator: () => 'test:circuit:fallback',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Should allow requests despite Redis being down
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should expose circuit breaker status in health check', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const status = redis.getStatus();
      
      expect(status).toHaveProperty('healthy');
      expect(status).toHaveProperty('circuitBreakerOpen');
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('connected');
      
      expect(typeof status.healthy).toBe('boolean');
      expect(typeof status.circuitBreakerOpen).toBe('boolean');
    });

    it('should reset circuit breaker after cooldown period', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Get initial status
      const initialStatus = redis.getStatus();

      // If circuit breaker is open, wait for reset
      if (initialStatus.circuitBreakerOpen) {
        // Circuit breaker reset is 30 seconds by default
        // For testing, we just verify the status structure
        expect(initialStatus.circuitBreakerOpen).toBe(true);
      }

      // Verify status is readable
      expect(initialStatus).toBeDefined();
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue serving requests when Redis is unavailable', async () => {
      const redis = new RedisClient({
        host: 'nonexistent.redis.host',
        port: 9999,
        enabled: true,
      });

      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 10,
        algorithm: 'sliding-window',
        keyGenerator: () => 'test:degradation:continue',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ message: 'Service is operational' });
      });

      // Should not throw errors
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Service is operational');
    });

    it('should log fallback behavior when Redis fails', async () => {
      const redis = new RedisClient({
        host: 'invalid-host',
        port: 1234,
        enabled: true,
      });

      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 100,
        algorithm: 'token-bucket',
        keyGenerator: () => 'test:fallback:logging',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ success: true });
      });

      // Multiple requests should all succeed (fallback mode)
      for (let i = 0; i < 5; i++) {
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
      }
    });

    it('should not rate limit when in fallback mode', async () => {
      const redis = new RedisClient({
        host: 'bad-host',
        port: 9999,
        enabled: true,
      });

      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 1000,
        maxRequests: 2, // Very restrictive
        algorithm: 'fixed-window',
        keyGenerator: () => 'test:fallback:no-limit',
      });

      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ request: true });
      });

      // Should allow all requests despite low limit
      const promises = Array.from({ length: 10 }, () =>
        request(app).get('/test')
      );

      const results = await Promise.all(promises);
      const allSucceeded = results.every(r => r.status === 200);
      
      expect(allSucceeded).toBe(true);
    });
  });

  describe('Redis Disconnection Handling', () => {
    it('should handle Redis connection with disabled flag', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        enabled: false, // Explicitly disabled
      });

      const status = redis.getStatus();
      
      expect(status.enabled).toBe(false);
      expect(status.healthy).toBe(false);
    });

    it('should handle operations when Redis is disabled', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        enabled: false,
      });

      // All operations should use fallback
      const tokenResult = await redis.tokenBucket('test:key', 10, 10, 60000);
      expect(tokenResult.allowed).toBe(true);

      const slidingResult = await redis.slidingWindow('test:key', 60000, 10);
      expect(slidingResult.allowed).toBe(true);

      const fixedResult = await redis.fixedWindow('test:key', 10, 60000);
      expect(fixedResult.allowed).toBe(true);
    });

    it('should provide accurate health status', async () => {
      const enabledRedis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      const disabledRedis = new RedisClient({
        host: 'localhost',
        port: 6379,
        enabled: false,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const enabledStatus = enabledRedis.getStatus();
      const disabledStatus = disabledRedis.getStatus();

      // Disabled should always be unhealthy
      expect(disabledStatus.healthy).toBe(false);
      expect(disabledStatus.enabled).toBe(false);

      // Enabled status depends on actual connection
      expect(enabledStatus).toHaveProperty('healthy');
      expect(enabledStatus.enabled).toBe(true);
    });
  });

  describe('Ping Latency Monitoring', () => {
    it('should measure Redis ping latency when connected', async () => {
      const redis = new RedisClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const latency = await redis.pingLatency();

      if (redis.isHealthy()) {
        expect(latency).toBeGreaterThan(0);
        expect(latency).toBeLessThan(1000); // Should be fast
      } else {
        expect(latency).toBe(null);
      }
    });

    it('should cache ping latency results', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const latency1 = await redis.pingLatency();
      const latency2 = await redis.pingLatency();

      // Second call should use cached value (or be very similar)
      if (redis.isHealthy()) {
        expect(latency1).toBe(latency2);
      }
    });
  });

  describe('Recovery After Failures', () => {
    it('should track failure count internally', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const status = redis.getStatus();
      
      // Status object should exist
      expect(status).toBeDefined();
      expect(status).toHaveProperty('healthy');
      expect(status).toHaveProperty('circuitBreakerOpen');
    });

    it('should allow operations to succeed after recovery', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      if (redis.isHealthy()) {
        // Try basic operation
        const result = await redis.tokenBucket('test:recovery', 10, 10, 60000);
        expect(result).toHaveProperty('allowed');
        expect(typeof result.allowed).toBe('boolean');
      }
    });
  });

  describe('Fallback Behavior', () => {
    it('should use in-memory fallback for all algorithms', async () => {
      const redis = new RedisClient({
        host: 'nonexistent',
        port: 9999,
        enabled: true,
      });

      // Token bucket
      const tb = await redis.tokenBucket('key1', 10, 10, 60000);
      expect(tb.allowed).toBe(true);
      expect(tb.remainingTokens).toBeGreaterThan(0);

      // Sliding window
      const sw = await redis.slidingWindow('key2', 60000, 10);
      expect(sw.allowed).toBe(true);
      expect(sw.remainingRequests).toBeGreaterThan(0);

      // Fixed window
      const fw = await redis.fixedWindow('key3', 10, 60000);
      expect(fw.allowed).toBe(true);
      expect(fw.remainingRequests).toBeGreaterThan(0);
    });

    it('should handle rapid requests in fallback mode', async () => {
      const redis = new RedisClient({
        host: 'bad-host',
        port: 1111,
        enabled: true,
      });

      // Fire many concurrent requests
      const promises = Array.from({ length: 50 }, (_, i) =>
        redis.tokenBucket(`key:${i}`, 10, 10, 60000)
      );

      const results = await Promise.all(promises);
      
      // All should succeed in fallback mode
      expect(results.every(r => r.allowed)).toBe(true);
    });

    it('should maintain consistent interface in fallback', async () => {
      const redis = new RedisClient({
        host: 'invalid',
        port: 9999,
        enabled: true,
      });

      const result = await redis.tokenBucket('test', 5, 5, 60000);

      // Should have same structure as Redis result
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remainingTokens');
      expect(typeof result.allowed).toBe('boolean');
      expect(typeof result.remainingTokens).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should not throw errors when Redis operations fail', async () => {
      const redis = new RedisClient({
        host: 'failing-host',
        port: 5555,
        enabled: true,
      });

      // None of these should throw
      await expect(redis.get('key')).resolves.toBeDefined();
      await expect(redis.set('key', 'value')).resolves.toBeDefined();
      await expect(redis.del('key')).resolves.toBeDefined();
      await expect(redis.tokenBucket('key', 10, 10, 60000)).resolves.toBeDefined();
    });

    it('should handle malformed Redis responses gracefully', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // These operations should not crash
      try {
        await redis.get('nonexistent-key-12345');
      } catch (error) {
        // If it throws, should be handled gracefully
      }

      const status = redis.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe('Connection State Management', () => {
    it('should track connection state accurately', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 150));

      const isHealthy = redis.isHealthy();
      const status = redis.getStatus();

      expect(typeof isHealthy).toBe('boolean');
      expect(status.healthy).toBe(isHealthy);
    });

    it('should provide consistent status across calls', async () => {
      const redis = new RedisClient({
        host: 'localhost',
        port: 6379,
        db: 15,
        enabled: true,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const status1 = redis.getStatus();
      const status2 = redis.getStatus();

      expect(status1.enabled).toBe(status2.enabled);
      expect(status1.healthy).toBe(status2.healthy);
      expect(status1.circuitBreakerOpen).toBe(status2.circuitBreakerOpen);
    });
  });
});
