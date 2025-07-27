import { RedisClient } from '../utils/redis';
import { RateLimitConfig, TokenBucketConfig, SlidingWindowConfig, FixedWindowConfig, RateLimitStats } from '../types';

export abstract class RateLimiter {
  protected redis: RedisClient;
  protected config: RateLimitConfig;

  constructor(redis: RedisClient, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  abstract checkLimit(key: string): Promise<{ allowed: boolean; stats: RateLimitStats }>;
  abstract reset(key: string): Promise<void>;
}

export class TokenBucketLimiter extends RateLimiter {
  protected config: TokenBucketConfig;

  constructor(redis: RedisClient, config: TokenBucketConfig) {
    super(redis, config);
    this.config = config;
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; stats: RateLimitStats }> {
    const bucketKey = `tb:${key}`;
    const now = Date.now();
    
    // Get current bucket state
    const bucketData = await this.redis.get(bucketKey);
    let tokens: number;
    let lastRefill: number;

    if (bucketData) {
      const parsed = JSON.parse(bucketData);
      tokens = parsed.tokens;
      lastRefill = parsed.lastRefill;
    } else {
      tokens = this.config.bucketSize;
      lastRefill = now;
    }

    // Calculate tokens to add based on time elapsed
    const timePassed = (now - lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = Math.floor(timePassed * this.config.refillRate);
    tokens = Math.min(this.config.bucketSize, tokens + tokensToAdd);

    const allowed = tokens > 0;
    if (allowed) {
      tokens -= 1;
    }

    // Update bucket state
    const newBucketData = {
      tokens,
      lastRefill: now
    };
    
    await this.redis.set(bucketKey, JSON.stringify(newBucketData), Math.ceil(this.config.windowMs / 1000));

    const stats: RateLimitStats = {
      totalRequests: 0, // Not tracked in token bucket
      blockedRequests: 0,
      allowedRequests: 0,
      resetTime: now + ((this.config.bucketSize - tokens) / this.config.refillRate) * 1000,
      windowStart: lastRefill,
      remainingRequests: tokens
    };

    return { allowed, stats };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`tb:${key}`);
  }
}

export class SlidingWindowLimiter extends RateLimiter {
  protected config: SlidingWindowConfig;

  constructor(redis: RedisClient, config: SlidingWindowConfig) {
    super(redis, config);
    this.config = config;
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; stats: RateLimitStats }> {
    const windowKey = `sw:${key}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Remove old entries
    await this.redis.zremrangebyscore(windowKey, 0, windowStart);

    // Count current requests
    const currentCount = await this.redis.zcard(windowKey);
    const allowed = currentCount < this.config.max;

    if (allowed) {
      // Add current request
      await this.redis.zadd(windowKey, now, `${now}-${Math.random()}`);
      await this.redis.expire(windowKey, Math.ceil(this.config.windowMs / 1000));
    }

    const stats: RateLimitStats = {
      totalRequests: currentCount + (allowed ? 1 : 0),
      blockedRequests: allowed ? 0 : 1,
      allowedRequests: allowed ? currentCount + 1 : currentCount,
      resetTime: now + this.config.windowMs,
      windowStart,
      remainingRequests: Math.max(0, this.config.max - currentCount - (allowed ? 1 : 0))
    };

    return { allowed, stats };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`sw:${key}`);
  }
}

export class FixedWindowLimiter extends RateLimiter {
  protected config: FixedWindowConfig;

  constructor(redis: RedisClient, config: FixedWindowConfig) {
    super(redis, config);
    this.config = config;
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; stats: RateLimitStats }> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const windowKey = `fw:${key}:${windowStart}`;

    const currentCount = await this.redis.incr(windowKey);
    
    if (currentCount === 1) {
      // First request in this window, set expiration
      await this.redis.expire(windowKey, Math.ceil(this.config.windowMs / 1000));
    }

    const allowed = currentCount <= this.config.max;

    const stats: RateLimitStats = {
      totalRequests: currentCount,
      blockedRequests: allowed ? 0 : 1,
      allowedRequests: allowed ? currentCount : currentCount - 1,
      resetTime: windowStart + this.config.windowMs,
      windowStart,
      remainingRequests: Math.max(0, this.config.max - currentCount)
    };

    return { allowed, stats };
  }

  async reset(key: string): Promise<void> {
    const now = Date.now();
    const windowStart = Math.floor(now / this.config.windowMs) * this.config.windowMs;
    const windowKey = `fw:${key}:${windowStart}`;
    await this.redis.del(windowKey);
  }
}

export function createRateLimiter(redis: RedisClient, config: RateLimitConfig): RateLimiter {
  switch (config.algorithm) {
    case 'token-bucket':
      return new TokenBucketLimiter(redis, config as TokenBucketConfig);
    case 'sliding-window':
      return new SlidingWindowLimiter(redis, config as SlidingWindowConfig);
    case 'fixed-window':
      return new FixedWindowLimiter(redis, config as FixedWindowConfig);
    default:
      throw new Error(`Unsupported rate limiting algorithm: ${config.algorithm}`);
  }
}
