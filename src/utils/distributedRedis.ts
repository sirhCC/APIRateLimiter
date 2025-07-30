import Redis, { Cluster } from 'ioredis';
import { log } from './logger';

/**
 * Distributed Redis Client for Rate Limiter Clustering
 * 
 * Features:
 * - Redis Cluster support with consistent hashing
 * - Automatic failover and recovery
 * - Instance coordination for distributed rate limiting
 * - Circuit breaker pattern for graceful degradation
 */

export interface DistributedRedisConfig {
  // Redis cluster configuration
  cluster?: {
    nodes: Array<{ host: string; port: number }>;
    options?: {
      enableOfflineQueue?: boolean;
      redisOptions?: {
        password?: string;
        db?: number;
        connectTimeout?: number;
        lazyConnect?: boolean;
      };
      maxRetriesPerRequest?: number;
      retryDelayOnFailover?: number;
      scaleReads?: 'master' | 'slave' | 'all';
    };
  };
  
  // Single Redis instance fallback
  single?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  
  // Circuit breaker configuration
  circuitBreaker?: {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
  };
  
  // Instance coordination
  instanceId: string;
  coordinationPrefix: string;
}

export interface DistributedRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
  instanceId: string;
  shardKey: string;
}

export interface DistributedRateLimitConfig {
  key: string;
  algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
  limit: number;
  windowMs: number;
  coordinationStrategy: 'consistent-hashing' | 'broadcast' | 'leader-follower';
}

/**
 * Circuit Breaker for Redis operations
 */
class RedisCircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private successes = 0;
  
  constructor(
    private failureThreshold: number = 5,
    private successThreshold: number = 3,
    private timeout: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker is OPEN - Redis unavailable');
      }
      this.state = 'half-open';
      this.successes = 0;
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
        log.system('Redis circuit breaker closed - service recovered', {
          metadata: { state: this.state, successes: this.successes }
        });
      }
    }
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      log.system('Redis circuit breaker opened - service degraded', {
        metadata: { state: this.state, failures: this.failures },
        severity: 'high' as const
      });
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Consistent Hash Ring for Redis sharding
 */
class ConsistentHashRing {
  private ring: Map<number, string> = new Map();
  private nodes: string[] = [];
  private virtualNodes = 160; // Number of virtual nodes per physical node
  
  constructor(nodes: string[]) {
    this.addNodes(nodes);
  }
  
  private hash(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  private addNodes(nodes: string[]): void {
    this.nodes = [...nodes];
    this.ring.clear();
    
    for (const node of nodes) {
      for (let i = 0; i < this.virtualNodes; i++) {
        const virtualKey = this.hash(`${node}:${i}`);
        this.ring.set(virtualKey, node);
      }
    }
    
    log.system('Consistent hash ring initialized', {
      metadata: { 
        nodes: nodes.length,
        virtualNodes: this.virtualNodes,
        totalRingSize: this.ring.size 
      }
    });
  }
  
  getNode(key: string): string {
    if (this.ring.size === 0) {
      throw new Error('No nodes available in hash ring');
    }
    
    const keyHash = this.hash(key);
    const sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
    
    // Find the first node >= keyHash
    for (const ringKey of sortedKeys) {
      if (ringKey >= keyHash) {
        return this.ring.get(ringKey)!;
      }
    }
    
    // Wrap around to the first node
    return this.ring.get(sortedKeys[0])!;
  }
  
  removeNode(node: string): void {
    this.nodes = this.nodes.filter(n => n !== node);
    
    // Rebuild ring without the removed node
    this.ring.clear();
    for (const remainingNode of this.nodes) {
      for (let i = 0; i < this.virtualNodes; i++) {
        const virtualKey = this.hash(`${remainingNode}:${i}`);
        this.ring.set(virtualKey, remainingNode);
      }
    }
    
    log.system('Node removed from consistent hash ring', {
      metadata: { removedNode: node, remainingNodes: this.nodes.length },
      severity: 'medium' as const
    });
  }
  
  addNode(node: string): void {
    if (!this.nodes.includes(node)) {
      this.nodes.push(node);
      
      // Add virtual nodes for the new node
      for (let i = 0; i < this.virtualNodes; i++) {
        const virtualKey = this.hash(`${node}:${i}`);
        this.ring.set(virtualKey, node);
      }
      
      log.system('Node added to consistent hash ring', {
        metadata: { addedNode: node, totalNodes: this.nodes.length }
      });
    }
  }
  
  getStats() {
    return {
      nodes: this.nodes.length,
      virtualNodes: this.virtualNodes,
      ringSize: this.ring.size
    };
  }
}

/**
 * Distributed Redis Client with clustering support
 */
export class DistributedRedisClient {
  private cluster?: Cluster;
  private single?: Redis;
  private circuitBreaker: RedisCircuitBreaker;
  private hashRing?: ConsistentHashRing;
  private config: DistributedRedisConfig;
  private connected = false;
  
