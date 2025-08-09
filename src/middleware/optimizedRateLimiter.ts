import { Request, Response, NextFunction } from 'express';
import { RedisClient } from '../utils/redis.js';
import { log } from '../utils/logger';
import { rateLimitDecisionDuration, rateLimitRequestsTotal } from '../utils/metrics';

export interface OptimizedRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: Request, res: Response) => void;
  // Token bucket specific options
  tokensPerInterval?: number;
  burstCapacity?: number;
}

/**
 * High-performance rate limiter using optimized Redis operations
 */
export class OptimizedRateLimiter {
  private redis: RedisClient;
  private config: OptimizedRateLimitConfig;

  constructor(redis: RedisClient, config: OptimizedRateLimitConfig) {
    this.redis = redis;
    this.config = {
      keyGenerator: (req) => `rate_limit:${req.ip}`,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      tokensPerInterval: config.maxRequests,
      burstCapacity: config.maxRequests * 2,
      ...config,
    };
  }

  /**
   * Create Express middleware
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
  const key = this.config.keyGenerator!(req);
  const endTimer = rateLimitDecisionDuration.startTimer({ algorithm: this.config.algorithm });
  const source = req.apiKey ? 'apiKey' : (req.isJWTAuthenticated ? 'jwt' : 'ip');
      
      try {
        let result: { allowed: boolean; remaining: number; tokensRemaining?: number };

        switch (this.config.algorithm) {
          case 'token-bucket':
            const tokenResult = await this.redis.tokenBucket(
              key,
              this.config.burstCapacity!,
              this.config.tokensPerInterval!,
              this.config.windowMs
            );
            result = {
              allowed: tokenResult.allowed,
              remaining: tokenResult.remainingTokens,
              tokensRemaining: tokenResult.remainingTokens
            };
            break;

          case 'sliding-window':
            const slidingResult = await this.redis.slidingWindow(
              key,
              this.config.windowMs,
              this.config.maxRequests
            );
            result = {
              allowed: slidingResult.allowed,
              remaining: slidingResult.remainingRequests
            };
            break;

          case 'fixed-window':
            const fixedResult = await this.redis.fixedWindow(
              key,
              this.config.maxRequests,
              this.config.windowMs
            );
            result = {
              allowed: fixedResult.allowed,
              remaining: fixedResult.remainingRequests
            };
            break;

          default:
            throw new Error(`Unknown algorithm: ${this.config.algorithm}`);
        }

        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': this.config.maxRequests.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': new Date(Date.now() + this.config.windowMs).toISOString(),
          'X-RateLimit-Algorithm': this.config.algorithm,
          // Draft standard header (IETF RateLimit Fields)
          // Format: limit;w=window, remaining;w=window, reset=seconds
          'RateLimit-Policy': `${this.config.maxRequests};w=${Math.ceil(this.config.windowMs/1000)};type=${this.config.algorithm}`,
          'RateLimit-Limit': this.config.maxRequests.toString(),
          'RateLimit-Remaining': result.remaining.toString(),
          'RateLimit-Reset': Math.ceil(this.config.windowMs/1000).toString(),
        });

        if (result.tokensRemaining !== undefined) {
          res.set('X-RateLimit-Tokens', result.tokensRemaining.toString());
        }

        if (!result.allowed) {
          rateLimitRequestsTotal.inc({ algorithm: this.config.algorithm, outcome: 'block', source });
          const retryAfterSeconds = Math.ceil(this.config.windowMs / 1000);
          res.status(429).set({
            'Retry-After': retryAfterSeconds.toString(),
            'RateLimit-Reset': retryAfterSeconds.toString(),
            'RateLimit-Remaining': '0',
            'X-RateLimit-Remaining': '0'
          });
          
          if (this.config.onLimitReached) {
            this.config.onLimitReached(req, res);
          } else {
            res.json({
              error: 'Too Many Requests',
              message: `Rate limit exceeded. Try again in ${Math.ceil(this.config.windowMs / 1000)} seconds.`,
              retryAfter: Math.ceil(this.config.windowMs / 1000),
            });
          }
          return;
        }

        rateLimitRequestsTotal.inc({ algorithm: this.config.algorithm, outcome: 'allow', source });
        next();
      } catch (error) {
        log.system('Rate limiter middleware error - failing open', {
          error: error instanceof Error ? error.message : String(error),
          algorithm: this.config.algorithm,
          severity: 'medium' as const
        });
        rateLimitRequestsTotal.inc({ algorithm: this.config.algorithm, outcome: 'error', source });
        // Fail open - allow request if rate limiter fails
        next();
      }
      finally {
        endTimer();
      }
    };
  }

  /**
   * Check rate limit without consuming quota
   */
  async check(identifier: string): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const key = `rate_limit:${identifier}`;
    
