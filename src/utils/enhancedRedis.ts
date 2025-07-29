import { RedisClient } from '../utils/redis';

/**
 * In-memory rate limiter fallback when Redis is unavailable
 * 
 * This provides basic rate limiting functionality using in-memory storage
 * for development and testing when Redis is not available.
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
  tokens?: number;
  lastRefill?: number;
}

class InMemoryRateLimiter {
  private store: Map<string, RateLimitRecord> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (record.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  async tokenBucket(
    key: string,
    capacity: number,
    tokensPerInterval: number,
    intervalMs: number
  ): Promise<{ allowed: boolean; remainingTokens: number }> {
    const now = Date.now();
    const record = this.store.get(key) || {
      count: 0,
      resetTime: now + intervalMs,
      tokens: capacity,
      lastRefill: now
    };

    // Calculate tokens to add based on elapsed time
    const elapsed = Math.max(0, now - (record.lastRefill || now));
    const tokensToAdd = Math.floor(elapsed * tokensPerInterval / intervalMs);
    const currentTokens = Math.min(capacity, (record.tokens || capacity) + tokensToAdd);

    if (currentTokens >= 1) {
      // Allow request and consume token
      const newTokens = currentTokens - 1;
      this.store.set(key, {
        ...record,
        tokens: newTokens,
        lastRefill: now,
        resetTime: now + intervalMs
      });
      return { allowed: true, remainingTokens: newTokens };
    } else {
      // Deny request
      this.store.set(key, {
        ...record,
        tokens: currentTokens,
        lastRefill: now,
        resetTime: now + intervalMs
      });
      return { allowed: false, remainingTokens: currentTokens };
    }
  }

  async slidingWindow(
    key: string,
    windowMs: number,
    limit: number
  ): Promise<{ allowed: boolean; remainingRequests: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // For simplicity, we'll approximate sliding window with fixed window
    // In a real implementation, you'd use a more sophisticated algorithm
    const record = this.store.get(key) || {
      count: 0,
      resetTime: now + windowMs
    };

    // Reset if window has passed
    if (record.resetTime <= now) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }

    if (record.count < limit) {
      // Allow request
      record.count++;
      this.store.set(key, record);
      return { allowed: true, remainingRequests: limit - record.count };
    } else {
      // Deny request
      return { allowed: false, remainingRequests: 0 };
    }
  }

  async fixedWindow(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remainingRequests: number; resetTime: number }> {
    const now = Date.now();
    const record = this.store.get(key) || {
      count: 0,
      resetTime: now + windowMs
    };

    // Reset if window has passed
    if (record.resetTime <= now) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }

    if (record.count < limit) {
      // Allow request
      record.count++;
      this.store.set(key, record);
      return { 
        allowed: true, 
        remainingRequests: limit - record.count,
        resetTime: record.resetTime
      };
    } else {
      // Deny request
      return { 
        allowed: false, 
        remainingRequests: 0,
        resetTime: record.resetTime
      };
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Global instance for in-memory rate limiting
let inMemoryLimiter: InMemoryRateLimiter | null = null;

function getInMemoryLimiter(): InMemoryRateLimiter {
  if (!inMemoryLimiter) {
    inMemoryLimiter = new InMemoryRateLimiter();
    console.log('🧠 In-memory rate limiter initialized for Redis fallback');
  }
  return inMemoryLimiter;
}

/**
 * Enhanced Redis client with proper in-memory fallback
 */
export class EnhancedRedisClient {
  private redis: RedisClient;
  private inMemory: InMemoryRateLimiter;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.inMemory = getInMemoryLimiter();
  }

  async tokenBucket(
    key: string,
    capacity: number,
    tokensPerInterval: number,
    intervalMs: number
  ): Promise<{ allowed: boolean; remainingTokens: number }> {
    try {
      // Try Redis first
      if (this.redis.isHealthy()) {
        return await this.redis.tokenBucket(key, capacity, tokensPerInterval, intervalMs);
      }
    } catch (error) {
      console.warn('Redis token bucket failed, using in-memory fallback:', error instanceof Error ? error.message : String(error));
    }

    // Fall back to in-memory
    return await this.inMemory.tokenBucket(key, capacity, tokensPerInterval, intervalMs);
  }

  async slidingWindow(
    key: string,
    windowMs: number,
    limit: number
  ): Promise<{ allowed: boolean; remainingRequests: number }> {
    try {
      // Try Redis first
      if (this.redis.isHealthy()) {
        return await this.redis.slidingWindow(key, windowMs, limit);
      }
    } catch (error) {
      console.warn('Redis sliding window failed, using in-memory fallback:', error instanceof Error ? error.message : String(error));
    }

    // Fall back to in-memory
    return await this.inMemory.slidingWindow(key, windowMs, limit);
  }

  async fixedWindow(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remainingRequests: number; resetTime: number }> {
    try {
      // Try Redis first
      if (this.redis.isHealthy()) {
        return await this.redis.fixedWindow(key, limit, windowMs);
      }
    } catch (error) {
      console.warn('Redis fixed window failed, using in-memory fallback:', error instanceof Error ? error.message : String(error));
    }

    // Fall back to in-memory
    return await this.inMemory.fixedWindow(key, limit, windowMs);
  }

  // Delegate other methods to original Redis client
  isHealthy(): boolean {
    return this.redis.isHealthy();
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    return await this.redis.set(key, value, ttlSeconds);
  }

  async del(key: string): Promise<number> {
    return await this.redis.del(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }

  async disconnect(): Promise<void> {
    if (this.inMemory) {
      this.inMemory.destroy();
    }
    return await this.redis.disconnect();
  }
}

export { InMemoryRateLimiter, getInMemoryLimiter };
