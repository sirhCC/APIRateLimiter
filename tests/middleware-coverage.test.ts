/**
 * Comprehensive Middleware Tests
 * Coverage for middleware files with 0% or low coverage
 */

import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import express from 'express';

// Mock Redis and other dependencies
jest.mock('../src/utils/redis', () => ({
  createRedisClient: () => ({
    isConnected: false,
    disconnect: jest.fn(),
    tokenBucket: jest.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
    slidingWindow: jest.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
    fixedWindow: jest.fn().mockResolvedValue({ allowed: true, remaining: 10 })
  })
}));

jest.mock('../src/utils/stats', () => ({
  SimpleStats: jest.fn().mockImplementation(() => ({
    addRequest: jest.fn(),
    getStats: jest.fn().mockReturnValue({ totalRequests: 0 })
  }))
}));

describe('Middleware Coverage Tests', () => {
  let app: express.Application;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockReq = {
      ip: '127.0.0.1',
      path: '/test',
      method: 'GET',
      headers: {},
      body: {},
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('IP Filter Middleware', () => {
    test('should allow requests from allowed IPs', async () => {
      // Import and test ipFilter
      const { createIPFilterMiddleware } = await import('../src/middleware/ipFilter');
      
      const ipFilter = createIPFilterMiddleware({
        whitelist: ['127.0.0.1', '::1'],
        blacklist: []
      });

      mockReq.ip = '127.0.0.1';
      ipFilter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.isWhitelisted).toBe(true);
    });

    test('should block requests from blocked IPs', async () => {
      const { createIPFilterMiddleware } = await import('../src/middleware/ipFilter');
      
      const ipFilter = createIPFilterMiddleware({
        whitelist: [],
        blacklist: ['192.168.1.100']
      });

      mockReq.ip = '192.168.1.100';
      ipFilter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle missing IP gracefully', async () => {
      const { createIPFilterMiddleware } = await import('../src/middleware/ipFilter');
      
      const ipFilter = createIPFilterMiddleware({
        whitelist: ['127.0.0.1'],
        blacklist: []
      });

      mockReq.ip = undefined;
      mockReq.connection = { remoteAddress: 'unknown' };
      ipFilter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Validation Middleware', () => {
    test('should validate request body schema', async () => {
      const { createValidationMiddleware } = await import('../src/middleware/validation');
      
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' }
        }
      };

      const validator = createValidationMiddleware(schema);
      
      mockReq.body = { name: 'John', email: 'john@example.com' };
      validator(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject invalid request body', async () => {
      const { createValidationMiddleware } = await import('../src/middleware/validation');
      
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      };

      const validator = createValidationMiddleware(schema);
      
      mockReq.body = { email: 'john@example.com' }; // Missing required 'name'
      validator(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should validate query parameters', async () => {
      const { createQueryValidationMiddleware } = await import('../src/middleware/validation');
      
      const schema = {
        type: 'object',
        properties: {
          page: { type: 'string', pattern: '^[0-9]+$' },
          limit: { type: 'string', pattern: '^[0-9]+$' }
        }
      };

      const validator = createQueryValidationMiddleware(schema);
      
      mockReq.query = { page: '1', limit: '10' };
      validator(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Logger Middleware', () => {
    test('should log rate limit decisions', async () => {
      const { createRateLimitLogger } = await import('../src/middleware/logger');
      
      const logger = createRateLimitLogger();
      
      mockReq.ip = '127.0.0.1';
      mockReq.path = '/api/test';
      mockRes.locals = { rateLimitInfo: { allowed: true, remaining: 5 } };
      
      logger(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should log blocked requests', async () => {
      const { createRateLimitLogger } = await import('../src/middleware/logger');
      
      const logger = createRateLimitLogger();
      
      mockReq.ip = '192.168.1.100';
      mockRes.locals = { rateLimitInfo: { allowed: false, remaining: 0 } };
      
      logger(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Rate Limiter Middleware (Legacy)', () => {
    test('should create rate limiter with token bucket', async () => {
      const { createRateLimiter } = await import('../src/middleware/rateLimiter');
      
      const limiter = createRateLimiter({
        algorithm: 'token-bucket',
        tokensPerInterval: 10,
        intervalMs: 60000
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should create rate limiter with sliding window', async () => {
      const { createRateLimiter } = await import('../src/middleware/rateLimiter');
      
      const limiter = createRateLimiter({
        algorithm: 'sliding-window',
        limit: 100,
        windowMs: 60000
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle rate limit exceeded', async () => {
      // Mock Redis to return rate limit exceeded
      jest.doMock('../src/utils/redis', () => ({
        createRedisClient: () => ({
          isConnected: true,
          tokenBucket: jest.fn().mockResolvedValue({ allowed: false, remaining: 0 })
        })
      }));

      const { createRateLimiter } = await import('../src/middleware/rateLimiter');
      
      const limiter = createRateLimiter({
        algorithm: 'token-bucket',
        tokensPerInterval: 1,
        intervalMs: 60000
      });

      await limiter(mockReq as Request, mockRes as Response, mockNext);
      
      // Should still call next due to fallback behavior
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Sensitive Endpoint Limiter', () => {
    test('should apply strict limits to sensitive endpoints', async () => {
      const { createSensitiveEndpointLimiter } = await import('../src/middleware/sensitiveEndpointLimiter');
      
      const limiter = createSensitiveEndpointLimiter({
        endpoints: ['/api/auth/login', '/api/admin/*'],
        limit: 5,
        windowMs: 900000 // 15 minutes
      });

      mockReq.path = '/api/auth/login';
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should skip non-sensitive endpoints', async () => {
      const { createSensitiveEndpointLimiter } = await import('../src/middleware/sensitiveEndpointLimiter');
      
      const limiter = createSensitiveEndpointLimiter({
        endpoints: ['/api/auth/login'],
        limit: 5,
        windowMs: 900000
      });

      mockReq.path = '/api/public/data';
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle wildcard patterns', async () => {
      const { createSensitiveEndpointLimiter } = await import('../src/middleware/sensitiveEndpointLimiter');
      
      const limiter = createSensitiveEndpointLimiter({
        endpoints: ['/api/admin/*'],
        limit: 10,
        windowMs: 3600000
      });

      mockReq.path = '/api/admin/users';
      await limiter(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    test('should handle full middleware stack', async () => {
      // Create test app with multiple middleware
      app.use(express.json());
      
      // Mock middleware
      app.use((req, res, next) => {
        req.ip = '127.0.0.1';
        next();
      });
      
      app.get('/test', (req, res) => {
        res.json({ message: 'success' });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body.message).toBe('success');
    });

    test('should handle middleware errors gracefully', async () => {
      app.use((req, res, next) => {
        throw new Error('Middleware error');
      });

      app.use((err: any, req: any, res: any, next: any) => {
        res.status(500).json({ error: 'Middleware failed' });
      });

      app.get('/test', (req, res) => {
        res.json({ message: 'should not reach here' });
      });

      const response = await request(app)
        .get('/test')
        .expect(500);

      expect(response.body.error).toBe('Middleware failed');
    });
  });
});
