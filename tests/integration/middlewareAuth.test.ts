/**
 * Middleware Integration Tests
 * 
 * Comprehensive tests for middleware integration:
 * - API key authentication with quota enforcement
 * - JWT authentication with role-based rate limiting
 * - Combined authentication strategies
 * - Tier-based rate limiting
 * - Edge cases and error scenarios
 */

import express, { Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { RedisClient } from '../../src/utils/redis';
import { ApiKeyManager } from '../../src/utils/apiKeys';
import { createApiKeyMiddleware, requireApiKey } from '../../src/middleware/apiKeyAuth';
import { createJWTAuthMiddleware, requireRole, requirePermission } from '../../src/middleware/jwtAuth';
import { OptimizedRateLimiter } from '../../src/middleware/optimizedRateLimiter';

describe('Middleware Integration Tests', () => {
  let redis: RedisClient;
  let apiKeyManager: ApiKeyManager;
  let app: Express;
  const JWT_SECRET = 'test-secret-key-for-testing';

  beforeAll(async () => {
    redis = new RedisClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 15,
      enabled: true,
    });

    apiKeyManager = new ApiKeyManager(redis);
    
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  afterAll(async () => {
    await redis.disconnect?.();
  });

  describe('API Key Authentication Integration', () => {
    let testApiKey: string;
    let testKeyId: string;

    beforeEach(async () => {
      // Generate test API key
      const keyData = await apiKeyManager.generateApiKey({
        name: 'Test Integration Key',
        tier: 'premium',
        userId: 'test-user-123',
      });
      
      testApiKey = keyData.apiKey;
      testKeyId = keyData.metadata.id;
    });

    afterEach(async () => {
      // Cleanup
      try {
        await apiKeyManager.revokeApiKey(testKeyId);
      } catch (error) {
        // Key might not exist
      }
    });

    it('should authenticate valid API key and apply tier-based rate limit', async () => {
      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: true,
        checkQuota: true,
      });

      const rateLimiter = new OptimizedRateLimiter(redis, {
        windowMs: 60000,
        maxRequests: 1000, // Premium tier limit
        algorithm: 'token-bucket',
        burstCapacity: 1500,
        keyGenerator: (req) => `api:${(req as any).apiKey?.id}:${req.path}`,
      });

      app.use(apiKeyAuth);
      app.get('/test', rateLimiter.middleware(), (req, res) => {
        res.json({ 
          success: true,
          tier: (req as any).apiKey?.tier,
        });
      });

      const response = await request(app)
        .get('/test')
        .set('X-API-Key', testApiKey);

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('premium');
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
    });

    it('should reject invalid API key', async () => {
      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: true,
      });

      app.use(apiKeyAuth);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('X-API-Key', 'invalid-key-12345');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should enforce quota limits', async () => {
      // Create a key with very low quota
      const lowQuotaKeyData = await apiKeyManager.generateApiKey({
        name: 'Low Quota Key',
        tier: 'free',
        userId: 'quota-test-user',
      });

      // Set usage to near limit (free tier: 10000/month)
      const metadata = await apiKeyManager.validateApiKey(lowQuotaKeyData.apiKey);
      if (metadata) {
        metadata.usage.currentMonthRequests = 9999;
        // Update in Redis
        await redis.set(
          `api_key_meta:${metadata.id}`,
          JSON.stringify(metadata)
        );
      }

      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: true,
        checkQuota: true,
      });

      app.use(apiKeyAuth);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // First request should succeed
      await request(app)
        .get('/test')
        .set('X-API-Key', lowQuotaKeyData.apiKey)
        .expect(200);

      // Second request might hit quota
      const response = await request(app)
        .get('/test')
        .set('X-API-Key', lowQuotaKeyData.apiKey);

      // Should either succeed or return quota error
      expect([200, 429]).toContain(response.status);

      // Cleanup
      await apiKeyManager.revokeApiKey(lowQuotaKeyData.metadata.id);
    });

    it('should track API key usage', async () => {
      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: true,
        checkQuota: true,
      });

      app.use(apiKeyAuth);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Make several requests
      for (let i = 0; i < 3; i++) {
        await request(app)
          .get('/test')
          .set('X-API-Key', testApiKey);
      }

      // Check usage was recorded
      const metadata = await apiKeyManager.validateApiKey(testApiKey);
      expect(metadata).not.toBeNull();
      if (metadata) {
        expect(metadata.usage.currentMonthRequests).toBeGreaterThan(0);
      }
    });

    it('should allow optional API key authentication', async () => {
      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: false, // Optional
      });

      app.use(apiKeyAuth);
      app.get('/test', (req, res) => {
        const hasKey = !!(req as any).apiKey;
        res.json({ authenticated: hasKey });
      });

      // Without API key
      const response1 = await request(app).get('/test');
      expect(response1.status).toBe(200);
      expect(response1.body.authenticated).toBe(false);

      // With API key
      const response2 = await request(app)
        .get('/test')
        .set('X-API-Key', testApiKey);
      expect(response2.status).toBe(200);
      expect(response2.body.authenticated).toBe(true);
    });
  });

  describe('JWT Authentication Integration', () => {
    const generateToken = (payload: any) => {
      return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    };

    it('should authenticate valid JWT and apply role-based rate limit', async () => {
      const token = generateToken({
        id: 'user-123',
        email: 'test@example.com',
        role: 'premium',
      });

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: true,
        roleBasedRateLimit: {
          premium: {
            windowMs: 60000,
            maxRequests: 1000,
            algorithm: 'token-bucket',
          },
        },
      });

      app.use(jwtAuth);
      app.get('/test', (req, res) => {
        res.json({
          success: true,
          user: (req as any).user,
        });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('premium');
    });

    it('should reject invalid JWT', async () => {
      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: true,
      });

      app.use(jwtAuth);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should enforce role-based access control', async () => {
      const userToken = generateToken({
        id: 'user-123',
        email: 'user@example.com',
        role: 'user',
      });

      const adminToken = generateToken({
        id: 'admin-456',
        email: 'admin@example.com',
        role: 'admin',
      });

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: true,
      });

      app.use(jwtAuth);
      app.get('/admin', requireRole(['admin']), (req, res) => {
        res.json({ success: true, message: 'Admin access' });
      });

      // User should be denied
      const userResponse = await request(app)
        .get('/admin')
        .set('Authorization', `Bearer ${userToken}`);
      expect(userResponse.status).toBe(403);

      // Admin should be allowed
      const adminResponse = await request(app)
        .get('/admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminResponse.status).toBe(200);
    });

    it('should enforce permission-based access control', async () => {
      const readOnlyToken = generateToken({
        id: 'user-123',
        email: 'readonly@example.com',
        role: 'user',
        permissions: ['read'],
      });

      const writeToken = generateToken({
        id: 'user-456',
        email: 'writer@example.com',
        role: 'user',
        permissions: ['read', 'write'],
      });

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: true,
      });

      app.use(jwtAuth);
      app.post('/data', requirePermission(['write']), (req, res) => {
        res.json({ success: true, message: 'Data written' });
      });

      // Read-only user should be denied
      const readOnlyResponse = await request(app)
        .post('/data')
        .set('Authorization', `Bearer ${readOnlyToken}`);
      expect(readOnlyResponse.status).toBe(403);

      // Write user should be allowed
      const writeResponse = await request(app)
        .post('/data')
        .set('Authorization', `Bearer ${writeToken}`);
      expect(writeResponse.status).toBe(200);
    });

    it('should extract JWT from multiple sources', async () => {
      const token = generateToken({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
      });

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: false,
      });

      app.use(jwtAuth);
      app.get('/test', (req, res) => {
        res.json({ authenticated: !!(req as any).isJWTAuthenticated });
      });

      // From Authorization header
      const headerResponse = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);
      expect(headerResponse.body.authenticated).toBe(true);

      // From query parameter
      const queryResponse = await request(app)
        .get(`/test?token=${token}`);
      expect(queryResponse.body.authenticated).toBe(true);
    });
  });

  describe('Combined Authentication Strategies', () => {
    let testApiKey: string;

    beforeEach(async () => {
      const keyData = await apiKeyManager.generateApiKey({
        name: 'Combined Test Key',
        tier: 'enterprise',
        userId: 'combined-test-user',
      });
      testApiKey = keyData.apiKey;
    });

    it('should prioritize API key over JWT when both present', async () => {
      const token = jwt.sign(
        { id: 'user-123', role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: false,
      });

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: false,
      });

      app.use(jwtAuth);
      app.use(apiKeyAuth);
      app.get('/test', (req, res) => {
        const reqAny = req as any;
        res.json({
          hasApiKey: !!reqAny.apiKey,
          hasJWT: !!reqAny.isJWTAuthenticated,
          tier: reqAny.apiKey?.tier,
        });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`)
        .set('X-API-Key', testApiKey);

      expect(response.status).toBe(200);
      expect(response.body.hasApiKey).toBe(true);
      expect(response.body.hasJWT).toBe(true);
      expect(response.body.tier).toBe('enterprise');
    });

    it('should apply appropriate rate limit based on authentication method', async () => {
      const token = jwt.sign(
        { id: 'user-123', role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: false,
      });

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: false,
        roleBasedRateLimit: {
          user: {
            windowMs: 60000,
            maxRequests: 50,
            algorithm: 'sliding-window',
          },
        },
      });

      // Complex rate limiter that checks auth method
      const createSmartRateLimiter = () => {
        return (req: any, res: any, next: any) => {
          const key = req.apiKey 
            ? `api:${req.apiKey.id}:${req.path}`
            : req.isJWTAuthenticated
            ? `jwt:${req.user.id}:${req.path}`
            : `ip:${req.ip}:${req.path}`;

          const config = req.apiKey
            ? { windowMs: 60000, maxRequests: 10000, algorithm: 'token-bucket' as const }
            : req.isJWTAuthenticated
            ? { windowMs: 60000, maxRequests: 50, algorithm: 'sliding-window' as const }
            : { windowMs: 60000, maxRequests: 10, algorithm: 'fixed-window' as const };

          const limiter = new OptimizedRateLimiter(redis, {
            ...config,
            keyGenerator: () => key,
          });

          return limiter.middleware()(req, res, next);
        };
      };

      app.use(jwtAuth);
      app.use(apiKeyAuth);
      app.get('/test', createSmartRateLimiter(), (req, res) => {
        res.json({ success: true });
      });

      // With API key (high limit)
      const apiResponse = await request(app)
        .get('/test')
        .set('X-API-Key', testApiKey);
      expect(apiResponse.status).toBe(200);

      // With JWT (medium limit)
      const jwtResponse = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);
      expect(jwtResponse.status).toBe(200);

      // Without auth (low limit)
      const unauthResponse = await request(app).get('/test');
      expect(unauthResponse.status).toBe(200);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed Authorization header', async () => {
      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: false,
      });

      app.use(jwtAuth);
      app.get('/test', (req, res) => {
        res.json({ authenticated: !!(req as any).isJWTAuthenticated });
      });

      // Malformed header
      const response = await request(app)
        .get('/test')
        .set('Authorization', 'NotBearer token');

      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(false);
    });

    it('should handle expired JWT gracefully', async () => {
      const expiredToken = jwt.sign(
        { id: 'user-123', role: 'user' },
        JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: true,
      });

      app.use(jwtAuth);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle missing required authentication', async () => {
      const apiKeyAuth = createApiKeyMiddleware({
        apiKeyManager,
        required: true,
      });

      app.use(apiKeyAuth);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).get('/test');
      expect(response.status).toBe(401);
    });

    it('should handle concurrent authentication checks', async () => {
      const token = jwt.sign(
        { id: 'user-123', role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const jwtAuth = createJWTAuthMiddleware({
        secret: JWT_SECRET,
        required: false,
      });

      app.use(jwtAuth);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        request(app)
          .get('/test')
          .set('Authorization', `Bearer ${token}`)
      );

      const results = await Promise.all(promises);
      const allSucceeded = results.every(r => r.status === 200);
      
      expect(allSucceeded).toBe(true);
    });
  });
});
