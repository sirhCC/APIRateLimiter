import { Request, Response, NextFunction } from 'express';
import { ApiKeyManager, ApiKeyMetadata } from '../utils/apiKeys';
import { log } from '../utils/logger';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyMetadata;
      isApiKeyAuthenticated?: boolean;
    }
  }
}

export interface ApiKeyMiddlewareOptions {
  apiKeyManager: ApiKeyManager;
  required?: boolean;
  headerName?: string;
  allowQueryParam?: boolean;
  queryParamName?: string;
  onKeyValidated?: (req: Request, keyMetadata: ApiKeyMetadata) => void;
  onKeyInvalid?: (req: Request, res: Response) => void;
  checkQuota?: boolean;
}

/**
 * Middleware to validate API keys and attach metadata to request
 */
export function createApiKeyMiddleware(options: ApiKeyMiddlewareOptions) {
  const {
    apiKeyManager,
    required = false,
    headerName = 'x-api-key',
    allowQueryParam = false,
    queryParamName = 'api_key',
    onKeyValidated,
    onKeyInvalid,
    checkQuota = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract API key from header or query parameter
      let apiKey = req.headers[headerName] as string;
      
      if (!apiKey && allowQueryParam) {
        apiKey = req.query[queryParamName] as string;
      }

      // If no API key provided
      if (!apiKey) {
        if (required) {
          res.status(401).json({
            error: 'API key required',
            message: `Provide API key in ${headerName} header${allowQueryParam ? ` or ${queryParamName} query parameter` : ''}`,
          });
          return;
        }
        // Continue without API key authentication
        return next();
      }

      // Validate API key
      const keyMetadata = await apiKeyManager.validateApiKey(apiKey);
      
      if (!keyMetadata) {
        if (onKeyInvalid) {
          onKeyInvalid(req, res);
          return;
        }
        
        res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid or has been revoked',
        });
        return;
      }

      // Check quota if enabled
      if (checkQuota) {
        const quotaCheck = await apiKeyManager.checkQuota(keyMetadata.id);
        
        if (!quotaCheck.withinQuota && quotaCheck.quota) {
          res.status(429).json({
            error: 'Quota exceeded',
            message: `Monthly quota of ${quotaCheck.quota} requests exceeded`,
            usage: quotaCheck.usage,
            quota: quotaCheck.quota,
          });
          return;
        }

        // Add quota headers
        if (quotaCheck.quota) {
          res.set({
            'X-Quota-Limit': quotaCheck.quota.toString(),
            'X-Quota-Used': quotaCheck.usage.currentMonthRequests.toString(),
            'X-Quota-Remaining': (quotaCheck.quota - quotaCheck.usage.currentMonthRequests).toString(),
            'X-Quota-Reset': new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
          });
        }
      }

      // Attach API key metadata to request
      req.apiKey = keyMetadata;
      req.isApiKeyAuthenticated = true;

      // Add API key headers
      res.set({
        'X-API-Key-Tier': keyMetadata.tier,
        'X-API-Key-Name': keyMetadata.name,
      });

      // Record usage (async, don't wait)
      apiKeyManager.recordUsage(keyMetadata.id, 1).catch(error => {
        log.system('Failed to record API key usage', {
          error: error instanceof Error ? error.message : String(error),
          keyId: keyMetadata.id,
          severity: 'low' as const
        });
      });

      // Call custom validation callback
      if (onKeyValidated) {
        onKeyValidated(req, keyMetadata);
      }

      next();
    } catch (error) {
      log.system('API key middleware error', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'high' as const,
        metadata: { required }
      });
      
      if (required) {
        res.status(500).json({
          error: 'Authentication service error',
          message: 'Unable to validate API key at this time',
        });
        return;
      }
      
      // Continue without authentication if not required
      next();
    }
  };
}

/**
 * Middleware to require API key authentication
 */
export function requireApiKey(apiKeyManager: ApiKeyManager) {
  return createApiKeyMiddleware({
    apiKeyManager,
    required: true,
    checkQuota: true,
  });
}

/**
 * Middleware for optional API key authentication
 */
export function optionalApiKey(apiKeyManager: ApiKeyManager) {
  return createApiKeyMiddleware({
    apiKeyManager,
    required: false,
    checkQuota: true,
  });
}

/**
 * Middleware to require specific tier
 */
export function requireTier(allowedTiers: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isApiKeyAuthenticated || !req.apiKey) {
      res.status(401).json({
        error: 'API key required',
        message: 'This endpoint requires API key authentication',
      });
      return;
    }

    if (!allowedTiers.includes(req.apiKey.tier)) {
      res.status(403).json({
        error: 'Insufficient tier',
        message: `This endpoint requires one of the following tiers: ${allowedTiers.join(', ')}`,
        currentTier: req.apiKey.tier,
        requiredTiers: allowedTiers,
      });
      return;
    }

    next();
  };
}

/**
 * Get rate limit configuration based on API key
 */
export function getApiKeyRateLimit(req: Request): {
  windowMs: number;
  maxRequests: number;
  algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
  burstCapacity?: number;
} | null {
  if (!req.isApiKeyAuthenticated || !req.apiKey) {
    return null;
  }

  return req.apiKey.rateLimit;
}

/**
 * Generate rate limiting key based on API key
 */
export function generateApiKeyRateLimitKey(req: Request): string {
  if (req.isApiKeyAuthenticated && req.apiKey) {
    return `api_key:${req.apiKey.id}:${req.path}`;
  }
  
  // Fallback to IP-based key
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  return `ip:${ip}:${req.path}`;
}