    try {
      // This is a simplified check - in production you might want to implement
      // a separate Lua script for checking without consuming
      const ttl = await this.redis.ttl(key);
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : this.config.windowMs));
      
      // For now, return optimistic result
      return {
        allowed: true,
        remaining: Math.floor(this.config.maxRequests / 2), // Estimate
        resetTime,
      };
    } catch (error) {
      log.system('Rate limit check error - using fallback', {
        error: error instanceof Error ? error.message : String(error),
        algorithm: this.config.algorithm,
        severity: 'medium' as const,
        fallback: true
      });
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: new Date(Date.now() + this.config.windowMs),
      };
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string): Promise<boolean> {
    const key = `rate_limit:${identifier}`;
    return await this.redis.del(key);
  }

  /**
   * Get current stats for identifier
   */
  async getStats(identifier: string): Promise<{
    current: number;
    limit: number;
    remaining: number;
    resetTime: Date;
    algorithm: string;
  }> {
    const key = `rate_limit:${identifier}`;
    
    try {
      const ttl = await this.redis.ttl(key);
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : this.config.windowMs));
      
      // Get current count based on algorithm
      let current = 0;
      let remaining = this.config.maxRequests;
      
      switch (this.config.algorithm) {
        case 'fixed-window':
          const windowKey = `${key}:${Math.floor(Date.now() / this.config.windowMs)}`;
          const count = await this.redis.get(windowKey);
          current = count ? parseInt(count) : 0;
          remaining = Math.max(0, this.config.maxRequests - current);
          break;
          
        case 'sliding-window':
          current = await this.redis.zcard(key);
          remaining = Math.max(0, this.config.maxRequests - current);
          break;
          
        case 'token-bucket':
          // For token bucket, we'd need to check the stored tokens
          remaining = Math.floor(this.config.maxRequests / 2); // Estimate
          current = this.config.maxRequests - remaining;
          break;
      }
      
      return {
        current,
        limit: this.config.maxRequests,
        remaining,
        resetTime,
        algorithm: this.config.algorithm,
      };
    } catch (error) {
      log.system('Rate limit stats retrieval error - using fallback', {
        error: error instanceof Error ? error.message : String(error),
        algorithm: this.config.algorithm,
        severity: 'low' as const,
        fallback: true
      });
      return {
        current: 0,
        limit: this.config.maxRequests,
        remaining: this.config.maxRequests,
        resetTime: new Date(Date.now() + this.config.windowMs),
        algorithm: this.config.algorithm,
      };
    }
  }
}

/**
 * Factory function to create optimized rate limiters
 */
export function createOptimizedRateLimiter(
  redis: RedisClient,
  config: OptimizedRateLimitConfig
): OptimizedRateLimiter {
  return new OptimizedRateLimiter(redis, config);
}

/**
 * Preset configurations for common use cases
 */
export const RateLimitPresets = {
  // API endpoints
  strict: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    algorithm: 'sliding-window' as const,
  },
  
  // General web traffic
  moderate: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    algorithm: 'token-bucket' as const,
    tokensPerInterval: 100,
    burstCapacity: 150,
  },
  
  // File uploads or heavy operations
  heavy: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    algorithm: 'fixed-window' as const,
  },
  
  // Burst-friendly for user interactions
  interactive: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200,
    algorithm: 'token-bucket' as const,
    tokensPerInterval: 200,
    burstCapacity: 300,
  },
} as const;