  constructor(config: DistributedRedisConfig) {
    this.config = config;
    this.circuitBreaker = new RedisCircuitBreaker(
      config.circuitBreaker?.failureThreshold || 5,
      config.circuitBreaker?.successThreshold || 3,
      config.circuitBreaker?.timeout || 60000
    );
    
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
    try {
      if (this.config.cluster) {
        await this.initializeCluster();
      } else if (this.config.single) {
        await this.initializeSingle();
      } else {
        throw new Error('No Redis configuration provided');
      }
      
      this.connected = true;
      log.redis('Distributed Redis client initialized', {
        operation: 'initialize',
        metadata: { 
          mode: this.config.cluster ? 'cluster' : 'single',
          instanceId: this.config.instanceId
        }
      });
      
    } catch (error) {
      log.redis('Failed to initialize distributed Redis client', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'high' as const
      });
      throw error;
    }
  }
  
  private async initializeCluster(): Promise<void> {
    if (!this.config.cluster) return;
    
    const nodes = this.config.cluster.nodes.map(node => `${node.host}:${node.port}`);
    this.hashRing = new ConsistentHashRing(nodes);
    
    this.cluster = new Redis.Cluster(this.config.cluster.nodes, {
      enableOfflineQueue: false,
      redisOptions: {
        lazyConnect: true,
        connectTimeout: 10000,
        ...this.config.cluster.options?.redisOptions
      },
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      scaleReads: 'slave',
      ...this.config.cluster.options
    });
    
    // Setup cluster event handlers
    this.cluster.on('connect', () => {
      log.redis('Redis cluster connected', {
        operation: 'cluster_connect',
        metadata: { nodes: this.config.cluster!.nodes.length }
      });
    });
    
    this.cluster.on('error', (error) => {
      log.redis('Redis cluster error', {
        error: error.message,
        severity: 'high' as const
      });
    });
    
    this.cluster.on('-node', (node) => {
      const nodeKey = `${node.options.host}:${node.options.port}`;
      this.hashRing?.removeNode(nodeKey);
      log.redis('Redis cluster node removed', {
        operation: 'node_remove',
        metadata: { node: nodeKey },
        severity: 'medium' as const
      });
    });
    
    this.cluster.on('+node', (node) => {
      const nodeKey = `${node.options.host}:${node.options.port}`;
      this.hashRing?.addNode(nodeKey);
      log.redis('Redis cluster node added', {
        operation: 'node_add',
        metadata: { node: nodeKey }
      });
    });
  }
  
  private async initializeSingle(): Promise<void> {
    if (!this.config.single) return;
    
    this.single = new Redis({
      host: this.config.single.host,
      port: this.config.single.port,
      password: this.config.single.password,
      db: this.config.single.db || 0,
      lazyConnect: true,
      connectTimeout: 10000,
      maxRetriesPerRequest: 3
    });
    
    this.single.on('connect', () => {
      log.redis('Redis single instance connected', {
        host: this.config.single!.host,
        port: this.config.single!.port
      });
    });
    
    this.single.on('error', (error) => {
      log.redis('Redis single instance error', {
        error: error.message,
        severity: 'high' as const
      });
    });
  }
  
