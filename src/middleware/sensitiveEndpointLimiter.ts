import { Request, Response, NextFunction } from 'express';
import { RedisClient } from '../utils/redis';
import { createOptimizedRateLimiter } from './optimizedRateLimiter';

/**
 * Sensitive Endpoint Rate Limiting Middleware
 * 
 * Provides specialized rate limiting for sensitive endpoints with stricter limits
 * to prevent abuse, brute force attacks, and unauthorized access attempts.
 */

interface SensitiveEndpointConfig {
  windowMs: number;
  maxRequests: number;
  algorithm: 'sliding-window' | 'token-bucket' | 'fixed-window';
  burstCapacity?: number;
  description: string;
}

// Rate limiting configurations for different sensitivity levels
const SENSITIVE_ENDPOINT_CONFIGS = {
  // Critical endpoints - very strict limits
  critical: {
    windowMs: 60000, // 1 minute
    maxRequests: 5, // Only 5 attempts per minute
    algorithm: 'sliding-window' as const,
    description: 'Critical endpoint protection (5 req/min)',
  },
  
  // Authentication endpoints - brute force protection
  auth: {
    windowMs: 300000, // 5 minutes
    maxRequests: 10, // 10 login attempts per 5 minutes
    algorithm: 'sliding-window' as const,
    description: 'Authentication protection (10 req/5min)',
  },
  
  // Management endpoints - moderate restriction
  management: {
    windowMs: 60000, // 1 minute
    maxRequests: 20, // 20 requests per minute
    algorithm: 'token-bucket' as const,
    burstCapacity: 5,
    description: 'Management endpoint protection (20 req/min)',
  },
  
  // Information endpoints - light restriction
  info: {
    windowMs: 60000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    algorithm: 'token-bucket' as const,
    burstCapacity: 20,
    description: 'Information endpoint protection (100 req/min)',
  },
} as const;

/**
 * Creates a rate limiter for sensitive endpoints
 */
export function createSensitiveEndpointLimiter(
  redis: RedisClient,
  level: keyof typeof SENSITIVE_ENDPOINT_CONFIGS,
  customKeyGenerator?: (req: Request) => string
) {
  const config = SENSITIVE_ENDPOINT_CONFIGS[level];
  
  const keyGenerator = customKeyGenerator || ((req: Request) => {
    // Use IP for anonymous users, API key for authenticated users
    const identifier = req.apiKey?.id || req.user?.id || req.ip;
    return `sensitive:${level}:${identifier}:${req.route?.path || req.path}`;
  });

  const rateLimiter = createOptimizedRateLimiter(redis, {
    windowMs: config.windowMs,
    maxRequests: config.maxRequests,
    algorithm: config.algorithm,
    burstCapacity: 'burstCapacity' in config ? config.burstCapacity : undefined,
    keyGenerator,
    onLimitReached: (req, res) => {
      const identifier = req.apiKey?.name || req.user?.email || req.ip;
      console.warn(`🚨 Sensitive endpoint rate limit exceeded: ${identifier} - ${req.method} ${req.path} (${config.description})`);
      
      // Add security headers
      res.set({
        'X-RateLimit-Type': 'sensitive-endpoint',
        'X-RateLimit-Level': level,
        'X-RateLimit-Description': config.description,
        'Retry-After': Math.ceil(config.windowMs / 1000).toString(),
      });
    },
  });

  return rateLimiter.middleware();
}

/**
 * Authentication endpoint rate limiter (brute force protection)
 */
export function createAuthRateLimiter(redis: RedisClient) {
  return createSensitiveEndpointLimiter(redis, 'auth', (req: Request) => {
    // For login attempts, use email + IP to prevent distributed brute force
    const email = req.body?.email || 'unknown';
    return `auth:login:${email}:${req.ip}`;
  });
}

/**
 * API key management rate limiter
 */
export function createApiKeyRateLimiter(redis: RedisClient) {
  return createSensitiveEndpointLimiter(redis, 'management', (req: Request) => {
    const userId = req.body?.userId || req.query?.userId || req.user?.id || req.ip;
    return `api-key-mgmt:${userId}:${req.method}`;
  });
}

