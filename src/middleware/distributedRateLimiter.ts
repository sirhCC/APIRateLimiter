import { Request, Response, NextFunction } from 'express';
import { 
  DistributedRedisClient, 
  DistributedRateLimitConfig, 
  createDistributedRedisClient,
  DistributedRedisConfig 
} from '../utils/distributedRedis';
import { log } from '../utils/logger';
import { performance } from 'perf_hooks';
import { RateLimitRule } from '../types';

/**
 * Distributed Rate Limiter Middleware
 * 
 * Features:
 * - Multi-instance coordination via Redis clustering
 * - Consistent hashing for load distribution
 * - Circuit breaker pattern for resilience
 * - Instance-aware rate limiting
 * - Performance monitoring and alerting
 */

/**
 * Utility functions
 */
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function getClientIdentifier(req: Request): string {
  return req.ip || req.connection?.remoteAddress || 
         req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 
         'unknown';
}

/**
 * Extended rate limit rule for distributed scenarios
 */
interface DistributedRateLimitRule {
  path?: string | RegExp;
  methods?: string[];
  algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
  limit: number;
  windowMs: number;
  enabled?: boolean;
}

export interface DistributedRateLimiterOptions {
  // Redis cluster configuration
  redis: DistributedRedisConfig;
  
  // Rate limiting configuration
  rules: DistributedRateLimitRule[];
  defaultRule: {
    algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
    limit: number;
    windowMs: number;
  };
  
  // Coordination strategy
  coordinationStrategy: 'consistent-hashing' | 'broadcast' | 'leader-follower';
  
  // Circuit breaker configuration
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeout: number;
    degradedModeLimit: number; // Local fallback limit when Redis is down
  };
  
  // Performance monitoring
  monitoring?: {
    enabled: boolean;
    alertThresholds: {
      errorRate: number;
      latency: number;
      memoryUsage: number;
    };
  };
  
  // Custom headers
  headers?: {
    remaining: string;
    limit: string;
    reset: string;
    retryAfter: string;
  };
  
  // Skip function for bypassing rate limiting
  skip?: (req: Request) => boolean;
  
  // Key generator function
  keyGenerator?: (req: Request) => string;
  
  // Response handlers
  onLimitReached?: (req: Request, res: Response, retryAfter: number) => void;
  onError?: (req: Request, res: Response, error: Error) => void;
}

interface DistributedRateLimitState {
  totalRequests: number;
  blockedRequests: number;
  errorCount: number;
  lastError?: Error;
  instanceStats: Map<string, {
    requests: number;
    blocked: number;
    lastSeen: Date;
  }>;
  clusterHealth: {
    connected: boolean;
    activeNodes: number;
    circuitBreakerState: string;
  };
}

/**
 * In-memory fallback rate limiter for when Redis is unavailable
 */
class FallbackRateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor(private limit: number, private windowMs: number) {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }
  
  checkLimit(key: string): { allowed: boolean; remaining: number; resetTime: Date } {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const resetTime = new Date(windowStart + this.windowMs);
    
    const entry = this.requests.get(key);
    
    if (!entry || entry.resetTime <= now) {
      this.requests.set(key, { count: 1, resetTime: resetTime.getTime() });
      return { allowed: true, remaining: this.limit - 1, resetTime };
    }
    
    if (entry.count >= this.limit) {
      return { allowed: false, remaining: 0, resetTime };
    }
    
    entry.count++;
    return { allowed: true, remaining: this.limit - entry.count, resetTime };
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (entry.resetTime <= now) {
        this.requests.delete(key);
      }
    }
  }
  
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.requests.clear();
  }
}

/**
 * Distributed Rate Limiter class
 */
export class DistributedRateLimiter {
  private redisClient: DistributedRedisClient;
  private fallbackLimiter?: FallbackRateLimiter;
  private state: DistributedRateLimitState;
  private options: DistributedRateLimiterOptions;
  private instanceId: string;
  
  constructor(options: DistributedRateLimiterOptions) {
    this.options = options;
    this.instanceId = options.redis.instanceId;
    this.redisClient = createDistributedRedisClient(options.redis);
    
    // Initialize fallback limiter if circuit breaker is enabled
    if (options.circuitBreaker?.enabled) {
      this.fallbackLimiter = new FallbackRateLimiter(
        options.circuitBreaker.degradedModeLimit || 100,
        options.defaultRule.windowMs
      );
    }
    
    this.state = {
      totalRequests: 0,
      blockedRequests: 0,
      errorCount: 0,
      instanceStats: new Map(),
      clusterHealth: {
        connected: false,
        activeNodes: 0,
        circuitBreakerState: 'unknown'
      }
    };
    
    // Start health monitoring
    this.startHealthMonitoring();
    
    log.system('Distributed rate limiter initialized', {
      metadata: { 
        instanceId: this.instanceId,
        coordinationStrategy: options.coordinationStrategy,
        circuitBreakerEnabled: options.circuitBreaker?.enabled || false
      }
    });
  }
  
