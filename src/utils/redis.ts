import Redis from 'ioredis';
import { inMemoryRateLimit } from './inMemoryRateLimit';
import { redisFallbackTotal, setRedisUp, setCircuitBreaker } from './metrics';

/**
 * High-performance Redis client with connection pooling and Lua scripts
 */
export class RedisClient {
  private client: Redis | null = null;
  private isConnected: boolean = false;
  private isEnabled: boolean = true;
  private luaScripts: Map<string, string> = new Map();
  private consecutiveFailures = 0;
  private circuitBreakerOpen = false;
  private circuitBreakerThreshold = 5;
  private circuitBreakerResetAfterMs = 30000; // 30s
  private lastFailureTime = 0;
  private lastPingLatency: number | null = null;
  private lastPingAt = 0;
  private pingCacheMs = 5000;

  constructor(config: { host: string; port: number; password?: string; db?: number; enabled?: boolean }) {
    this.isEnabled = config.enabled !== false;
    
    if (this.isEnabled) {
      this.client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db || 0,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 10000,
        commandTimeout: 5000,
        family: 4,
        keepAlive: 30000,
        enableAutoPipelining: true,
      });

      this.client.on('connect', () => {
        console.log('✅ Connected to Redis');
        this.isConnected = true;
        this.consecutiveFailures = 0;
        this.circuitBreakerOpen = false;
        setCircuitBreaker(false);
        setRedisUp(true);
      });

      this.client.on('error', (error) => {
        console.error('❌ Redis connection error:', error);
        this.isConnected = false;
        this.registerFailure('error');
      });

      this.client.on('close', () => {
        console.log('📡 Redis connection closed');
        this.isConnected = false;
        this.registerFailure('close');
      });

