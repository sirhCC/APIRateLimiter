import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from 'dotenv';
import { RedisClient } from './utils/redis';
import { SimpleStats } from './utils/stats';
import { performanceMonitor, startPerformanceCleanup } from './utils/performance';
import { initializeApiKeyManager, ApiKeyManager } from './utils/apiKeys';
import { validateSecurityOnStartup } from './utils/secretManager';
import { createApiKeyMiddleware, requireApiKey } from './middleware/apiKeyAuth';
import { createJWTAuthMiddleware, requireRole, requirePermission, requireJWT } from './middleware/jwtAuth';
import { createRateLimitMiddleware, createResetEndpoint } from './middleware';
import { createIPFilterMiddleware } from './middleware/ipFilter';
import { createRateLimitLogger } from './middleware/logger';
import { createOptimizedRateLimiter, RateLimitPresets } from './middleware/optimizedRateLimiter';
import { ApiRateLimiterConfig, RateLimitRule } from './types';

// Load environment variables
config();

// Enhanced security validation
validateSecurityOnStartup();

// Environment validation and setup
function validateEnvironment() {
  const errors: string[] = [];
  
  // Validate JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'your-super-secret-jwt-key-change-in-production' || jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be set to a secure random string (minimum 32 characters)');
  }
  
  // Warn about production settings
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEMO_USERS_ENABLED === 'true') {
      console.warn('⚠️  WARNING: Demo users are enabled in production mode');
    }
    
    if (process.env.CORS_ORIGIN === '*') {
      console.warn('⚠️  WARNING: CORS is set to allow all origins in production');
    }
    
    if (process.env.REDIS_ENABLED !== 'true') {
      console.warn('⚠️  WARNING: Redis is disabled - limited functionality in production');
    }
  }
  
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(error => console.error(`   - ${error}`));
    process.exit(1);
  }
  
  console.log('✅ Environment validation passed');
}

// Validate environment before starting
validateEnvironment();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(cookieParser()); // Add cookie parser for JWT support
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
    enabled: process.env.REDIS_ENABLED === 'true',
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
    enabled: process.env.MONITORING_ENABLED !== 'false',
    statsRetentionMs: parseInt(process.env.STATS_RETENTION_MS || '3600000'), // 1 hour
  },
  security: {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    jwtAlgorithm: (process.env.JWT_ALGORITHM as any) || 'HS256',
    demoUsersEnabled: process.env.DEMO_USERS_ENABLED !== 'false',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    logAuthEvents: process.env.LOG_AUTH_EVENTS === 'true',
    logRateLimitViolations: process.env.LOG_RATE_LIMIT_VIOLATIONS === 'true',
  },
};

// Initialize Redis client with conditional connection
const redis = new RedisClient(appConfig.redis);

// Log Redis status
if (appConfig.redis.enabled) {
  console.log(`📡 Redis connection enabled: ${appConfig.redis.host}:${appConfig.redis.port}`);
} else {
  console.log('⚠️  Redis connection disabled - using in-memory fallback');
}

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
    if (appConfig.security.logAuthEvents) {
      console.log(`✅ API key validated: ${keyMetadata.name} (${keyMetadata.tier})`);
    }
  },
});

// JWT authentication middleware (optional for public endpoints)
const jwtAuth = createJWTAuthMiddleware({
  secret: appConfig.security.jwtSecret,
  required: false, // Allow unauthenticated requests
  algorithms: ['HS256'],
  roleBasedRateLimit: {
    admin: {
      windowMs: 60000,
      maxRequests: 10000, // Very high limit for admins
      algorithm: 'token-bucket',
      burstCapacity: 500,
    },
    premium: {
      windowMs: 60000,
      maxRequests: 1000,
      algorithm: 'token-bucket',
      burstCapacity: 100,
    },
    user: {
      windowMs: 60000,
      maxRequests: 500,
      algorithm: 'sliding-window',
    },
    guest: {
      windowMs: 60000,
      maxRequests: 100,
      algorithm: 'fixed-window',
    },
  },
  onTokenValidated: (req, user) => {
    console.log(`✅ JWT validated: ${user.email || user.id} (${user.role || 'no-role'})`);
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

// Create API key and JWT aware rate limiting middleware
const createApiKeyAwareRateLimiter = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting for whitelisted IPs
    if (req.isWhitelisted) {
      stats.recordRequest(req, false);
      return next();
    }

    // Priority 1: API key-specific rate limiting
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
        next();
      }
    }
    // Priority 2: JWT role-based rate limiting
    else if (req.isJWTAuthenticated && req.user && req.jwtRateLimit) {
      const key = `jwt:${req.user.id}:${req.originalUrl}`;
      const config = req.jwtRateLimit;
      
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
        console.error('JWT rate limiting error:', error);
        next();
      }
    } else {
      // Priority 3: Default IP-based rate limiting
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

// JWT Authentication Endpoints

// Generate JWT token (demo endpoint)
app.post('/auth/login', async (req, res): Promise<void> => {
  try {
    const { email, password, role = 'user' } = req.body;
    
    // Demo authentication - in production, validate against your user database
    if (!email || !password) {
      res.status(400).json({ 
        error: 'Email and password are required',
      });
      return;
    }

    // Check if demo users are enabled
    if (!appConfig.security.demoUsersEnabled) {
      res.status(503).json({
        error: 'Demo authentication disabled',
        message: 'Demo users are disabled. Please configure your own authentication system.'
      });
      return;
    }

    // Demo users for testing
    const demoUsers = {
      'admin@example.com': { id: 'admin-1', role: 'admin', tier: 'enterprise' },
      'premium@example.com': { id: 'premium-1', role: 'premium', tier: 'premium' },
      'user@example.com': { id: 'user-1', role: 'user', tier: 'free' },
      'guest@example.com': { id: 'guest-1', role: 'guest', tier: 'free' },
    };

    const user = demoUsers[email as keyof typeof demoUsers];
    if (!user || password !== 'demo123') {
      res.status(401).json({ 
        error: 'Invalid credentials',
        message: appConfig.security.demoUsersEnabled 
          ? 'Use one of the demo accounts: admin@example.com, premium@example.com, user@example.com, guest@example.com with password: demo123'
          : 'Please provide valid credentials'
      });
      return;
    }

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const secret = appConfig.security.jwtSecret;
    
    const token = jwt.sign(
      {
        id: user.id,
        email: email,
        role: user.role,
        tier: user.tier,
        permissions: user.role === 'admin' ? ['read', 'write', 'admin'] : ['read'],
      },
      secret,
      { 
        expiresIn: '24h',
        algorithm: 'HS256'
      }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email,
        role: user.role,
        tier: user.tier,
      },
      expires: '24h'
    });

  } catch (error: any) {
    res.status(500).json({ 
      error: 'Authentication failed',
      message: error.message,
    });
  }
});