  /**
   * Express middleware function
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const startTime = performance.now();
      const requestId = generateRequestId();
      req.headers['x-request-id'] = requestId;
      
      try {
        // Check if request should be skipped
        if (this.options.skip && this.options.skip(req)) {
          return next();
        }
        
        // Generate rate limit key
        const key = this.generateKey(req);
        
        // Find matching rule
        const rule = this.findMatchingRule(req);
        const config: DistributedRateLimitConfig = {
          key,
          algorithm: rule.algorithm,
          limit: rule.limit,
          windowMs: rule.windowMs,
          coordinationStrategy: this.options.coordinationStrategy
        };
        
        // Check rate limit
        const result = await this.checkRateLimit(config, req);
        
        // Update statistics
        this.updateStats(result.instanceId, result.allowed);
        
        // Set response headers
        this.setHeaders(res, result);
        
        if (!result.allowed) {
          this.handleLimitExceeded(req, res, result);
          return;
        }
        
        // Log successful request
        const duration = performance.now() - startTime;
        log.performance('Distributed rate limit check completed', {
          requestId,
          responseTime: duration,
          endpoint: req.path,
          method: req.method,
          ip: getClientIdentifier(req),
          remaining: result.remaining,
          algorithm: config.algorithm,
          metadata: { 
            instanceId: result.instanceId,
            shardKey: result.shardKey
          }
        });
        
        next();
        
      } catch (error) {
        this.handleError(req, res, error as Error, performance.now() - startTime);
      }
    };
  }
  
  private async checkRateLimit(
    config: DistributedRateLimitConfig, 
    req: Request
  ) {
    try {
      return await this.redisClient.checkRateLimit(config);
    } catch (error) {
      log.redis('Distributed rate limit check failed, using fallback', {
        operation: 'rate_limit_check',
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
        severity: 'medium' as const
      });
      
      // Use fallback limiter if available
      if (this.fallbackLimiter) {
        const fallbackResult = this.fallbackLimiter.checkLimit(config.key);
        return {
          allowed: fallbackResult.allowed,
          remaining: fallbackResult.remaining,
          resetTime: fallbackResult.resetTime,
          totalHits: 0, // Not tracked in fallback
          instanceId: this.instanceId + '-fallback',
          shardKey: 'fallback'
        };
      }
      
      // Fail open if no fallback
      log.system('Rate limiting failed with no fallback - allowing request', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'high' as const
      });
      
      return {
        allowed: true,
        remaining: 999,
        resetTime: new Date(Date.now() + config.windowMs),
        totalHits: 0,
        instanceId: this.instanceId + '-failopen',
        shardKey: 'failopen'
      };
    }
  }
  
  private generateKey(req: Request): string {
    if (this.options.keyGenerator) {
      return this.options.keyGenerator(req);
    }
    
    const identifier = getClientIdentifier(req);
    const path = req.route?.path || req.path;
    return `${identifier}:${path}`;
  }
  
  private findMatchingRule(req: Request): DistributedRateLimitRule {
    const path = req.path;
    const method = req.method;
    
    for (const rule of this.options.rules) {
      if (rule.path) {
        if (rule.path instanceof RegExp) {
          if (rule.path.test(path)) {
            if (!rule.methods || rule.methods.includes(method)) {
              return rule;
            }
          }
        } else if (path.startsWith(rule.path)) {
          if (!rule.methods || rule.methods.includes(method)) {
            return rule;
          }
        }
      }
    }
    
    return this.options.defaultRule;
  }
  
  private setHeaders(res: Response, result: any): void {
    const headers = this.options.headers || {
      remaining: 'X-RateLimit-Remaining',
      limit: 'X-RateLimit-Limit',
      reset: 'X-RateLimit-Reset',
      retryAfter: 'Retry-After'
    };
    
    res.set(headers.remaining, result.remaining.toString());
    res.set(headers.reset, Math.ceil(result.resetTime.getTime() / 1000).toString());
    res.set('X-RateLimit-Instance', result.instanceId);
    res.set('X-RateLimit-Shard', result.shardKey);
    
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);
      res.set(headers.retryAfter, retryAfter.toString());
    }
  }
  
  private handleLimitExceeded(req: Request, res: Response, result: any): void {
    this.state.blockedRequests++;
    
    log.security('Rate limit exceeded', {
      eventType: 'rate_limit_exceeded',
      severity: 'medium' as const,
      ip: getClientIdentifier(req),
      endpoint: req.path,
      method: req.method,
      remaining: result.remaining,
      details: {
        instanceId: result.instanceId,
        shardKey: result.shardKey,
        totalHits: result.totalHits,
        resetTime: result.resetTime
      }
    });
    
    if (this.options.onLimitReached) {
      const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);
      this.options.onLimitReached(req, res, retryAfter);
    } else {
      const retryAfter = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter,
        instanceId: result.instanceId
      });
    }
  }
  
  private handleError(req: Request, res: Response, error: Error, duration: number): void {
    this.state.errorCount++;
    this.state.lastError = error;
    
    log.system('Distributed rate limiter error', {
      error: error.message,
      endpoint: req.path,
      method: req.method,
      ip: getClientIdentifier(req),
      severity: 'high' as const,
      metadata: { duration }
    });
    
    if (this.options.onError) {
      this.options.onError(req, res, error);
    } else {
      // Fail open - allow the request to proceed
      log.system('Rate limiter failing open due to error', {
        severity: 'high' as const
      });
      res.set('X-RateLimit-Error', 'true');
      res.set('X-RateLimit-Instance', this.instanceId);
    }
  }
  
  private updateStats(instanceId: string, allowed: boolean): void {
    this.state.totalRequests++;
    
    if (!this.state.instanceStats.has(instanceId)) {
      this.state.instanceStats.set(instanceId, {
        requests: 0,
        blocked: 0,
        lastSeen: new Date()
      });
    }
    
    const stats = this.state.instanceStats.get(instanceId)!;
    stats.requests++;
    stats.lastSeen = new Date();
    
    if (!allowed) {
      stats.blocked++;
    }
  }
  
  private async startHealthMonitoring(): Promise<void> {
    setInterval(async () => {
      try {
        const health = await this.redisClient.getClusterHealth();
        this.state.clusterHealth = {
          connected: health.connected,
          activeNodes: health.nodeStats?.connectedNodes || 0,
          circuitBreakerState: health.circuitBreakerState
        };
        
        // Alert on issues
        if (this.options.monitoring?.enabled) {
          this.checkHealthAlerts();
        }
        
      } catch (error) {
        log.system('Health monitoring error', {
          error: error instanceof Error ? error.message : String(error),
          severity: 'medium' as const
        });
      }
    }, 30000); // Check every 30 seconds
  }
  
  private checkHealthAlerts(): void {
    const thresholds = this.options.monitoring?.alertThresholds;
    if (!thresholds) return;
    
    const errorRate = this.state.errorCount / Math.max(this.state.totalRequests, 1);
    
    if (errorRate > thresholds.errorRate) {
      log.system('High error rate detected in distributed rate limiter', {
        severity: 'critical' as const,
        metadata: {
          errorRate: errorRate * 100,
          threshold: thresholds.errorRate * 100,
          totalRequests: this.state.totalRequests,
          errorCount: this.state.errorCount
        }
      });
    }
    
    if (!this.state.clusterHealth.connected) {
      log.system('Redis cluster connection lost', {
        severity: 'critical' as const,
        metadata: {
          circuitBreakerState: this.state.clusterHealth.circuitBreakerState,
          activeNodes: this.state.clusterHealth.activeNodes
        }
      });
    }
  }
  
  /**
   * Get current distributed rate limiter statistics
   */
  getStats() {
    return {
      ...this.state,
      instanceId: this.instanceId,
      uptime: process.uptime(),
      coordinationStrategy: this.options.coordinationStrategy,
      clusterHealth: this.state.clusterHealth
    };
  }
  
  /**
   * Reset statistics (for testing)
   */
  resetStats(): void {
    this.state.totalRequests = 0;
    this.state.blockedRequests = 0;
    this.state.errorCount = 0;
    this.state.lastError = undefined;
    this.state.instanceStats.clear();
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      if (this.fallbackLimiter) {
        this.fallbackLimiter.destroy();
      }
      
      await this.redisClient.disconnect();
      
      log.system('Distributed rate limiter shutdown completed', {
        metadata: { instanceId: this.instanceId }
      });
    } catch (error) {
      log.system('Error during distributed rate limiter shutdown', {
        error: error instanceof Error ? error.message : String(error),
        severity: 'medium' as const
      });
    }
  }
}

/**
 * Factory function for creating distributed rate limiter middleware
 */
export function createDistributedRateLimiter(options: DistributedRateLimiterOptions) {
  const limiter = new DistributedRateLimiter(options);
  return {
    middleware: limiter.middleware.bind(limiter),
    getStats: limiter.getStats.bind(limiter),
    resetStats: limiter.resetStats.bind(limiter),
    shutdown: limiter.shutdown.bind(limiter)
  };
}
