import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from 'dotenv';
import { RedisClient } from './utils/redis';
import { SimpleStats } from './utils/stats';
import { performanceMonitor, startPerformanceCleanup } from './utils/performance';
import { initializeApiKeyManager, ApiKeyManager } from './utils/apiKeys';
import { createApiKeyMiddleware, requireApiKey } from './middleware/apiKeyAuth';
import { createRateLimitMiddleware, createResetEndpoint } from './middleware';
import { createIPFilterMiddleware } from './middleware/ipFilter';
import { createRateLimitLogger } from './middleware/logger';
import { createOptimizedRateLimiter, RateLimitPresets } from './middleware/optimizedRateLimiter';
import { ApiRateLimiterConfig, RateLimitRule } from './types';

// Load environment variables
config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(performanceMonitor.middleware()); // Add performance monitoring
app.use(morgan('combined'));
app.use(express.json());

// Configuration
const appConfig: ApiRateLimiterConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
  },
  defaultRateLimit: {
    windowMs: parseInt(process.env.DEFAULT_WINDOW_MS || '60000'), // 1 minute
    max: parseInt(process.env.DEFAULT_MAX_REQUESTS || '100'),
    algorithm: (process.env.DEFAULT_ALGORITHM as any) || 'sliding-window',
  },
  rules: loadRulesFromConfig(),
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    statsRetentionMs: parseInt(process.env.STATS_RETENTION_MS || '3600000'), // 1 hour
  },
};

// Initialize Redis client and stats
const redis = new RedisClient(appConfig.redis);
const stats = new SimpleStats();

// Initialize API key manager
const apiKeyManager = initializeApiKeyManager(redis);

// Trust proxy (for accurate IP addresses)
app.set('trust proxy', process.env.ENABLE_TRUST_PROXY === 'true');

// IP Filter middleware
const ipFilter = createIPFilterMiddleware({
  whitelist: process.env.IP_WHITELIST ? process.env.IP_WHITELIST.split(',') : [],
  blacklist: process.env.IP_BLACKLIST ? process.env.IP_BLACKLIST.split(',') : [],
});

// Request logger with stats integration
const rateLimitLogger = createRateLimitLogger(stats);

// API key authentication middleware (optional for public endpoints)
const apiKeyAuth = createApiKeyMiddleware({
  apiKeyManager,
  required: false, // Allow unauthenticated requests to fall back to IP-based limiting
  checkQuota: true,
  onKeyValidated: (req, keyMetadata) => {
    console.log(`✅ API key validated: ${keyMetadata.name} (${keyMetadata.tier})`);
  },
});

