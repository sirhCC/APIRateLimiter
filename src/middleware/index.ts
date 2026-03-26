import { Request, Response, NextFunction } from 'express';
import { RedisClient } from '../utils/redis';
import { RateLimitRule, RateLimitConfig } from '../types';
import { createOptimizedRateLimiter } from './optimizedRateLimiter';
import { log } from '../utils/logger';
import { getErrorMessage, sendError } from '../utils/httpErrors';

export interface RateLimitMiddlewareOptions {
  redis: RedisClient;
  rules: RateLimitRule[];
  defaultConfig: RateLimitConfig;
  onLimitReached?: (req: Request, res: Response, rule: RateLimitRule) => void;
  keyGenerator?: (req: Request) => string;
}

export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions) {
  const { redis, rules, defaultConfig, onLimitReached, keyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Find matching rule
      const matchedRule = findMatchingRule(req, rules);
      const config = matchedRule?.config || defaultConfig;

      // Generate key for rate limiting
      const key = generateKey(req, config, keyGenerator);

      const rateLimiter = createOptimizedRateLimiter(redis, {
        windowMs: config.windowMs,
        maxRequests: config.max,
        algorithm: config.algorithm,
        keyGenerator: () => key,
        skipSuccessfulRequests: config.skipSuccessfulRequests,
        skipFailedRequests: config.skipFailedRequests,
        tokensPerInterval: config.algorithm === 'token-bucket'
          ? resolveTokenBucketTokensPerInterval(config)
          : undefined,
        burstCapacity: config.algorithm === 'token-bucket'
          ? resolveTokenBucketBurstCapacity(config)
          : undefined,
        onLimitReached: (currentReq, currentRes) => {
          if (matchedRule) {
            currentRes.set('X-RateLimit-Rule', matchedRule.name);
          }

          if (onLimitReached && matchedRule) {
            onLimitReached(currentReq, currentRes, matchedRule);
          }

          if (config.onLimitReached) {
            config.onLimitReached(currentReq, currentRes);
          }
        },
      });

      return rateLimiter.middleware()(req, res, next);
    } catch (error) {
      log.system('Rate limiting middleware error - failing open', {
        error: getErrorMessage(error),
        severity: 'medium' as const,
        endpoint: req.path,
        method: req.method
      });
      // On error, allow the request to continue (fail open)
      next();
    }
  };
}

function resolveTokenBucketTokensPerInterval(config: RateLimitConfig): number {
  const tokenBucketConfig = config as RateLimitConfig & { refillRate?: number };

  if (typeof tokenBucketConfig.refillRate === 'number' && tokenBucketConfig.refillRate > 0) {
    return Math.max(1, Math.floor((tokenBucketConfig.refillRate * config.windowMs) / 1000));
  }

  return config.max;
}

function resolveTokenBucketBurstCapacity(config: RateLimitConfig): number {
  const tokenBucketConfig = config as RateLimitConfig & { bucketSize?: number };

  if (typeof tokenBucketConfig.bucketSize === 'number' && tokenBucketConfig.bucketSize > 0) {
    return tokenBucketConfig.bucketSize;
  }

  return config.max * 2;
}

function findMatchingRule(req: Request, rules: RateLimitRule[]): RateLimitRule | null {
  // Sort rules by priority (higher priority first)
  const sortedRules = rules
    .filter(rule => rule.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (matchesRule(req, rule)) {
      return rule;
    }
  }

  return null;
}

function matchesRule(req: Request, rule: RateLimitRule): boolean {
  // Check HTTP method
  if (rule.method && rule.method.toLowerCase() !== req.method.toLowerCase()) {
    return false;
  }

  // Check URL pattern
  const pattern = new RegExp(rule.pattern);
  return pattern.test(req.path);
}

function generateKey(req: Request, config: RateLimitConfig, keyGenerator?: (req: Request) => string): string {
  if (config.keyGenerator) {
    return config.keyGenerator(req);
  }

  if (keyGenerator) {
    return keyGenerator(req);
  }

  // Default key generation based on IP address
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  return `rate_limit:${ip}:${req.path}`;
}

export function createResetEndpoint(redis: RedisClient) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      
      if (!key) {
        sendError(res, req, 400, 'Missing key', 'Key parameter is required');
        return;
      }

      const currentWindowStart = Math.floor(Date.now() / 60000) * 60000;

      // Try to delete keys for all algorithms
      const deletePromises = [
        redis.del(key),
        redis.del(`tb:${key}`),
        redis.del(`sw:${key}`),
        redis.del(`fw:${key}`),
        redis.del(`${key}:${currentWindowStart}`),
        redis.del(`fw:${key}:${currentWindowStart}`)
      ];

      await Promise.all(deletePromises);

      res.json({ message: 'Rate limit reset successfully', key });
    } catch (error) {
      log.system('Rate limit reset error', {
        error: getErrorMessage(error),
        severity: 'medium' as const,
        endpoint: req.path,
        method: req.method
      });
      sendError(res, req, 500, 'Internal Server Error', 'Failed to reset rate limit');
    }
  };
}

// Export sensitive endpoint rate limiting
export {
  createSensitiveEndpointLimiter,
  createAuthRateLimiter,
  createApiKeyRateLimiter,
  createRuleManagementRateLimiter,
  createResetRateLimiter,
  createAdminRateLimiter,
  createInfoRateLimiter,
  createAutoSensitiveRateLimiter,
  createSensitiveEndpointLogger,
} from './sensitiveEndpointLimiter';

// Export validation middleware
export {
  validateRequest,
  validateResponse,
  validateData,
  createValidationMiddleware,
  validateJwtEndpoint,
  validateApiKeyEndpoint,
  validateRuleEndpoint,
  validateSystemEndpoint,
} from './validation';
