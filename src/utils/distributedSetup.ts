import { Express } from 'express';
import { createDistributedRateLimiter, DistributedRateLimiterOptions } from '../middleware/distributedRateLimiter';
import { DistributedRedisConfig } from '../utils/distributedRedis';
import { log } from '../utils/logger';

/**
 * Easy-to-use integration for distributed rate limiting
 * Provides sensible defaults and environment-based configuration
 */

export interface DistributedSetupOptions {
  // Express app instance
  app: Express;
  
  // Override default configuration
  redis?: Partial<DistributedRedisConfig>;
  rateLimiting?: {
    defaultLimit?: number;
    defaultWindowMs?: number;
    defaultAlgorithm?: 'token-bucket' | 'sliding-window' | 'fixed-window';
  };
  
  // Custom rules for specific endpoints
  customRules?: Array<{
    path: string | RegExp;
    methods?: string[];
    limit: number;
    windowMs: number;
    algorithm?: 'token-bucket' | 'sliding-window' | 'fixed-window';
  }>;
  
  // Enable/disable features
  features?: {
    circuitBreaker?: boolean;
    monitoring?: boolean;
    fallbackMode?: boolean;
  };
  
  // Paths to exclude from rate limiting
  excludePaths?: (string | RegExp)[];
}

/**
 * Default configuration based on environment variables
 */
function getDefaultRedisConfig(): DistributedRedisConfig {
  const mode = process.env.DISTRIBUTED_REDIS_MODE || 'single';
  const instanceId = process.env.INSTANCE_ID || 
                    `api-rate-limiter-${process.env.HOSTNAME || 'unknown'}-${process.env.PORT || '3000'}`;
  
  const config: DistributedRedisConfig = {
    instanceId,
    coordinationPrefix: process.env.COORDINATION_PREFIX || 'rate_limiter:distributed',
    circuitBreaker: {
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
      successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '3'),
      timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000')
    }
  };
  
  if (mode === 'cluster') {
    const nodesString = process.env.REDIS_CLUSTER_NODES || 'localhost:7000,localhost:7001,localhost:7002';
    const nodes = nodesString.split(',').map(nodeStr => {
      const [host, port] = nodeStr.trim().split(':');
      return { host, port: parseInt(port) };
    });
    
    config.cluster = {
      nodes,
      options: {
        enableOfflineQueue: false,
        redisOptions: {
          password: process.env.REDIS_PASSWORD,
          connectTimeout: 10000,
          lazyConnect: true
        },
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        scaleReads: 'slave'
      }
    };
  } else {
    config.single = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0')
    };
  }
  
  return config;
}

/**
 * Setup distributed rate limiting with sensible defaults
 */
