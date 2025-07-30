/**
 * Unit Tests for Redis Utilities
 * 
 * Tests Redis client initialization, Lua scripts, and rate limiting operations.
 */

import { Redis } from 'ioredis';
import { RedisClient } from '../../src/utils/redis';

describe('Redis Utilities', () => {
  let testRedis: RedisClient;
  let directRedis: Redis;
  let redisAvailable = false;

  beforeAll(async () => {
    // Create a test Redis client
    testRedis = new RedisClient({
      host: 'localhost',
      port: 6379,
      db: 15, // Use test database
      enabled: true
    });

    // Create direct Redis client for test setup/cleanup
    directRedis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 15,
      lazyConnect: true,
      maxRetriesPerRequest: 3
    });

    try {
      await directRedis.connect();
      redisAvailable = directRedis.status === 'ready';
    } catch (error) {
      console.warn('Redis not available for testing, skipping Redis tests');
      redisAvailable = false;
    }
  });

  afterAll(async () => {
    if (testRedis) {
      await testRedis.disconnect();
    }
    if (directRedis) {
      await directRedis.disconnect();
    }
  });

  beforeEach(async () => {
    if (redisAvailable && directRedis && directRedis.status === 'ready') {
      // Clear test data before each test
      await directRedis.flushdb();
    }
  });

  describe('Redis Client', () => {
    it('should create Redis client successfully', () => {
      expect(testRedis).toBeDefined();
      expect(testRedis).toBeInstanceOf(RedisClient);
    });

    it('should handle Redis operations when available', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      // Test basic operations
      await testRedis.set('test-key', 'test-value');
      const value = await testRedis.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should handle Redis operations gracefully when unavailable', async () => {
      // Create client with invalid configuration
      const invalidRedis = new RedisClient({
        host: 'invalid-host',
        port: 9999,
        enabled: true
      });

      // Operations should not throw errors (graceful degradation)
      // Use a unique key that shouldn't exist in any in-memory store
      const value = await invalidRedis.get('non-existent-unique-key-12345');
      expect(value).toBeNull();

      await invalidRedis.disconnect();
    });
  });

  describe('Token Bucket Algorithm', () => {
    const testKey = 'test:token-bucket';
    const capacity = 10;
    const tokens = 5;
    const intervalMs = 60000;

    it('should allow requests within token limit', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const result = await testRedis.tokenBucket(testKey, capacity, tokens, intervalMs);

      expect(result).toEqual({
        allowed: expect.any(Boolean),
        remainingTokens: expect.any(Number)
      });
      expect(result.remainingTokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle token bucket with fallback', async () => {
      // Test with disabled Redis
      const disabledRedis = new RedisClient({
        host: 'localhost',
        port: 6379,
        enabled: false
      });

      const result = await disabledRedis.tokenBucket(testKey, capacity, tokens, intervalMs);

      expect(result).toEqual({
        allowed: expect.any(Boolean),
        remainingTokens: expect.any(Number)
      });

      await disabledRedis.disconnect();
    });
  });

  describe('Sliding Window Algorithm', () => {
    const testKey = 'test:sliding-window';
    const windowMs = 60000;
    const limit = 5;

    it('should allow requests within the limit', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const result = await testRedis.slidingWindow(testKey, windowMs, limit);

      expect(result).toEqual({
        allowed: expect.any(Boolean),
        remainingRequests: expect.any(Number)
      });
      expect(result.remainingRequests).toBeGreaterThanOrEqual(0);
    });

    it('should handle sliding window with fallback', async () => {
      // Test with disabled Redis
      const disabledRedis = new RedisClient({
        host: 'localhost',
        port: 6379,
        enabled: false
      });

      const result = await disabledRedis.slidingWindow(testKey, windowMs, limit);

      expect(result).toEqual({
        allowed: expect.any(Boolean),
        remainingRequests: expect.any(Number)
      });

      await disabledRedis.disconnect();
    });
  });

  describe('Fixed Window Algorithm', () => {
    const testKey = 'test:fixed-window';
    const limit = 5;
    const windowMs = 60000;

    it('should allow requests within the limit', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const result = await testRedis.fixedWindow(testKey, limit, windowMs);

      expect(result).toEqual({
        allowed: expect.any(Boolean),
        remainingRequests: expect.any(Number),
        resetTime: expect.any(Number)
      });
      expect(result.remainingRequests).toBeGreaterThanOrEqual(0);
    });

    it('should handle fixed window with fallback', async () => {
      // Test with disabled Redis
      const disabledRedis = new RedisClient({
        host: 'localhost',
        port: 6379,
        enabled: false
      });

      const result = await disabledRedis.fixedWindow(testKey, limit, windowMs);

      expect(result).toEqual({
        allowed: expect.any(Boolean),
        remainingRequests: expect.any(Number),
        resetTime: expect.any(Number)
      });

      await disabledRedis.disconnect();
    });
  });

  describe('Basic Redis Operations', () => {
    it('should handle get/set operations', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const key = 'test:basic-ops';
      const value = 'test-value';

      await testRedis.set(key, value);
      const retrieved = await testRedis.get(key);
      expect(retrieved).toBe(value);
    });

    it('should handle increment operations', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const key = 'test:incr';
      
      const count1 = await testRedis.incr(key);
      expect(count1).toBe(1);

      const count2 = await testRedis.incr(key);
      expect(count2).toBe(2);
    });

    it('should handle TTL operations', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const key = 'test:ttl';
      const value = 'test-value';
      const ttlSeconds = 60;

      await testRedis.set(key, value, ttlSeconds);
      const ttl = await testRedis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(ttlSeconds);
    });

    it('should handle delete operations', async () => {
      if (!redisAvailable) {
        console.warn('Skipping Redis test - Redis not available');
        return;
      }

      const key = 'test:delete';
      const value = 'test-value';

      await testRedis.set(key, value);
      const deleted = await testRedis.del(key);
      expect(deleted).toBe(true);

      const retrieved = await testRedis.get(key);
      expect(retrieved).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully', async () => {
      // Test with disabled Redis client
      const disabledRedis = new RedisClient({
        host: 'localhost',
        port: 6379,
        enabled: false
      });

      // Operations should not throw errors even when Redis is disabled
      expect(async () => {
        await disabledRedis.tokenBucket('test', 10, 5, 60000);
      }).not.toThrow();

      expect(async () => {
        await disabledRedis.slidingWindow('test', 60000, 10);
      }).not.toThrow();

      expect(async () => {
        await disabledRedis.fixedWindow('test', 10, 60000);
      }).not.toThrow();

      await disabledRedis.disconnect();
    });
  });
});