  /**
   * Execute distributed rate limiting check
   */
  async checkRateLimit(config: DistributedRateLimitConfig): Promise<DistributedRateLimitResult> {
    return this.circuitBreaker.execute(async () => {
      const shardKey = this.getShardKey(config.key);
      const redis = await this.getRedisClient(shardKey);
      
      const result = await this.executeRateLimitAlgorithm(redis, config, shardKey);
      
      return {
        ...result,
        instanceId: this.config.instanceId,
        shardKey
      };
    });
  }
  
  private getShardKey(key: string): string {
    if (this.hashRing) {
      return this.hashRing.getNode(key);
    }
    return 'single';
  }
  
  private async getRedisClient(shardKey: string): Promise<Redis | Cluster> {
    if (this.cluster) {
      return this.cluster;
    } else if (this.single) {
      return this.single;
    } else {
      throw new Error('No Redis client available');
    }
  }
  
  private async executeRateLimitAlgorithm(
    redis: Redis | Cluster, 
    config: DistributedRateLimitConfig,
    shardKey: string
  ): Promise<Omit<DistributedRateLimitResult, 'instanceId' | 'shardKey'>> {
    const now = Date.now();
    const key = `${this.config.coordinationPrefix}:${config.key}`;
    
    switch (config.algorithm) {
      case 'sliding-window':
        return this.slidingWindowDistributed(redis, key, config, now);
      case 'token-bucket':
        return this.tokenBucketDistributed(redis, key, config, now);
      case 'fixed-window':
        return this.fixedWindowDistributed(redis, key, config, now);
      default:
        throw new Error(`Unsupported algorithm: ${config.algorithm}`);
    }
  }
  