// Create rate limiting middleware
const rateLimitMiddleware = createRateLimitMiddleware({
  redis,
  rules: appConfig.rules,
  defaultConfig: appConfig.defaultRateLimit,
  keyGenerator: (req) => {
    // Skip rate limiting for whitelisted IPs
    if (req.isWhitelisted) {
      return 'whitelisted';
    }
    
    // Use API key if present, otherwise fall back to IP
    if (req.apiKey) {
      return `api:${req.apiKey.id}:${req.path}`;
    }
    
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}:${req.path}`;
  },
  onLimitReached: (req, res, rule) => {
    stats.recordRequest(req, true);
    const identifier = req.apiKey ? `API key ${req.apiKey.name}` : `IP ${req.ip}`;
    console.log(`🚫 Rate limit exceeded for ${identifier} - ${req.method} ${req.path} (rule: "${rule.name}")`);
  },
});

// Create API key-aware rate limiting middleware
const createApiKeyAwareRateLimiter = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting for whitelisted IPs
    if (req.isWhitelisted) {
      stats.recordRequest(req, false);
      return next();
    }

    // If API key is present, use tier-specific rate limiting
    if (req.apiKey && req.apiKey.rateLimit) {
      const key = `api:${req.apiKey.id}:${req.originalUrl}`;
      const config = req.apiKey.rateLimit;
      
      try {
        const rateLimiter = createOptimizedRateLimiter(redis, {
          windowMs: config.windowMs,
          maxRequests: config.maxRequests,
          algorithm: config.algorithm,
          burstCapacity: config.burstCapacity,
          keyGenerator: () => key,
        });

        await rateLimiter.middleware()(req, res, (err?: any) => {
          if (!err && res.statusCode !== 429) {
            stats.recordRequest(req, false);
          }
          next(err);
        });
      } catch (error) {
        console.error('API key rate limiting error:', error);
        // Fall back to default rate limiting
        rateLimitMiddleware(req, res, next);
      }
    } else {
      // Use default IP-based rate limiting
      rateLimitMiddleware(req, res, next);
    }
  };
};

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: redis.isHealthy(),
    uptime: process.uptime(),
  };

  res.status(redis.isHealthy() ? 200 : 503).json(health);
});

// Dashboard endpoint
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard.html'));
});

// Redirect root to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Configuration endpoints
app.get('/config', (req, res) => {
  res.json({
    defaultRateLimit: appConfig.defaultRateLimit,
    rules: appConfig.rules.map(rule => ({
      ...rule,
      // Don't expose sensitive config details
    })),
    monitoring: appConfig.monitoring,
  });
});

// Rate limit management endpoints
app.post('/rules', (req, res) => {
  try {
    const rule: RateLimitRule = req.body;
    
    // Validate rule
    if (!rule.id || !rule.name || !rule.pattern || !rule.config) {
      return res.status(400).json({ error: 'Invalid rule format' });
    }

    // Add or update rule
    const existingIndex = appConfig.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      appConfig.rules[existingIndex] = rule;
    } else {
      appConfig.rules.push(rule);
    }

    return res.json({ message: 'Rule added/updated successfully', rule });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add/update rule' });
  }
});

app.delete('/rules/:id', (req, res) => {
  try {
    const { id } = req.params;
    const index = appConfig.rules.findIndex(r => r.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    appConfig.rules.splice(index, 1);
    return res.json({ message: 'Rule deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// Reset rate limits
app.post('/reset/:key', createResetEndpoint(redis));

// API Key Management Endpoints

// Generate new API key
app.post('/api-keys', async (req, res): Promise<void> => {
  try {
    const { name, tier = 'free', userId, organizationId, metadata } = req.body;
    
    if (!name) {
      res.status(400).json({ error: 'API key name is required' });
      return;
    }

    const result = await apiKeyManager.generateApiKey({
      name,
      tier,
      userId,
      organizationId,
      metadata,
    });

    res.status(201).json({
      message: 'API key created successfully',
      apiKey: result.apiKey,
      metadata: {
        ...result.metadata,
        key: undefined, // Don't expose the hashed key
      },
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to create API key',
      message: error.message,
    });
  }
});

// List API keys for a user
app.get('/api-keys', async (req, res): Promise<void> => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      res.status(400).json({ error: 'userId query parameter is required' });
      return;
    }

    const keys = await apiKeyManager.getUserKeys(userId as string);
    
    // Remove sensitive data
    const sanitizedKeys = keys.map(key => ({
      ...key,
      key: undefined,
    }));

    res.json({
      message: 'API keys retrieved successfully',
      keys: sanitizedKeys,
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to retrieve API keys',
      message: error.message,
    });
  }
});

// Get available tiers (must be before /:keyId route)
app.get('/api-keys/tiers', (req, res) => {
  try {
    const tiers = apiKeyManager.getTiers();
    res.json({
      message: 'Available API key tiers',
      tiers,
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to retrieve tiers',
      message: error.message,
    });
  }
});

// Get API key details (for authenticated requests)
app.get('/api-keys/:keyId', async (req, res): Promise<void> => {
  try {
    const { keyId } = req.params;
    const metadata = await apiKeyManager.getKeyMetadata(keyId);
    
    if (!metadata) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    // Remove sensitive data
    const sanitizedMetadata = {
      ...metadata,
      key: undefined,
    };

    res.json({
      message: 'API key details retrieved successfully',
      metadata: sanitizedMetadata,
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to retrieve API key details',
      message: error.message,
    });
  }
});

// Revoke API key
app.delete('/api-keys/:keyId', async (req, res): Promise<void> => {
  try {
    const { keyId } = req.params;
    const success = await apiKeyManager.revokeApiKey(keyId);
    
    if (!success) {
      res.status(404).json({ error: 'API key not found or already revoked' });
      return;
    }

    res.json({ message: 'API key revoked successfully' });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to revoke API key',
      message: error.message,
    });
  }
});

// Check API key usage/quota
app.get('/api-keys/:keyId/usage', async (req, res) => {
  try {
    const { keyId } = req.params;
    const quotaCheck = await apiKeyManager.checkQuota(keyId);
    
    res.json({
      message: 'API key usage information',
      ...quotaCheck,
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to retrieve usage information',
      message: error.message,
    });
  }
});

// Stats endpoint
app.get('/stats', async (req, res) => {
  try {
    const simpleStats = stats.getStats();
    res.json({
      message: 'API Rate Limiter Statistics',
      timestamp: new Date().toISOString(),
      stats: simpleStats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Performance stats endpoint
app.get('/performance', (req, res) => {
  try {
    const performanceStats = performanceMonitor.getStats();
    res.json({
      message: 'Performance Statistics',
      timestamp: new Date().toISOString(),
      performance: performanceStats,
      system: performanceMonitor.getCurrentSystemMetrics(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get performance stats' });
  }
});

// TODO: Fix endpoint-specific performance stats route
// app.get('/performance/endpoint/*', (req, res) => {
//   try {
//     const endpoint = (req.params as any)[0]; // Get everything after /performance/endpoint/
//     const endpointStats = performanceMonitor.getEndpointStats(decodeURIComponent(endpoint));
    
//     if (!endpointStats) {
//       return res.status(404).json({ error: 'No performance data found for this endpoint' });
//     }

//     return res.json({
//       message: `Performance statistics for ${endpoint}`,
//       timestamp: new Date().toISOString(),
//       endpoint,
//       stats: endpointStats,
//     });
//   } catch (error) {
//     return res.status(500).json({ error: 'Failed to get endpoint performance stats' });
//   }
// });

// Export all performance metrics
app.get('/metrics/export', (req, res) => {
  try {
    const exportData = performanceMonitor.exportMetrics();
    res.json({
      message: 'Performance metrics export',
      data: exportData,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to export metrics' });
  }
});

// Optimized rate limiter demo endpoints
app.get('/demo/strict', createOptimizedRateLimiter(redis, RateLimitPresets.strict).middleware(), (req, res) => {
  res.json({ message: 'Strict rate limiting (10 req/min) - sliding window', timestamp: new Date().toISOString() });
});

app.get('/demo/moderate', createOptimizedRateLimiter(redis, RateLimitPresets.moderate).middleware(), (req, res) => {
  res.json({ message: 'Moderate rate limiting (100 req/min) - token bucket with burst', timestamp: new Date().toISOString() });
});

app.get('/demo/heavy', createOptimizedRateLimiter(redis, RateLimitPresets.heavy).middleware(), (req, res) => {
  res.json({ message: 'Heavy operation rate limiting (5 req/min) - fixed window', timestamp: new Date().toISOString() });
});

app.get('/demo/interactive', createOptimizedRateLimiter(redis, RateLimitPresets.interactive).middleware(), (req, res) => {
  res.json({ message: 'Interactive rate limiting (200 req/min) - token bucket with large burst', timestamp: new Date().toISOString() });
});

// Reset stats endpoint
app.post('/stats/reset', (req, res) => {
  stats.reset();
  res.json({ message: 'Statistics reset successfully' });
});

// Apply middleware in order
app.use(ipFilter);
app.use(apiKeyAuth); // Add API key authentication
app.use(rateLimitLogger);

// Create the final rate limiting middleware
const finalRateLimitMiddleware = createApiKeyAwareRateLimiter();

// Apply rate limiting to all other routes
app.use((req, res, next) => {
  // Skip rate limiting for whitelisted IPs
  if (req.isWhitelisted) {
    stats.recordRequest(req, false);
    return next();
  }
  
  // Apply API key-aware rate limiting
  finalRateLimitMiddleware(req, res, (err) => {
    if (err) {
      console.error('Rate limiting error:', err);
    }
    next(err);
  });
});

// Test endpoint for trying out the rate limiter
app.get('/test', (req, res) => {
  res.json({
    message: 'API Rate Limiter is working!',
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress,
  });
});

// Catch-all for other routes (optional proxy functionality)
if (appConfig.proxy) {
  app.all('*', (req, res) => {
    // Basic proxy implementation
    // In production, you might want to use http-proxy-middleware
    res.json({
      message: 'Proxy functionality - implement based on your needs',
      target: appConfig.proxy?.target,
      originalUrl: req.originalUrl,
    });
  });
}

function loadRulesFromConfig(): RateLimitRule[] {
  // Load rules from environment or configuration file
  // This is a basic implementation - you could load from JSON file, database, etc.
  const rulesConfig = process.env.RATE_LIMIT_RULES;
  
  if (rulesConfig) {
    try {
      return JSON.parse(rulesConfig);
    } catch (error) {
      console.error('Failed to parse RATE_LIMIT_RULES:', error);
    }
  }

  // Default rules
  return [
    {
      id: 'api-strict',
      name: 'Strict API Rate Limit',
      pattern: '^/api/.*',
      method: 'POST',
      config: {
        windowMs: 60000, // 1 minute
        max: 10,
        algorithm: 'sliding-window' as const,
      },
      enabled: true,
      priority: 100,
    },
    {
      id: 'general',
      name: 'General Rate Limit',
      pattern: '.*',
      config: {
        windowMs: 60000, // 1 minute
        max: 100,
        algorithm: 'fixed-window' as const,
      },
      enabled: true,
      priority: 1,
    },
  ];
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const server = app.listen(appConfig.server.port, appConfig.server.host, () => {
  console.log(`🚀 API Rate Limiter started on ${appConfig.server.host}:${appConfig.server.port}`);
  console.log(`📊 Redis: ${appConfig.redis.host}:${appConfig.redis.port}`);
  console.log(`⚡ Default algorithm: ${appConfig.defaultRateLimit.algorithm}`);
  console.log(`📝 Active rules: ${appConfig.rules.length}`);
  console.log(`🔧 Performance monitoring: enabled`);
  console.log(`🧹 Starting performance cleanup task...`);
});

// Start performance monitoring cleanup
startPerformanceCleanup();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(async () => {
    await redis.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(async () => {
    await redis.disconnect();
    process.exit(0);
  });
});

export default app;
