/**
 * Middleware Unit Tests
 * 
 * Tests for critical Express.js middleware components including:
 * - Rate limiting middleware (optimized and standard)
 * - API key authentication
 * - JWT authentication  
 * - Input validation
 * - IP filtering
 * - Sensitive endpoint protection
 */

import { Request, Response } from 'express';
import { createOptimizedRateLimiter, OptimizedRateLimitConfig } from '../../src/middleware/optimizedRateLimiter';
import { createApiKeyMiddleware, requireApiKey } from '../../src/middleware/apiKeyAuth';
import { createSensitiveEndpointLimiter } from '../../src/middleware/sensitiveEndpointLimiter';
import { RedisClient } from '../../src/utils/redis';
import { ApiKeyManager, ApiKeyMetadata } from '../../src/utils/apiKeys';

// Mock Redis and other dependencies
jest.mock('../../src/utils/redis');
jest.mock('../../src/utils/apiKeys');

describe('Middleware Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let mockRedis: jest.Mocked<RedisClient>;
  let mockApiKeyManager: jest.Mocked<ApiKeyManager>;

  beforeEach(() => {
    // Reset mocks before each test
    mockReq = {
      ip: '127.0.0.1',
      path: '/test',
      method: 'GET',
      headers: {},
      body: {},
      query: {},
      params: {},
      url: '/test'
    } as Partial<Request>;
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      locals: {}
    };
    
    mockNext = jest.fn();

    // Mock Redis client
    mockRedis = {
      tokenBucket: jest.fn().mockResolvedValue({ allowed: true, remainingTokens: 10 }),
      slidingWindow: jest.fn().mockResolvedValue({ allowed: true, remainingRequests: 10 }),
      fixedWindow: jest.fn().mockResolvedValue({ allowed: true, remainingRequests: 10, resetTime: Date.now() + 60000 }),
      isConnected: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
      zcard: jest.fn()
    } as any;

    // Mock API Key Manager
    mockApiKeyManager = {
      validateApiKey: jest.fn(),
      recordUsage: jest.fn().mockResolvedValue(undefined),
      isQuotaExceeded: jest.fn().mockResolvedValue(false),
      checkQuota: jest.fn().mockResolvedValue({
        withinQuota: true,
        quota: 1000,
        usage: { currentMonthRequests: 10 }
      })
    } as any;
  });

  describe('Optimized Rate Limiter Middleware', () => {
    const rateLimitConfig: OptimizedRateLimitConfig = {
      windowMs: 60000,
      maxRequests: 100,
      algorithm: 'token-bucket'
    };

    it('should allow requests within rate limit', async () => {
      const rateLimiter = createOptimizedRateLimiter(mockRedis, rateLimitConfig);
      const middleware = rateLimiter.middleware();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });

    it('should set rate limit headers', async () => {
      // Mock successful rate limit check
      mockRedis.tokenBucket.mockResolvedValue({ 
        allowed: true, 
        remainingTokens: 10
      });
      
      const rateLimiter = createOptimizedRateLimiter(mockRedis, rateLimitConfig);
      const middleware = rateLimiter.middleware();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Algorithm': 'token-bucket'
      }));
      // Also expect new standard headers
      expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
        'RateLimit-Limit': '100'
      }));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle different rate limiting algorithms', async () => {
      const algorithms = ['token-bucket', 'sliding-window', 'fixed-window'] as const;
      
      for (const algorithm of algorithms) {
        const config = { ...rateLimitConfig, algorithm };
        const rateLimiter = createOptimizedRateLimiter(mockRedis, config);
        const middleware = rateLimiter.middleware();
        
        // Mock the appropriate Redis method
        if (algorithm === 'token-bucket') {
          mockRedis.tokenBucket.mockResolvedValue({ allowed: true, remainingTokens: 10 });
        } else if (algorithm === 'sliding-window') {
          mockRedis.slidingWindow.mockResolvedValue({ allowed: true, remainingRequests: 10 });
        } else {
          mockRedis.fixedWindow.mockResolvedValue({ allowed: true, remainingRequests: 10, resetTime: Date.now() + 60000 });
        }
        
        mockNext.mockClear();
        mockRes.set = jest.fn().mockReturnThis();
        
        await middleware(mockReq as Request, mockRes as Response, mockNext);
        
        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
          'X-RateLimit-Algorithm': algorithm
        }));
      }
    });

    it('should handle missing IP address gracefully', async () => {
      const reqWithoutIP = { ...mockReq, ip: undefined };
      const rateLimiter = createOptimizedRateLimiter(mockRedis, rateLimitConfig);
      const middleware = rateLimiter.middleware();
      
      await middleware(reqWithoutIP as Request, mockRes as Response, mockNext);
      
      // Should still call next() and not crash
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block requests when rate limit exceeded', async () => {
      // Mock rate limit exceeded
      mockRedis.tokenBucket.mockResolvedValue({ allowed: false, remainingTokens: 0 });
      
      const rateLimiter = createOptimizedRateLimiter(mockRedis, rateLimitConfig);
      const middleware = rateLimiter.middleware();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Too Many Requests'
      }));
      // Verify 429 sets standard reset headers
      expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
        'RateLimit-Remaining': '0'
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle Redis connection errors gracefully', async () => {
      // Mock Redis error
      mockRedis.tokenBucket.mockRejectedValue(new Error('Redis connection failed'));
      
      const rateLimiter = createOptimizedRateLimiter(mockRedis, rateLimitConfig);
      const middleware = rateLimiter.middleware();
      
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      // Should fall back and continue (fail-open strategy)
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('API Key Authentication Middleware', () => {
    it('should allow requests with valid API key', async () => {
      const reqWithApiKey = {
        ...mockReq,
        headers: { 'x-api-key': 'valid-api-key-123' }
      };
      
      mockApiKeyManager.validateApiKey.mockResolvedValue({
        id: 'key-123',
        key: 'test-key',
        name: 'Test Key',
        tier: 'premium',
        userId: 'user-123',
        created: Date.now(),
        isActive: true,
        usage: {
          totalRequests: 10,
          currentMonthRequests: 10,
          lastResetMonth: '2024-01'
        },
        rateLimit: {
          windowMs: 60000,
          maxRequests: 100,
          algorithm: 'token-bucket'
        },
        metadata: {}
      });
      
      const middleware = requireApiKey(mockApiKeyManager);
      await middleware(reqWithApiKey as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(reqWithApiKey.apiKey).toBeDefined();
    });

    it('should reject requests with invalid API key', async () => {
      const reqWithInvalidKey = {
        ...mockReq,
        headers: { 'x-api-key': 'invalid-key' }
      };
      
      mockApiKeyManager.validateApiKey.mockResolvedValue(null);
      
      const middleware = requireApiKey(mockApiKeyManager);
      await middleware(reqWithInvalidKey as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid API key',
        message: 'The provided API key is invalid or has been revoked'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject requests without required API key', async () => {
      const middleware = requireApiKey(mockApiKeyManager);
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle API key validation errors gracefully', async () => {
      const reqWithApiKey = {
        ...mockReq,
        headers: { 'x-api-key': 'test-key' }
      };
      
      mockApiKeyManager.validateApiKey.mockRejectedValue(new Error('Database error'));
      
      const middleware = requireApiKey(mockApiKeyManager);
      await middleware(reqWithApiKey as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should track API key usage', async () => {
      const reqWithApiKey = {
        ...mockReq,
        headers: { 'x-api-key': 'valid-key' }
      };
      
      mockApiKeyManager.validateApiKey.mockResolvedValue({
        id: 'key-123',
        key: 'test-key',
        name: 'Test Key',
        tier: 'premium',
        userId: 'user-123',
        created: Date.now(),
        isActive: true,
        usage: {
          totalRequests: 10,
          currentMonthRequests: 10,
          lastResetMonth: '2024-01'
        },
        rateLimit: {
          windowMs: 60000,
          maxRequests: 100,
          algorithm: 'token-bucket'
        },
        metadata: {}
      });
      
      mockApiKeyManager.checkQuota = jest.fn().mockResolvedValue({
        withinQuota: true,
        quota: 1000,
        usage: { currentMonthRequests: 10 }
      });
      
      const middleware = createApiKeyMiddleware({
        apiKeyManager: mockApiKeyManager,
        required: true,
        checkQuota: true
      });
      
      await middleware(reqWithApiKey as Request, mockRes as Response, mockNext);
      
      // Give a small delay for async recordUsage call
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockApiKeyManager.recordUsage).toHaveBeenCalledWith('key-123', 1);
    });
  });

  describe('Sensitive Endpoint Limiter Middleware', () => {
    it('should apply stricter limits to authentication endpoints', async () => {
      const authReq = {
        ...mockReq,
        path: '/auth/login',
        url: '/auth/login'
      };
      
      const middleware = createSensitiveEndpointLimiter(mockRedis, 'auth');
      await middleware(authReq as Request, mockRes as Response, mockNext);
      
      // Should apply appropriate rate limit for auth endpoints
      expect(mockRedis.slidingWindow).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should identify API key management endpoints', async () => {
      const apiKeyReq = {
        ...mockReq,
        path: '/api-keys',
        url: '/api-keys',
        method: 'POST'
      };
      
      const middleware = createSensitiveEndpointLimiter(mockRedis, 'management');
      await middleware(apiKeyReq as Request, mockRes as Response, mockNext);
      
      expect(mockRedis.tokenBucket).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should apply normal limits to non-sensitive endpoints', async () => {
      const healthReq = {
        ...mockReq,
        path: '/health',
        url: '/health'
      };
      
      const middleware = createSensitiveEndpointLimiter(mockRedis, 'info');
      await middleware(healthReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle critical endpoints with strictest limits', async () => {
      const criticalReq = {
        ...mockReq,
        path: '/rules',
        url: '/rules',
        method: 'DELETE'
      };
      
      const middleware = createSensitiveEndpointLimiter(mockRedis, 'critical');
      await middleware(criticalReq as Request, mockRes as Response, mockNext);
      
      expect(mockRedis.slidingWindow).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Middleware Integration and Edge Cases', () => {
    it('should handle middleware chain properly', async () => {
      // Test middleware working together
      const rateLimitMiddleware = createOptimizedRateLimiter(mockRedis, {
        windowMs: 60000,
        maxRequests: 100,
        algorithm: 'token-bucket'
      }).middleware();
      
      // Apply multiple middleware in sequence
      await rateLimitMiddleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      
      mockNext.mockClear();
      const apiKeyMiddleware = createApiKeyMiddleware({
        apiKeyManager: mockApiKeyManager,
        required: false
      });
      await apiKeyMiddleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle concurrent requests properly', async () => {
      const middleware = createOptimizedRateLimiter(mockRedis, {
        windowMs: 60000,
        maxRequests: 100,
        algorithm: 'token-bucket'
      }).middleware();
      
      // Simulate concurrent requests
      const requests = Array(5).fill(null).map(() => 
        middleware(mockReq as Request, mockRes as Response, jest.fn())
      );
      
      await Promise.all(requests);
      
      // All requests should be processed
      expect(mockRedis.tokenBucket).toHaveBeenCalledTimes(5);
    });

    it('should handle requests with custom key generators', async () => {
      const customConfig: OptimizedRateLimitConfig = {
        windowMs: 60000,
        maxRequests: 100,
        algorithm: 'token-bucket',
        keyGenerator: (req) => `custom:${req.ip}:${req.path}`
      };
      
      const middleware = createOptimizedRateLimiter(mockRedis, customConfig).middleware();
      await middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRedis.tokenBucket).toHaveBeenCalledWith(
        'custom:127.0.0.1:/test',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should handle malformed requests gracefully', async () => {
      const malformedReq = {
        headers: null,
        ip: null,
        path: null
      } as any;
      
      const middleware = createOptimizedRateLimiter(mockRedis, {
        windowMs: 60000,
        maxRequests: 100,
        algorithm: 'token-bucket'
      }).middleware();
      
      await middleware(malformedReq, mockRes as Response, mockNext);
      
      // Should not crash and should call next
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
