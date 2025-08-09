import { Request, Response, NextFunction } from 'express';
import { RedisClient } from '../utils/redis';
import { RateLimitRule, RateLimitConfig } from '../types';
import { createRateLimiter } from './rateLimiter';
import { log } from '../utils/logger';

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

      // Create rate limiter based on algorithm
      const rateLimiter = createRateLimiter(redis, config);

      // Check rate limit
      const { allowed, stats } = await rateLimiter.checkLimit(key);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': config.max.toString(),
        'X-RateLimit-Remaining': stats.remainingRequests.toString(),
        'X-RateLimit-Reset': new Date(stats.resetTime).toISOString(),
        'X-RateLimit-Window': config.windowMs.toString(),
        'X-RateLimit-Algorithm': config.algorithm,
  // Standard draft headers (IETF RateLimit Fields)
  'RateLimit-Policy': `${config.max};w=${Math.ceil(config.windowMs/1000)};type=${config.algorithm}`,
  'RateLimit-Limit': config.max.toString(),
  'RateLimit-Remaining': stats.remainingRequests.toString(),
  'RateLimit-Reset': Math.ceil((stats.resetTime - Date.now()) / 1000).toString(),
      });

      if (matchedRule) {
        res.set('X-RateLimit-Rule', matchedRule.name);
      }

      if (!allowed) {
        // Rate limit exceeded
        if (onLimitReached && matchedRule) {
          onLimitReached(req, res, matchedRule);
        }

        if (config.onLimitReached) {
          config.onLimitReached(req, res);
        }

        res.status(429).set({
          'Retry-After': Math.ceil((stats.resetTime - Date.now()) / 1000).toString(),
          'RateLimit-Remaining': '0',
          'X-RateLimit-Remaining': '0',
          'RateLimit-Reset': Math.ceil((stats.resetTime - Date.now()) / 1000).toString(),
        }).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil((stats.resetTime - Date.now()) / 1000),
          limit: config.max,
          windowMs: config.windowMs,
          algorithm: config.algorithm
        });
        return;
      }

      // Request allowed, continue
      next();
    } catch (error) {
      log.system('Rate limiting middleware error - failing open', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'medium' as const,
        endpoint: req.path,
        method: req.method
      });
      // On error, allow the request to continue (fail open)
      next();
    }
  };
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
        res.status(400).json({ error: 'Key parameter is required' });
        return;
      }

      // Try to delete keys for all algorithms
      const deletePromises = [
        redis.del(`tb:${key}`),
        redis.del(`sw:${key}`),
        redis.del(`fw:${key}`)
      ];

      await Promise.all(deletePromises);

      res.json({ message: 'Rate limit reset successfully', key });
    } catch (error) {
      log.system('Rate limit reset error', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'medium' as const,
        endpoint: req.path,
        method: req.method
      });
      res.status(500).json({ error: 'Internal server error' });
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
