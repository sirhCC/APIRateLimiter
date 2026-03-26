import { Express, Request, Response, RequestHandler } from 'express';
import { ApiKeyManager } from '../utils/apiKeys';
import { validateApiKeyEndpoint, validateSystemEndpoint } from '../middleware/validation';
import {
  ApiKeyParamsSchema,
  ApiKeyResponseSchema,
  ApiKeyTiersResponseSchema,
  ApiKeyUsageResponseSchema,
  CreateApiKeyRequestSchema,
  ListApiKeysQuerySchema,
} from '../utils/schemas';

export interface RegisterApiKeyRoutesOptions {
  apiKeyManager: ApiKeyManager;
  managementRateLimiter: RequestHandler;
  criticalRateLimiter: RequestHandler;
}

export function registerApiKeyRoutes(app: Express, options: RegisterApiKeyRoutesOptions): void {
  const { apiKeyManager, managementRateLimiter, criticalRateLimiter } = options;

  app.get('/api-keys/tiers', validateSystemEndpoint(undefined, ApiKeyTiersResponseSchema), (req: Request, res: Response) => {
    res.json({
      message: 'Available API key tiers',
      tiers: [
        {
          name: 'free',
          displayName: 'Free',
          limits: {
            requestsPerMinute: 100,
            requestsPerMonth: 10000,
          },
          features: ['Basic rate limiting', 'Standard support'],
          description: 'Basic rate limiting for free users',
        },
        {
          name: 'premium',
          displayName: 'Premium',
          limits: {
            requestsPerMinute: 1000,
            requestsPerMonth: 100000,
            burstCapacity: 100,
          },
          features: ['Enhanced rate limiting', 'Burst capacity', 'Priority support'],
          description: 'Enhanced rate limiting with burst capacity',
        },
        {
          name: 'enterprise',
          displayName: 'Enterprise',
          limits: {
            requestsPerMinute: 10000,
            requestsPerMonth: 1000000,
            burstCapacity: 500,
          },
          features: ['High-performance rate limiting', 'Large burst capacity', 'Premium support', 'Custom configurations'],
          description: 'High-performance rate limiting for enterprise',
        },
      ],
    });
  });

  app.post('/api-keys', managementRateLimiter, validateApiKeyEndpoint(CreateApiKeyRequestSchema, undefined, undefined, ApiKeyResponseSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, tier = 'free', userId, organizationId, metadata } = req.body;

      const result = await apiKeyManager.generateApiKey({
        name,
        tier,
        userId,
        organizationId,
        metadata: {
          ...metadata,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        message: 'API key generated successfully',
        apiKey: result.apiKey,
        metadata: result.metadata,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to generate API key',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 500,
      });
    }
  });

  app.get('/api-keys', validateApiKeyEndpoint(undefined, ListApiKeysQuerySchema, undefined, undefined), async (req: Request, res: Response): Promise<void> => {
    try {
      const queryData = (req as Request & { validatedQuery?: { userId: string } }).validatedQuery || req.query;
      const userId = typeof queryData.userId === 'string' ? queryData.userId : undefined;

      if (!userId) {
        res.status(400).json({
          error: 'Missing userId',
          message: 'userId query parameter is required',
          timestamp: new Date().toISOString(),
          path: req.path,
          statusCode: 400,
        });
        return;
      }

      const keys = await apiKeyManager.getUserKeys(userId);

      res.json({
        message: 'API keys retrieved',
        keys,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve API keys',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 500,
      });
    }
  });

  app.get('/api-keys/:keyId', validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, undefined), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { keyId: string } }).validatedParams || req.params;
      const { keyId } = paramsData;

      const keyMetadata = await apiKeyManager.getKeyMetadata(keyId);
      if (!keyMetadata) {
        res.status(404).json({
          error: 'API key not found',
          timestamp: new Date().toISOString(),
          path: req.path,
          statusCode: 404,
        });
        return;
      }

      res.json({
        message: 'API key details',
        metadata: keyMetadata,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve API key details',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 500,
      });
    }
  });

  app.delete('/api-keys/:keyId', criticalRateLimiter, validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, undefined), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { keyId: string } }).validatedParams || req.params;
      const { keyId } = paramsData;

      const success = await apiKeyManager.revokeApiKey(keyId);
      if (!success) {
        res.status(404).json({
          error: 'API key not found or already revoked',
          timestamp: new Date().toISOString(),
          path: req.path,
          statusCode: 404,
        });
        return;
      }

      res.json({
        message: 'API key revoked successfully',
        keyId,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to revoke API key',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 500,
      });
    }
  });

  app.post('/api-keys/:keyId/rotate', managementRateLimiter, validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, undefined), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { keyId: string } }).validatedParams || req.params;
      const { keyId } = paramsData;
      const gracePeriodMs = typeof req.body?.gracePeriodMs === 'number' && req.body.gracePeriodMs > 0
        ? req.body.gracePeriodMs
        : 1000 * 60 * 60;

      const rotation = await apiKeyManager.rotateApiKey(keyId, { gracePeriodMs });
      if (!rotation) {
        res.status(404).json({
          error: 'API key not found or inactive',
          timestamp: new Date().toISOString(),
          path: req.path,
          statusCode: 404,
        });
        return;
      }

      res.json({
        message: 'API key rotated successfully',
        keyId,
        apiKey: rotation.newApiKey,
        gracePeriodMs,
        graceExpiresAt: new Date(Date.now() + gracePeriodMs).toISOString(),
        metadata: {
          tier: rotation.metadata.tier,
          previousKeyHashes: (rotation.metadata.previousKeyHashes || []).map((previousKey) => ({
            expiresAt: new Date(previousKey.expiresAt).toISOString(),
          })),
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to rotate API key',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 500,
      });
    }
  });

  app.get('/api-keys/:keyId/usage', validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, ApiKeyUsageResponseSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { keyId: string } }).validatedParams || req.params;
      const { keyId } = paramsData;

      const quotaCheck = await apiKeyManager.checkQuota(keyId);
      const keyMetadata = await apiKeyManager.getKeyMetadata(keyId);
      if (!keyMetadata) {
        res.status(404).json({
          error: 'API key not found',
          timestamp: new Date().toISOString(),
          path: req.path,
          statusCode: 404,
        });
        return;
      }

      res.json({
        keyId,
        usage: {
          currentMonth: quotaCheck.usage.currentMonthRequests,
          totalRequests: quotaCheck.usage.totalRequests,
          lastUsed: keyMetadata.lastUsed ? new Date(keyMetadata.lastUsed).toISOString() : undefined,
          quotaLimit: quotaCheck.quota || 0,
          quotaRemaining: Math.max(0, (quotaCheck.quota || 0) - quotaCheck.usage.currentMonthRequests),
          resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
        },
        tier: keyMetadata.tier,
        rateLimit: {
          windowMs: keyMetadata.rateLimit?.windowMs || 60000,
          maxRequests: keyMetadata.rateLimit?.maxRequests || 100,
          algorithm: keyMetadata.rateLimit?.algorithm || 'sliding-window',
        },
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve usage information',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 500,
      });
    }
  });
}