export async function setupDistributedRateLimiter(options: DistributedSetupOptions) {
  const { app, redis: redisOverrides, rateLimiting, customRules, features, excludePaths } = options;
  
  try {
    // Merge default and override configurations
    const redisConfig: DistributedRedisConfig = {
      ...getDefaultRedisConfig(),
      ...redisOverrides
    };
    
    // Default rate limiting rules
    const defaultRules = [
      // API endpoints - more restrictive
      {
        path: '/api/',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        algorithm: rateLimiting?.defaultAlgorithm || 'sliding-window' as const,
        limit: Math.floor((rateLimiting?.defaultLimit || 1000) * 0.8), // 80% of default
        windowMs: rateLimiting?.defaultWindowMs || 3600000 // 1 hour
      },
      
      // Authentication endpoints - very restrictive
      {
        path: /^\/auth\/(login|register|reset)/,
        methods: ['POST'],
        algorithm: 'sliding-window' as const,
        limit: 10,
        windowMs: 300000 // 5 minutes
      },
      
      // Admin endpoints - restrictive
      {
        path: '/admin/',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        algorithm: 'token-bucket' as const,
        limit: 100,
        windowMs: 3600000 // 1 hour
      },
      
      // Health checks - permissive
      {
        path: /^\/health/,
        methods: ['GET'],
        algorithm: 'fixed-window' as const,
        limit: 1000,
        windowMs: 60000 // 1 minute
      },
      
      // Metrics endpoint - monitoring systems
      {
        path: '/metrics',
        methods: ['GET'],
        algorithm: 'fixed-window' as const,
        limit: 500,
        windowMs: 60000 // 1 minute
      }
    ];
    
    // Combine default and custom rules
    const allRules = [
      ...defaultRules, 
      ...(customRules || []).map(rule => ({
        ...rule,
        algorithm: rule.algorithm || 'sliding-window' as const
      }))
    ];
    
    // Configure distributed rate limiter options
    const distributedOptions: DistributedRateLimiterOptions = {
      redis: redisConfig,
      rules: allRules,
      defaultRule: {
        algorithm: rateLimiting?.defaultAlgorithm || 'sliding-window',
        limit: rateLimiting?.defaultLimit || 1000,
        windowMs: rateLimiting?.defaultWindowMs || 3600000
      },
      coordinationStrategy: (process.env.COORDINATION_STRATEGY as any) || 'consistent-hashing',
      circuitBreaker: features?.circuitBreaker !== false ? {
        enabled: true,
        failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
        recoveryTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000'),
        degradedModeLimit: parseInt(process.env.CIRCUIT_BREAKER_DEGRADED_LIMIT || '100')
      } : { enabled: false, failureThreshold: 5, recoveryTimeout: 60000, degradedModeLimit: 100 },
      monitoring: features?.monitoring !== false ? {
        enabled: true,
        alertThresholds: {
          errorRate: parseFloat(process.env.MONITORING_ERROR_RATE_THRESHOLD || '0.05'),
          latency: parseInt(process.env.MONITORING_LATENCY_THRESHOLD || '1000'),
          memoryUsage: parseFloat(process.env.MONITORING_MEMORY_THRESHOLD || '0.8')
        }
      } : { enabled: false, alertThresholds: { errorRate: 0.05, latency: 1000, memoryUsage: 0.8 } },
      headers: {
        remaining: 'X-RateLimit-Remaining',
        limit: 'X-RateLimit-Limit',
        reset: 'X-RateLimit-Reset',
        retryAfter: 'Retry-After'
      },
      skip: (req) => {
        // Skip excluded paths
        if (excludePaths) {
          for (const excludePath of excludePaths) {
            if (excludePath instanceof RegExp) {
              if (excludePath.test(req.path)) return true;
            } else if (req.path.startsWith(excludePath)) {
              return true;
            }
          }
        }
        
        // Skip health checks in development
        if (process.env.NODE_ENV === 'development' && req.path.startsWith('/health')) {
          return true;
        }
        
        return false;
      }
    };
    
    // Create the distributed rate limiter
    const limiter = createDistributedRateLimiter(distributedOptions);
    
    // Apply middleware to Express app
    app.use(limiter.middleware);
    
    // Add stats endpoint
    app.get('/stats/distributed', (req, res) => {
      try {
        const stats = limiter.getStats();
        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          stats
        });
      } catch (error) {
        log.system('Error getting distributed rate limiter stats', {
          error: error instanceof Error ? error.message : String(error),
          severity: 'medium' as const
        });
        res.status(500).json({
          success: false,
          error: 'Failed to get stats'
        });
      }
    });
    
    // Add health check endpoint for the distributed system
    app.get('/health/distributed', async (req, res) => {
      try {
        const stats = limiter.getStats();
        const healthy = stats.clusterHealth.connected && 
                       stats.clusterHealth.circuitBreakerState !== 'open';
        
        res.status(healthy ? 200 : 503).json({
          status: healthy ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          instanceId: redisConfig.instanceId,
          clusterHealth: stats.clusterHealth,
          circuitBreakerState: stats.clusterHealth.circuitBreakerState,
          totalRequests: stats.totalRequests,
          blockedRequests: stats.blockedRequests,
          errorCount: stats.errorCount,
          uptime: stats.uptime
        });
      } catch (error) {
        log.system('Distributed health check failed', {
          error: error instanceof Error ? error.message : String(error),
          severity: 'high' as const
        });
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed'
        });
      }
    });
    
    // Setup graceful shutdown
    const shutdown = async () => {
      log.system('Shutting down distributed rate limiter', {
        metadata: { instanceId: redisConfig.instanceId }
      });
      await limiter.shutdown();
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    log.system('Distributed rate limiter setup completed', {
      metadata: {
        instanceId: redisConfig.instanceId,
        redisMode: redisConfig.cluster ? 'cluster' : 'single',
        rulesCount: allRules.length,
        circuitBreakerEnabled: distributedOptions.circuitBreaker?.enabled,
        monitoringEnabled: distributedOptions.monitoring?.enabled
      }
    });
    
    return {
      limiter,
      getStats: limiter.getStats,
      resetStats: limiter.resetStats,
      shutdown: limiter.shutdown,
      redisConfig
    };
    
  } catch (error) {
    log.system('Failed to setup distributed rate limiter', {
      error: error instanceof Error ? error.message : String(error),
      severity: 'critical' as const
    });
    throw error;
  }
}

/**
 * Quick setup with minimal configuration
 */
export async function quickSetupDistributed(app: Express, options?: {
  limit?: number;
  windowMs?: number;
  excludePaths?: string[];
}) {
  return setupDistributedRateLimiter({
    app,
    rateLimiting: {
      defaultLimit: options?.limit || 1000,
      defaultWindowMs: options?.windowMs || 3600000,
      defaultAlgorithm: 'sliding-window'
    },
    excludePaths: options?.excludePaths,
    features: {
      circuitBreaker: true,
      monitoring: true,
      fallbackMode: true
    }
  });
}

/**
 * Development setup with relaxed limits
 */
export async function developmentSetupDistributed(app: Express) {
  return setupDistributedRateLimiter({
    app,
    rateLimiting: {
      defaultLimit: 10000,
      defaultWindowMs: 3600000,
      defaultAlgorithm: 'sliding-window'
    },
    excludePaths: ['/health', '/metrics', '/stats'],
    features: {
      circuitBreaker: false,
      monitoring: true,
      fallbackMode: true
    }
  });
}

/**
 * Production setup with strict limits
 */
export async function productionSetupDistributed(app: Express) {
  return setupDistributedRateLimiter({
    app,
    rateLimiting: {
      defaultLimit: 500,
      defaultWindowMs: 3600000,
      defaultAlgorithm: 'sliding-window'
    },
    customRules: [
      // Very strict for sensitive operations
      {
        path: /^\/auth\/(login|register)/,
        methods: ['POST'],
        limit: 5,
        windowMs: 900000, // 15 minutes
        algorithm: 'sliding-window'
      },
      // Strict for payment operations
      {
        path: '/payment/',
        methods: ['POST'],
        limit: 20,
        windowMs: 3600000, // 1 hour
        algorithm: 'token-bucket'
      }
    ],
    features: {
      circuitBreaker: true,
      monitoring: true,
      fallbackMode: true
    }
  });
}