      this.setupLuaScripts();
    } else {
  console.log('⚠️  Redis client disabled - using in-memory fallback');
  setRedisUp(false);
    }
  }

  private isRedisAvailable(): boolean {
    if (!this.isEnabled) return false;
    // Circuit breaker logic: if open, check if reset window passed
    if (this.circuitBreakerOpen) {
      if (Date.now() - this.lastFailureTime > this.circuitBreakerResetAfterMs) {
        this.circuitBreakerOpen = false;
        setCircuitBreaker(false);
        this.consecutiveFailures = 0;
      } else {
        return false;
      }
    }
    return this.client !== null && this.isConnected;
  }

  private async executeRedisOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.isRedisAvailable()) {
      redisFallbackTotal.inc({ reason: this.circuitBreakerOpen ? 'circuit_open' : 'unavailable' });
      setRedisUp(false);
      return fallback;
    }

    try {
      const result = await operation();
      // Success resets failure count
      this.consecutiveFailures = 0;
      setRedisUp(true);
      return result;
    } catch (error) {
      console.error('Redis operation failed:', error);
      this.registerFailure('op_error');
      redisFallbackTotal.inc({ reason: 'operation_error' });
      setRedisUp(false);
      return fallback;
    }
  }

  private registerFailure(reason: string) {
    this.lastFailureTime = Date.now();
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.circuitBreakerThreshold && !this.circuitBreakerOpen) {
      this.circuitBreakerOpen = true;
      setCircuitBreaker(true);
      redisFallbackTotal.inc({ reason: 'circuit_open' });
    }
  }

  private setupLuaScripts(): void {
    this.luaScripts.set('tokenBucket', `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local tokens = tonumber(ARGV[2])
      local interval = tonumber(ARGV[3])
      local requested = tonumber(ARGV[4])
      local now = tonumber(ARGV[5])

      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local current_tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now

      local elapsed = math.max(0, now - last_refill)
      local tokens_to_add = math.floor(elapsed * tokens / interval)
      current_tokens = math.min(capacity, current_tokens + tokens_to_add)

      if current_tokens >= requested then
        current_tokens = current_tokens - requested
        redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, math.ceil(capacity / tokens * interval / 1000) + 1)
        return {1, current_tokens}
      else
        redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', now)
        redis.call('EXPIRE', key, math.ceil(capacity / tokens * interval / 1000) + 1)
        return {0, current_tokens}
      end
    `);

    this.luaScripts.set('slidingWindow', `
      local key = KEYS[1]
      local window = tonumber(ARGV[1])
      local limit = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local uuid = ARGV[4]

      redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
      local current = redis.call('ZCARD', key)
      
      if current < limit then
        redis.call('ZADD', key, now, uuid)
        redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
        return {1, limit - current - 1}
      else
        return {0, 0}
      end
    `);

    this.luaScripts.set('fixedWindow', `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local window_start = math.floor(now / window) * window
      local window_key = key .. ':' .. window_start
      local current = tonumber(redis.call('GET', window_key)) or 0

      if current < limit then
        local new_count = redis.call('INCR', window_key)
        redis.call('EXPIRE', window_key, math.ceil(window / 1000) + 1)
        return {1, limit - new_count, window_start + window}
      else
        return {0, 0, window_start + window}
      end
    `);
  }

  isHealthy(): boolean {
  return this.isRedisAvailable();
  }

  /**
   * Lightweight status snapshot for readiness probes.
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      connected: this.isConnected,
      healthy: this.isHealthy(),
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime || null,
      lastPingLatency: this.lastPingLatency,
    };
  }

  /**
   * Measure Redis PING latency (cached for a few seconds to avoid thundering herd).
   */
  async pingLatency(): Promise<number | null> {
    const now = Date.now();
    if (now - this.lastPingAt < this.pingCacheMs && this.lastPingLatency !== null) {
      return this.lastPingLatency;
    }
    if (!this.isRedisAvailable()) return null;
    try {
      const start = Date.now();
      await this.client!.ping();
      this.lastPingLatency = Date.now() - start;
      this.lastPingAt = now;
      return this.lastPingLatency;
    } catch (_e) {
      this.registerFailure('ping');
      return null;
    }
  }

  async tokenBucket(key: string, capacity: number, tokens: number, intervalMs: number): Promise<{ allowed: boolean; remainingTokens: number }> {
    return this.executeRedisOperation(
      async () => {
        const result = await this.client!.eval(
          this.luaScripts.get('tokenBucket')!,
          1,
          key,
          capacity,
          tokens,
          intervalMs,
          Date.now()
        ) as [number, number];
        
        return {
          allowed: result[0] === 1,
          remainingTokens: result[1]
        };
      },
      inMemoryRateLimit.tokenBucket(key, capacity, tokens, intervalMs)
    );
  }

  async slidingWindow(key: string, windowMs: number, limit: number): Promise<{ allowed: boolean; remainingRequests: number }> {
    return this.executeRedisOperation(
      async () => {
        const uuid = `${Date.now()}-${Math.random()}`;
        const result = await this.client!.eval(
          this.luaScripts.get('slidingWindow')!,
          1,
          key,
          windowMs,
          limit,
          Date.now(),
          uuid
        ) as [number, number];
        
        return {
          allowed: result[0] === 1,
          remainingRequests: result[1]
        };
      },
      inMemoryRateLimit.slidingWindow(key, windowMs, limit)
    );
  }

  async fixedWindow(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remainingRequests: number; resetTime: number }> {
    return this.executeRedisOperation(
      async () => {
        const result = await this.client!.eval(
          this.luaScripts.get('fixedWindow')!,
          1,
          key,
          limit,
          windowMs,
          Date.now()
        ) as [number, number, number];
        
        return {
          allowed: result[0] === 1,
          remainingRequests: result[1],
          resetTime: result[2]
        };
      },
      inMemoryRateLimit.fixedWindow(key, limit, windowMs)
    );
  }

  async get(key: string): Promise<string | null> {
    return this.executeRedisOperation(
      async () => await this.client!.get(key),
      inMemoryRateLimit.get(key) // Restore fallback to in-memory store
    );
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.executeRedisOperation(
      async () => {
        if (ttlSeconds) {
          await this.client!.setex(key, ttlSeconds, value);
        } else {
          await this.client!.set(key, value);
        }
      },
      // Fallback: store in memory with TTL support
      (() => { inMemoryRateLimit.set(key, value, ttlSeconds); })()
    );
  }

  async incr(key: string): Promise<number> {
    return this.executeRedisOperation(
      async () => await this.client!.incr(key),
      inMemoryRateLimit.incr(key)
    );
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.executeRedisOperation(
      async () => {
        const result = await this.client!.expire(key, seconds);
        return result === 1;
      },
      false
    );
  }

  async ttl(key: string): Promise<number> {
    return this.executeRedisOperation(
      async () => await this.client!.ttl(key),
      inMemoryRateLimit.ttl(key)
    );
  }

  async del(key: string): Promise<boolean> {
    return this.executeRedisOperation(
      async () => {
        const result = await this.client!.del(key);
        return result > 0;
      },
      inMemoryRateLimit.del(key)
    );
  }

  async zadd(key: string, score: number, member: string): Promise<boolean> {
    return this.executeRedisOperation(
      async () => {
        const result = await this.client!.zadd(key, score, member);
        return result > 0;
      },
      false
    );
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    return this.executeRedisOperation(
      async () => await this.client!.zremrangebyscore(key, min, max),
      0
    );
  }

  async zcard(key: string): Promise<number> {
    return this.executeRedisOperation(
      async () => await this.client!.zcard(key),
      0
    );
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
      } catch (error) {
        // Ignore disconnect errors in test environment
        if (process.env.NODE_ENV !== 'test') {
          console.error('Redis disconnect error:', error);
        }
      }
    }
  }
}
