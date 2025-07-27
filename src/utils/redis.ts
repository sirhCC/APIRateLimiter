import Redis from 'ioredis';

/**
 * High-performance Redis client with connection pooling and Lua scripts
 */
export class RedisClient {
  private client: Redis;
  private isConnected: boolean = false;
  private luaScripts: Map<string, string> = new Map();

  constructor(config: { host: string; port: number; password?: string; db?: number }) {
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // Performance optimizations
      enableOfflineQueue: false,
      connectTimeout: 10000,
      commandTimeout: 5000,
      // Connection pooling
      family: 4,
      keepAlive: 30000,
      // Pipeline optimizations
      enableAutoPipelining: true,
    });

    this.client.on('connect', () => {
      console.log('Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
    });

    this.setupLuaScripts();
  }

  /**
   * Setup pre-compiled Lua scripts for atomic operations
   */
  private setupLuaScripts() {
    // Token bucket algorithm with atomic refill and consume
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

      -- Calculate tokens to add based on time passed
      local time_passed = math.max(0, now - last_refill)
      local tokens_to_add = math.floor(time_passed / interval * tokens)
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

    // Sliding window algorithm with automatic cleanup
    this.luaScripts.set('slidingWindow', `
      local key = KEYS[1]
      local window = tonumber(ARGV[1])
      local limit = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local uuid = ARGV[4]

      -- Remove old entries
      redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
      
      -- Count current requests
      local current = redis.call('ZCARD', key)
      
      if current < limit then
        -- Add new request
        redis.call('ZADD', key, now, uuid)
        redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
        return {1, limit - current - 1}
      else
        return {0, 0}
      end
    `);

    // Fixed window with atomic increment
    this.luaScripts.set('fixedWindow', `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local current_window = math.floor(now / window)
      local window_key = key .. ':' .. current_window
      
      local current = redis.call('INCR', window_key)
      if current == 1 then
        redis.call('EXPIRE', window_key, math.ceil(window / 1000) + 1)
      end
      
      if current <= limit then
        return {1, limit - current}
      else
        return {0, 0}
      end
    `);
  }

  /**
   * Execute token bucket algorithm atomically
   */
  async executeTokenBucket(
    key: string, 
    capacity: number, 
    tokensPerInterval: number, 
    intervalMs: number, 
    requested: number = 1
  ): Promise<{ allowed: boolean; tokensRemaining: number }> {
    try {
      const script = this.luaScripts.get('tokenBucket')!;
      const result = await this.client.eval(
        script,
        1,
        key,
        capacity.toString(),
        tokensPerInterval.toString(),
        intervalMs.toString(),
        requested.toString(),
        Date.now().toString()
      ) as [number, number];

      return {
        allowed: result[0] === 1,
        tokensRemaining: result[1]
      };
    } catch (error) {
      console.error('Redis token bucket error:', error);
      return { allowed: false, tokensRemaining: 0 };
    }
  }

  /**
   * Execute sliding window algorithm atomically
   */
  async executeSlidingWindow(
    key: string,
    windowMs: number,
    limit: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const script = this.luaScripts.get('slidingWindow')!;
      const uuid = `${Date.now()}-${Math.random()}`;
      const result = await this.client.eval(
        script,
        1,
        key,
        windowMs.toString(),
        limit.toString(),
        Date.now().toString(),
        uuid
      ) as [number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1]
      };
    } catch (error) {
      console.error('Redis sliding window error:', error);
      return { allowed: false, remaining: 0 };
    }
  }

  /**
   * Execute fixed window algorithm atomically
   */
  async executeFixedWindow(
    key: string,
    windowMs: number,
    limit: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const script = this.luaScripts.get('fixedWindow')!;
      const result = await this.client.eval(
        script,
        1,
        key,
        limit.toString(),
        windowMs.toString(),
        Date.now().toString()
      ) as [number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1]
      };
    } catch (error) {
      console.error('Redis fixed window error:', error);
      return { allowed: false, remaining: 0 };
    }
  }

  /**
   * Batch operations for better performance
   */
  async batchOperations(operations: Array<{ method: string; args: any[] }>): Promise<any[]> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const op of operations) {
        (pipeline as any)[op.method](...op.args);
      }
      
      const results = await pipeline.exec();
      return results?.map(([err, result]) => err ? null : result) || [];
    } catch (error) {
      console.error('Redis batch operations error:', error);
      return [];
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error);
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error('Redis EXPIRE error:', error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error('Redis TTL error:', error);
      return -1;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async zAdd(key: string, score: number, member: string): Promise<boolean> {
    try {
      const result = await this.client.zadd(key, score, member);
      return result > 0;
    } catch (error) {
      console.error('Redis ZADD error:', error);
      return false;
    }
  }

  async zRemRangeByScore(key: string, min: number, max: number): Promise<number> {
    try {
      return await this.client.zremrangebyscore(key, min, max);
    } catch (error) {
      console.error('Redis ZREMRANGEBYSCORE error:', error);
      return 0;
    }
  }

  async zCard(key: string): Promise<number> {
    try {
      return await this.client.zcard(key);
    } catch (error) {
      console.error('Redis ZCARD error:', error);
      return 0;
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