  private async slidingWindowDistributed(
    redis: Redis | Cluster,
    key: string,
    config: DistributedRateLimitConfig,
    now: number
  ): Promise<Omit<DistributedRateLimitResult, 'instanceId' | 'shardKey'>> {
    const windowStart = now - config.windowMs;
    
    // Lua script for atomic sliding window operation
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local uuid = ARGV[4]
      local instance = ARGV[5]
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
      
      -- Count current requests
      local current = redis.call('ZCARD', key)
      
      if current < limit then
        -- Add current request with instance info
        redis.call('ZADD', key, now, instance .. ':' .. uuid .. ':' .. now)
        redis.call('EXPIRE', key, math.ceil(window / 1000))
        return {1, limit - current - 1, current + 1}
      else
        return {0, 0, current}
      end
    `;
    
    const uuid = Math.random().toString(36).substring(7);
    const result = await redis.eval(
      luaScript,
      1,
      key,
      now.toString(),
      config.windowMs.toString(),
      config.limit.toString(),
      uuid,
      this.config.instanceId
    ) as [number, number, number];
    
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      totalHits: result[2],
      resetTime: new Date(now + config.windowMs)
    };
  }
  
  private async tokenBucketDistributed(
    redis: Redis | Cluster,
    key: string,
    config: DistributedRateLimitConfig,
    now: number
  ): Promise<Omit<DistributedRateLimitResult, 'instanceId' | 'shardKey'>> {
    // Token bucket with distributed coordination
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local capacity = tonumber(ARGV[2])
      local refill_rate = tonumber(ARGV[3])
      local window = tonumber(ARGV[4])
      local instance = ARGV[5]
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill', 'total_requests')
      local tokens = tonumber(bucket[1]) or capacity
      local last_refill = tonumber(bucket[2]) or now
      local total_requests = tonumber(bucket[3]) or 0
      
      -- Calculate tokens to add based on time elapsed
      local elapsed = now - last_refill
      local tokens_to_add = math.floor(elapsed * refill_rate / window)
      tokens = math.min(capacity, tokens + tokens_to_add)
      
      if tokens >= 1 then
        tokens = tokens - 1
        total_requests = total_requests + 1
        redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now, 'total_requests', total_requests)
        redis.call('EXPIRE', key, math.ceil(window / 1000) * 2)
        return {1, tokens, total_requests}
      else
        redis.call('HMSET', key, 'last_refill', now, 'total_requests', total_requests)
        redis.call('EXPIRE', key, math.ceil(window / 1000) * 2)
        return {0, tokens, total_requests}
      end
    `;
    
    const refillRate = config.limit / config.windowMs; // tokens per ms
    const result = await redis.eval(
      luaScript,
      1,
      key,
      now.toString(),
      config.limit.toString(),
      refillRate.toString(),
      config.windowMs.toString(),
      this.config.instanceId
    ) as [number, number, number];
    
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      totalHits: result[2],
      resetTime: new Date(now + config.windowMs)
    };
  }
  
  private async fixedWindowDistributed(
    redis: Redis | Cluster,
    key: string,
    config: DistributedRateLimitConfig,
    now: number
  ): Promise<Omit<DistributedRateLimitResult, 'instanceId' | 'shardKey'>> {
    const window = Math.floor(now / config.windowMs);
    const windowKey = `${key}:${window}`;
    
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local expire = tonumber(ARGV[2])
      local instance = ARGV[3]
      
      local current = redis.call('GET', key)
      current = tonumber(current) or 0
      
      if current < limit then
        local new_count = redis.call('INCR', key)
        redis.call('EXPIRE', key, expire)
        return {1, limit - new_count, new_count}
      else
        return {0, 0, current}
      end
    `;
    
    const expireSeconds = Math.ceil(config.windowMs / 1000);
    const result = await redis.eval(
      luaScript,
      1,
      windowKey,
      config.limit.toString(),
      expireSeconds.toString(),
      this.config.instanceId
    ) as [number, number, number];
    
    const resetTime = new Date((window + 1) * config.windowMs);
    
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      totalHits: result[2],
      resetTime
    };
  }
  
  /**
   * Get cluster health and statistics
   */
  async getClusterHealth(): Promise<{
    connected: boolean;
    circuitBreakerState: string;
    nodeStats?: any;
    hashRingStats?: any;
  }> {
    const health = {
      connected: this.connected,
      circuitBreakerState: this.circuitBreaker.getState().state,
      nodeStats: undefined as any,
      hashRingStats: this.hashRing?.getStats()
    };
    
    try {
      if (this.cluster) {
        const nodes = this.cluster.nodes();
        health.nodeStats = {
          totalNodes: nodes.length,
          connectedNodes: nodes.filter(n => n.status === 'ready').length,
          failedNodes: nodes.filter(n => n.status !== 'ready').length
        };
      } else if (this.single) {
        health.nodeStats = {
          totalNodes: 1,
          connectedNodes: this.single.status === 'ready' ? 1 : 0,
          failedNodes: this.single.status === 'ready' ? 0 : 1
        };
      }
    } catch (error) {
      log.redis('Error getting cluster health', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'medium' as const
      });
    }
    
    return health;
  }
  
  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    try {
      if (this.cluster) {
        await this.cluster.disconnect();
      }
      if (this.single) {
        await this.single.disconnect();
      }
      
      this.connected = false;
      log.redis('Distributed Redis client disconnected', {
        operation: 'disconnect',
        metadata: { instanceId: this.config.instanceId }
      });
    } catch (error) {
      log.redis('Error during Redis disconnect', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'medium' as const
      });
    }
  }
}

/**
 * Factory function for creating distributed Redis client
 */
export function createDistributedRedisClient(config: DistributedRedisConfig): DistributedRedisClient {
  return new DistributedRedisClient(config);
}