// Verify JWT token
app.get('/auth/verify', requireJWT(appConfig.security.jwtSecret), (req, res) => {
  res.json({
    message: 'Token is valid',
    user: req.user,
    isAuthenticated: req.isJWTAuthenticated,
  });
});

// Admin-only endpoint
app.get('/admin/users', 
  requireJWT(appConfig.security.jwtSecret), 
  requireRole(['admin']), 
  (req, res) => {
  res.json({
    message: 'Admin endpoint accessed successfully',
    user: req.user,
    data: {
      totalUsers: 1234,
      activeUsers: 892,
      premiumUsers: 156,
    }
  });
});

// Premium role endpoint
app.get('/premium/features', 
  requireJWT(appConfig.security.jwtSecret), 
  requireRole(['admin', 'premium']), 
  (req, res) => {
  res.json({
    message: 'Premium features accessed',
    user: req.user,
    features: [
      'Advanced Analytics',
      'Priority Support',
      'Custom Rate Limits',
      'API Access'
    ]
  });
});

// Permission-based endpoint
app.get('/secure/data', 
  requireJWT(appConfig.security.jwtSecret), 
  requirePermission(['read', 'write']), 
  (req, res) => {
  res.json({
    message: 'Secure data accessed',
    user: req.user,
    data: {
      sensitive: 'This requires read and write permissions',
      timestamp: new Date().toISOString(),
    }
  });
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

// Test endpoint for JWT-aware rate limiting
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Test endpoint with JWT-aware rate limiting',
    timestamp: new Date().toISOString(),
    user: req.user || null,
    rateLimitInfo: {
      hasApiKey: !!req.apiKey,
      hasJWT: !!req.user,
      rateLimitApplied: req.apiKey ? 'API Key' : req.user ? 'JWT Role' : 'IP-based'
    }
  });
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
app.use(jwtAuth); // Add JWT authentication
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

// API Key Management Endpoints

// Get available tiers
app.get('/api-keys/tiers', (req, res) => {
  res.json({
    message: 'Available API key tiers',
    tiers: {
      free: {
        name: 'Free',
        description: 'Basic rate limiting for free users',
        quota: {
          monthly: 10000,
          daily: 1000,
        },
        rateLimit: {
          windowMs: 60000, // 1 minute
          maxRequests: 100,
          algorithm: 'sliding-window' as const,
        },
      },
      premium: {
        name: 'Premium',
        description: 'Enhanced rate limiting with burst capacity',
        quota: {
          monthly: 100000,
          daily: 10000,
        },
        rateLimit: {
          windowMs: 60000, // 1 minute
          maxRequests: 1000,
          algorithm: 'token-bucket' as const,
          burstCapacity: 100,
        },
      },
      enterprise: {
        name: 'Enterprise',
        description: 'High-performance rate limiting for enterprise',
        quota: {
          monthly: 1000000,
          daily: 100000,
        },
        rateLimit: {
          windowMs: 60000, // 1 minute
          maxRequests: 10000,
          algorithm: 'token-bucket' as const,
          burstCapacity: 500,
        },
      },
    },
  });
});

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
      metadata: {
        ...metadata,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      },
    });

    res.status(201).json({
      message: 'API key generated successfully',
      apiKey: result.apiKey,
      metadata: result.metadata,
    });

  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to generate API key',
      message: error.message,
    });
  }
});

// List API keys for a user
app.get('/api-keys', async (req, res): Promise<void> => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      res.status(400).json({ error: 'userId parameter is required' });
      return;
    }

    const keys = await apiKeyManager.getUserKeys(userId as string);

    res.json({
      message: 'API keys retrieved',
      keys,
    });

  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to retrieve API keys',
      message: error.message,
    });
  }
});

// Get specific API key details
app.get('/api-keys/:keyId', async (req, res): Promise<void> => {
  try {
    const { keyId } = req.params;
    
    const keyMetadata = await apiKeyManager.getKeyMetadata(keyId);
    
    if (!keyMetadata) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json({
      message: 'API key details',
      metadata: keyMetadata,
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

    res.json({
      message: 'API key revoked successfully',
      keyId,
    });

  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to revoke API key',
      message: error.message,
    });
  }
});

// Get API key usage statistics
app.get('/api-keys/:keyId/usage', async (req, res): Promise<void> => {
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
