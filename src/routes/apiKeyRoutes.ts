import { Express, Request, Response, RequestHandler } from 'express';
import { ApiKeyManager } from '../utils/apiKeys';
import { validateApiKeyEndpoint, validateSystemEndpoint } from '../middleware/validation';
import { getErrorMessage, sendError } from '../utils/httpErrors';
import { ERROR_CODES } from '../utils/errorCodes';
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

function serializeApiKeyMetadata(metadata: Awaited<ReturnType<ApiKeyManager['getKeyMetadata']>> extends infer T ? T extends null ? never : T : never) {
  return {
    id: metadata.id,
    name: metadata.name,
    tier: metadata.tier,
    userId: metadata.userId,
    organizationId: metadata.organizationId,
    createdAt: new Date(metadata.created).toISOString(),
    expiresAt: metadata.expiresAt ? new Date(metadata.expiresAt).toISOString() : undefined,
    isActive: metadata.isActive,
    revokedAt: metadata.revokedAt ? new Date(metadata.revokedAt).toISOString() : undefined,
    revokedBy: metadata.revokedBy,
    revocationReason: metadata.revocationReason,
    lastRotatedAt: metadata.lastRotatedAt ? new Date(metadata.lastRotatedAt).toISOString() : undefined,
    metadata: metadata.metadata,
  };
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
      const { name, tier = 'free', userId, organizationId, metadata, expiresAt } = req.body;
      const expiresAtTimestamp = typeof expiresAt === 'string' ? Date.parse(expiresAt) : undefined;

      const result = await apiKeyManager.generateApiKey({
        name,
        tier,
        userId,
        organizationId,
        expiresAt: Number.isFinite(expiresAtTimestamp) ? expiresAtTimestamp : undefined,
        metadata: {
          ...metadata,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
        },
      });

      res.status(201).json({
        message: 'API key generated successfully',
        apiKey: result.apiKey,
        metadata: serializeApiKeyMetadata(result.metadata),
      });
    } catch (error) {
      sendError(res, req, 500, 'API key generation failed', getErrorMessage(error), {
        code: ERROR_CODES.API_KEYS.GENERATION_FAILED,
      });
    }
  });

  app.get('/api-keys', validateApiKeyEndpoint(undefined, ListApiKeysQuerySchema, undefined, undefined), async (req: Request, res: Response): Promise<void> => {
    try {
      const queryData = (req as Request & { validatedQuery?: { userId: string } }).validatedQuery || req.query;
      const userId = typeof queryData.userId === 'string' ? queryData.userId : undefined;

      if (!userId) {
        sendError(res, req, 400, 'Missing userId', 'userId query parameter is required', {
          code: ERROR_CODES.API_KEYS.USER_ID_REQUIRED,
        });
        return;
      }

      const keys = await apiKeyManager.getUserKeys(userId);

      res.json({
        message: 'API keys retrieved',
        keys,
      });
    } catch (error) {
      sendError(res, req, 500, 'API key retrieval failed', getErrorMessage(error), {
        code: ERROR_CODES.API_KEYS.LIST_FAILED,
      });
    }
  });

  app.get('/api-keys/:keyId', validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, undefined), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { keyId: string } }).validatedParams || req.params;
      const { keyId } = paramsData;

      const keyMetadata = await apiKeyManager.getKeyMetadata(keyId);
      if (!keyMetadata) {
        sendError(res, req, 404, 'API key not found', 'The requested API key does not exist', {
          code: ERROR_CODES.API_KEYS.NOT_FOUND,
        });
        return;
      }

      res.json({
        message: 'API key details',
        metadata: keyMetadata,
      });
    } catch (error) {
      sendError(res, req, 500, 'API key lookup failed', getErrorMessage(error), {
        code: ERROR_CODES.API_KEYS.LOOKUP_FAILED,
      });
    }
  });

  app.delete('/api-keys/:keyId', criticalRateLimiter, validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, undefined), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { keyId: string } }).validatedParams || req.params;
      const { keyId } = paramsData;

      const success = await apiKeyManager.revokeApiKey(keyId, {
        revokedBy: req.user?.id || req.apiKey?.id || req.ip,
        reason: typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim()
          : undefined,
      });
      if (!success) {
        sendError(res, req, 404, 'API key not found', 'API key not found or already revoked', {
          code: ERROR_CODES.API_KEYS.NOT_FOUND,
        });
        return;
      }

      res.json({
        message: 'API key revoked successfully',
        keyId,
      });
    } catch (error) {
      sendError(res, req, 500, 'API key revoke failed', getErrorMessage(error), {
        code: ERROR_CODES.API_KEYS.REVOKE_FAILED,
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
        sendError(res, req, 404, 'API key not found', 'API key not found or inactive', {
          code: ERROR_CODES.API_KEYS.NOT_FOUND,
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
      sendError(res, req, 500, 'API key rotation failed', getErrorMessage(error), {
        code: ERROR_CODES.API_KEYS.ROTATION_FAILED,
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
        sendError(res, req, 404, 'API key not found', 'The requested API key does not exist', {
          code: ERROR_CODES.API_KEYS.NOT_FOUND,
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
      sendError(res, req, 500, 'API key usage lookup failed', getErrorMessage(error), {
        code: ERROR_CODES.API_KEYS.USAGE_FAILED,
      });
    }
  });
}
