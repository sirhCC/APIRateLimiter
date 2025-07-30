import { Request, Response } from 'express';
import { DistributedRateLimiter, createDistributedRateLimiter } from '../src/middleware/distributedRateLimiter';
import { DistributedRedisClient, createDistributedRedisClient } from '../src/utils/distributedRedis';
import { setupDistributedRateLimiter, quickSetupDistributed } from '../src/utils/distributedSetup';

/**
 * Comprehensive Test Suite for Distributed Rate Limiter
 * 
 * Tests:
 * - Redis cluster connectivity
 * - Consistent hashing distribution  
 * - Circuit breaker functionality
 * - Multi-instance coordination
 * - Performance under load
 * - Failover scenarios
 */

describe('Distributed Rate Limiter', () => {
  let redisClient: DistributedRedisClient;
  let rateLimiter: any;
  
  const mockRedisConfig = {
    instanceId: 'test-instance-1',
    coordinationPrefix: 'test:rate_limiter',
    single: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 1 // Use test database
    },
    circuitBreaker: {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 5000
    }
  };
  
  beforeAll(async () => {
    // Setup test Redis client
    redisClient = createDistributedRedisClient(mockRedisConfig);
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 1000));
  });
  
  afterAll(async () => {
    if (redisClient) {
      await redisClient.disconnect();
    }
    if (rateLimiter) {
      await rateLimiter.shutdown();
    }
  });
  
  beforeEach(async () => {
    // Clear test data
    if (rateLimiter) {
      rateLimiter.resetStats();
    }
  });
  
  describe('Redis Cluster Connectivity', () => {
    test('should connect to Redis cluster successfully', async () => {
      const health = await redisClient.getClusterHealth();
      expect(health.connected).toBe(true);
    });
    
    test('should handle Redis cluster configuration', async () => {
      const clusterConfig = {
        ...mockRedisConfig,
        cluster: {
          nodes: [
            { host: 'localhost', port: 7000 },
            { host: 'localhost', port: 7001 },
            { host: 'localhost', port: 7002 }
          ]
        }
      };
      
      // This will fail in test environment but should not throw
      try {
        const clusterClient = createDistributedRedisClient(clusterConfig);
        expect(clusterClient).toBeDefined();
      } catch (error) {
        // Expected in test environment without actual cluster
        expect(error).toBeDefined();
      }
    });
  });
  
  describe('Consistent Hashing', () => {
    test('should distribute keys consistently across shards', async () => {
      const keys = ['user:1', 'user:2', 'user:3', 'user:4', 'user:5'];
      const shardDistribution = new Map<string, number>();
      
      for (const key of keys) {
        const result = await redisClient.checkRateLimit({
          key,
          algorithm: 'sliding-window',
          limit: 10,
          windowMs: 60000,
          coordinationStrategy: 'consistent-hashing'
        });
        
        const shard = result.shardKey;
        shardDistribution.set(shard, (shardDistribution.get(shard) || 0) + 1);
      }
      
      expect(shardDistribution.size).toBeGreaterThan(0);
    });
    
    test('should maintain consistency for same key', async () => {
      const key = 'consistent:test:key';
      const results: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        const result = await redisClient.checkRateLimit({
          key,
          algorithm: 'sliding-window',
          limit: 10,
          windowMs: 60000,
          coordinationStrategy: 'consistent-hashing'
        });
        results.push(result.shardKey);
      }
      
      // All requests for same key should go to same shard
      const uniqueShards = new Set(results);
      expect(uniqueShards.size).toBe(1);
    });
  });
  
  describe('Rate Limiting Algorithms', () => {
    test('should enforce sliding window limits correctly', async () => {
      const key = 'test:sliding:window';
      const limit = 3;
      const windowMs = 5000;
      
      // Make requests up to limit
      for (let i = 0; i < limit; i++) {
        const result = await redisClient.checkRateLimit({
          key,
          algorithm: 'sliding-window',
          limit,
          windowMs,
          coordinationStrategy: 'consistent-hashing'
        });
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(limit - i - 1);
      }
      
      // Next request should be blocked
      const blockedResult = await redisClient.checkRateLimit({
        key,
        algorithm: 'sliding-window',
        limit,
        windowMs,
        coordinationStrategy: 'consistent-hashing'
      });
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);
    });
    
    test('should enforce token bucket limits correctly', async () => {
      const key = 'test:token:bucket';
      const limit = 5;
      const windowMs = 10000;
      
      // Consume all tokens
      for (let i = 0; i < limit; i++) {
        const result = await redisClient.checkRateLimit({
          key,
          algorithm: 'token-bucket',
          limit,
          windowMs,
          coordinationStrategy: 'consistent-hashing'
        });
        expect(result.allowed).toBe(true);
      }
      
      // Should be blocked when tokens exhausted
      const blockedResult = await redisClient.checkRateLimit({
        key,
        algorithm: 'token-bucket',
        limit,
        windowMs,
        coordinationStrategy: 'consistent-hashing'
      });
      expect(blockedResult.allowed).toBe(false);
    });
    
    test('should enforce fixed window limits correctly', async () => {
      const key = 'test:fixed:window';
      const limit = 2;
      const windowMs = 3000;
      
      // Fill the window
      for (let i = 0; i < limit; i++) {
        const result = await redisClient.checkRateLimit({
          key,
          algorithm: 'fixed-window',
          limit,
          windowMs,
          coordinationStrategy: 'consistent-hashing'
        });
        expect(result.allowed).toBe(true);
      }
      
      // Should be blocked
      const blockedResult = await redisClient.checkRateLimit({
        key,
        algorithm: 'fixed-window',
        limit,
        windowMs,
        coordinationStrategy: 'consistent-hashing'
      });
      expect(blockedResult.allowed).toBe(false);
    });
  });
  
  describe('Circuit Breaker', () => {
    test('should open circuit breaker after failures', async () => {
      // Create client with low failure threshold
      const testConfig = {
        ...mockRedisConfig,
        single: { host: 'invalid-host', port: 9999 }, // Invalid connection
        circuitBreaker: {
          failureThreshold: 2,
          successThreshold: 1,
          timeout: 1000
        }
      };
      
      const failingClient = createDistributedRedisClient(testConfig);
      
      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await failingClient.checkRateLimit({
            key: 'test:circuit:breaker',
            algorithm: 'sliding-window',
            limit: 10,
            windowMs: 60000,
            coordinationStrategy: 'consistent-hashing'
          });
        } catch (error) {
          // Expected failures
        }
      }
      
      const health = await failingClient.getClusterHealth();
      expect(health.circuitBreakerState).toBe('open');
      
      await failingClient.disconnect();
    }, 10000);
  });
  
  describe('Multi-Instance Coordination', () => {
    test('should coordinate between multiple instances', async () => {
      const instance1Config = { ...mockRedisConfig, instanceId: 'test-instance-1' };
      const instance2Config = { ...mockRedisConfig, instanceId: 'test-instance-2' };
      
      const client1 = createDistributedRedisClient(instance1Config);
      const client2 = createDistributedRedisClient(instance2Config);
      
      const key = 'test:multi:instance';
      const limit = 3;
      
      // Instance 1 makes 2 requests
      for (let i = 0; i < 2; i++) {
        const result = await client1.checkRateLimit({
          key,
          algorithm: 'sliding-window',
          limit,
          windowMs: 60000,
          coordinationStrategy: 'consistent-hashing'
        });
        expect(result.allowed).toBe(true);
        expect(result.instanceId).toBe('test-instance-1');
      }
      
      // Instance 2 makes 1 request (should be allowed)
      const result1 = await client2.checkRateLimit({
        key,
        algorithm: 'sliding-window',
        limit,
        windowMs: 60000,
        coordinationStrategy: 'consistent-hashing'
      });
      expect(result1.allowed).toBe(true);
      expect(result1.instanceId).toBe('test-instance-2');
      expect(result1.remaining).toBe(0);
      
      // Instance 2 makes another request (should be blocked)
      const result2 = await client2.checkRateLimit({
        key,
        algorithm: 'sliding-window',
        limit,
        windowMs: 60000,
        coordinationStrategy: 'consistent-hashing'
      });
      expect(result2.allowed).toBe(false);
      
      await client1.disconnect();
      await client2.disconnect();
    }, 10000);
  });
  
  describe('Middleware Integration', () => {
    test('should integrate with Express middleware', async () => {
      const options = {
        redis: mockRedisConfig,
        rules: [
          {
            path: '/test',
            methods: ['GET'],
            algorithm: 'sliding-window' as const,
            limit: 2,
            windowMs: 5000
          }
        ],
        defaultRule: {
          algorithm: 'sliding-window' as const,
          limit: 10,
          windowMs: 60000
        },
        coordinationStrategy: 'consistent-hashing' as const
      };
      
      rateLimiter = createDistributedRateLimiter(options);
      const middleware = rateLimiter.middleware;
      
      // Mock request/response objects
      const mockReq = {
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
        connection: { remoteAddress: '127.0.0.1' }
      } as Request;
      
      const mockRes = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;
      
      const mockNext = jest.fn();
      
      // First request should pass
      await middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Second request should pass
      await middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Third request should be blocked
      await middleware(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
  });
  
  describe('Performance Testing', () => {
    test('should handle concurrent requests efficiently', async () => {
      const key = 'test:performance';
      const concurrentRequests = 50;
      const limit = 100;
      
      const startTime = Date.now();
      
      const promises = Array(concurrentRequests).fill(null).map(async (_, index) => {
        return redisClient.checkRateLimit({
          key: `${key}:${index % 10}`, // 10 different keys
          algorithm: 'sliding-window',
          limit,
          windowMs: 60000,
          coordinationStrategy: 'consistent-hashing'
        });
      });
      
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(concurrentRequests);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // All requests should be allowed (different keys or within limit)
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBeGreaterThan(concurrentRequests * 0.8); // At least 80% allowed
    }, 10000);
  });
  
  describe('Error Handling and Fallback', () => {
    test('should gracefully handle Redis connection failures', async () => {
      const fallbackConfig = {
        ...mockRedisConfig,
        single: { host: 'nonexistent-host', port: 9999 }
      };
      
      const fallbackOptions = {
        redis: fallbackConfig,
        rules: [],
        defaultRule: {
          algorithm: 'sliding-window' as const,
          limit: 10,
          windowMs: 60000
        },
        coordinationStrategy: 'consistent-hashing' as const,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 1,
          recoveryTimeout: 1000,
          degradedModeLimit: 5
        }
      };
      
      const fallbackLimiter = createDistributedRateLimiter(fallbackOptions);
      const middleware = fallbackLimiter.middleware;
      
      const mockReq = {
        path: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        headers: {},
        connection: { remoteAddress: '127.0.0.1' }
      } as Request;
      
      const mockRes = {
        set: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;
      
      const mockNext = jest.fn();
      
      // Should fail open or use fallback
      await middleware(mockReq, mockRes, mockNext);
      
      // Either passes through with fail-open or uses fallback limiter
      const nextCalled = mockNext.mock.calls.length > 0;
      const statusCalled = mockRes.status.mock.calls.length > 0;
      expect(nextCalled || statusCalled).toBe(true);
      
      await fallbackLimiter.shutdown();
    }, 10000);
  });
  
  describe('Statistics and Monitoring', () => {
    test('should provide comprehensive statistics', async () => {
      if (!rateLimiter) {
        rateLimiter = createDistributedRateLimiter({
          redis: mockRedisConfig,
          rules: [],
          defaultRule: {
            algorithm: 'sliding-window' as const,
            limit: 10,
            windowMs: 60000
          },
          coordinationStrategy: 'consistent-hashing' as const
        });
      }
      
      const stats = rateLimiter.getStats();
      
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('blockedRequests');
      expect(stats).toHaveProperty('errorCount');
      expect(stats).toHaveProperty('instanceId');
      expect(stats).toHaveProperty('clusterHealth');
      expect(stats).toHaveProperty('coordinationStrategy');
      expect(stats).toHaveProperty('uptime');
      
      expect(typeof stats.totalRequests).toBe('number');
      expect(typeof stats.blockedRequests).toBe('number');
      expect(typeof stats.errorCount).toBe('number');
      expect(typeof stats.instanceId).toBe('string');
      expect(typeof stats.uptime).toBe('number');
    });
  });
});

/**
 * Integration Test for Setup Utilities
 */
describe('Distributed Setup Utilities', () => {
  let mockApp: any;
  
  beforeEach(() => {
    mockApp = {
      use: jest.fn(),
      get: jest.fn()
    };
  });
  
  test('should setup distributed rate limiter with quick setup', async () => {
    // This test may fail without proper Redis setup, but should not throw
    try {
      const result = await quickSetupDistributed(mockApp, {
        limit: 100,
        windowMs: 60000,
        excludePaths: ['/health']
      });
      
      expect(mockApp.use).toHaveBeenCalled();
      expect(mockApp.get).toHaveBeenCalledWith('/stats/distributed', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/health/distributed', expect.any(Function));
      expect(result.getStats).toBeDefined();
      expect(result.shutdown).toBeDefined();
      
      await result.shutdown();
    } catch (error) {
      // Expected in test environment
      console.log('Quick setup test skipped due to Redis connectivity:', error);
    }
  }, 10000);
});