/**
 * Rule management rate limiter
 */
export function createRuleManagementRateLimiter(redis: RedisClient) {
  return createSensitiveEndpointLimiter(redis, 'critical', (req: Request) => {
    const identifier = req.user?.id || req.apiKey?.id || req.ip;
    return `rule-mgmt:${identifier}:${req.method}`;
  });
}

/**
 * Reset operations rate limiter
 */
export function createResetRateLimiter(redis: RedisClient) {
  return createSensitiveEndpointLimiter(redis, 'critical', (req: Request) => {
    const identifier = req.user?.id || req.apiKey?.id || req.ip;
    const target = req.params?.key || 'stats';
    return `reset:${identifier}:${target}`;
  });
}

/**
 * Admin endpoint rate limiter
 */
export function createAdminRateLimiter(redis: RedisClient) {
  return createSensitiveEndpointLimiter(redis, 'management', (req: Request) => {
    const adminId = req.user?.id || req.ip;
    return `admin:${adminId}:${req.path}`;
  });
}

/**
 * Information endpoint rate limiter
 */
export function createInfoRateLimiter(redis: RedisClient) {
  return createSensitiveEndpointLimiter(redis, 'info');
}

/**
 * Global sensitive endpoint protection middleware
 * Automatically applies appropriate rate limiting based on the request path
 */
export function createAutoSensitiveRateLimiter(redis: RedisClient) {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    const method = req.method;

    // Critical endpoints
    if (
      (path.startsWith('/rules') && (method === 'POST' || method === 'DELETE')) ||
      (path.startsWith('/reset/') && method === 'POST') ||
      (path === '/stats/reset' && method === 'POST')
    ) {
      return createRuleManagementRateLimiter(redis)(req, res, next);
    }

    // Authentication endpoints
    if (path === '/auth/login' && method === 'POST') {
      return createAuthRateLimiter(redis)(req, res, next);
    }

    // API key management endpoints
    if (path.startsWith('/api-keys') && (method === 'POST' || method === 'DELETE')) {
      return createApiKeyRateLimiter(redis)(req, res, next);
    }

    // Admin endpoints
    if (path.startsWith('/admin/')) {
      return createAdminRateLimiter(redis)(req, res, next);
    }

    // Management endpoints (moderate protection)
    if (
      (path.startsWith('/api-keys') && method === 'GET') ||
      path === '/auth/verify' ||
      path.startsWith('/premium/') ||
      path.startsWith('/secure/')
    ) {
      return createSensitiveEndpointLimiter(redis, 'management')(req, res, next);
    }

    // Information endpoints (light protection)
    if (
      path === '/config' ||
      path === '/api-keys/tiers' ||
      path === '/stats' ||
      path === '/performance' ||
      path === '/metrics/export'
    ) {
      return createInfoRateLimiter(redis)(req, res, next);
    }

    // No specific rate limiting for this endpoint
    return next();
  };
}

/**
 * Enhanced logging for sensitive endpoint access
 */
export function createSensitiveEndpointLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    const method = req.method;
    const identifier = req.apiKey?.name || req.user?.email || req.ip;

    // Log access to sensitive endpoints
    const isSensitive = 
      path.startsWith('/auth/') ||
      path.startsWith('/api-keys') ||
      path.startsWith('/rules') ||
      path.startsWith('/admin/') ||
      path.startsWith('/reset/') ||
      path === '/stats/reset';

    if (isSensitive) {
      console.log(`🔐 Sensitive endpoint access: ${identifier} - ${method} ${path} - ${new Date().toISOString()}`);
      
      // Add security audit trail header
      res.set('X-Security-Audit', 'logged');
    }

    next();
  };
}

export default {
  createSensitiveEndpointLimiter,
  createAuthRateLimiter,
  createApiKeyRateLimiter,
  createRuleManagementRateLimiter,
  createResetRateLimiter,
  createAdminRateLimiter,
  createInfoRateLimiter,
  createAutoSensitiveRateLimiter,
  createSensitiveEndpointLogger,
};
