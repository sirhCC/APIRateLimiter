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
import { setupCors, getCorsInfo, createCorsConfig } from './utils/corsConfig';
import { createApiKeyMiddleware, requireApiKey } from './middleware/apiKeyAuth';
import { createJWTAuthMiddleware, requireRole, requirePermission, requireJWT } from './middleware/jwtAuth';
import { createRateLimitMiddleware, createResetEndpoint, createAutoSensitiveRateLimiter, createSensitiveEndpointLogger } from './middleware';
import { createIPFilterMiddleware } from './middleware/ipFilter';
import { createRateLimitLogger } from './middleware/logger';
import { createOptimizedRateLimiter, RateLimitPresets } from './middleware/optimizedRateLimiter';
import { validateJwtEndpoint, validateApiKeyEndpoint, validateRuleEndpoint, validateSystemEndpoint } from './middleware/validation';
import { ApiRateLimiterConfig, RateLimitRule } from './types';
import { log, loggerMiddleware } from './utils/logger';

// Import all validation schemas
import {
  LoginRequestSchema,
  LoginResponseSchema,
  VerifyTokenResponseSchema,
  CreateApiKeyRequestSchema,
  ApiKeyResponseSchema,
  ListApiKeysQuerySchema,
  ApiKeyParamsSchema,
  ApiKeyUsageResponseSchema,
  CreateRuleRequestSchema,
  RuleParamsSchema,
  RuleResponseSchema,
  ResetParamsSchema,
  ResetResponseSchema,
  HealthResponseSchema,
  StatsResponseSchema,
  PerformanceResponseSchema,
  ConfigResponseSchema,
  ApiKeyTiersResponseSchema,
} from './utils/schemas';

// Load environment variables
config();

// Enhanced security validation
validateSecurityOnStartup();

// Setup CORS configuration
const corsOptions = setupCors();
const corsConfig = createCorsConfig();

// Environment validation and setup
function validateEnvironment() {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate JWT secret
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    warnings.push('JWT_SECRET not set - using fallback secret for demo/development');
  } else if (jwtSecret === 'your-super-secret-jwt-key-change-in-production' || 
             jwtSecret === 'docker-demo-secret-change-in-production' || 
             jwtSecret === 'fallback-demo-secret-change-in-production') {
    warnings.push('JWT_SECRET is using default value - change for production');
  } else if (jwtSecret.length < 32) {
    warnings.push('JWT_SECRET should be at least 32 characters for security');
  }
  
  // Warn about production settings
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEMO_USERS_ENABLED === 'true') {
      log.warn('Demo users are enabled in production mode', {
        category: 'security',
        severity: 'medium',
        environment: 'production'
      });
    }
    
    if (process.env.REDIS_ENABLED !== 'true') {
      log.warn('Redis is disabled - limited functionality in production', {
        category: 'system',
        severity: 'high',
        environment: 'production'
      });
    }
  }
  
  if (errors.length > 0) {
    log.error('Environment validation failed', null, {
      category: 'system',
      errors,
      severity: 'critical'
    });
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    log.warn('Environment validation warnings', {
      category: 'system',
      severity: 'medium',
      metadata: { warnings }
    });
  }
  
  log.system('Environment validation passed', {
    environment: process.env.NODE_ENV || 'development',
    redisEnabled: process.env.REDIS_ENABLED === 'true'
  });
}

// Validate environment before starting
validateEnvironment();

const app = express();

// Middleware
app.use(loggerMiddleware); // Add request ID and logger to requests
app.use(helmet());
app.use(cors(corsOptions));
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
    jwtSecret: process.env.JWT_SECRET || 'fallback-demo-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    jwtAlgorithm: (process.env.JWT_ALGORITHM as any) || 'HS256',
    demoUsersEnabled: process.env.DEMO_USERS_ENABLED !== 'false',
    corsOrigin: process.env.CORS_ORIGIN || 'development-default',
    logAuthEvents: process.env.LOG_AUTH_EVENTS === 'true',
    logRateLimitViolations: process.env.LOG_RATE_LIMIT_VIOLATIONS === 'true',
  },
};

// Initialize Redis client with conditional connection
const redis = new RedisClient(appConfig.redis);

// Log Redis status
if (appConfig.redis.enabled) {
  log.redis('Redis connection enabled', {
    host: appConfig.redis.host,
    port: appConfig.redis.port,
    operation: 'connect'
  });
} else {
  log.redis('Redis connection disabled - using in-memory fallback', {
    fallback: true
  });
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
      log.apiKeyEvent('API key validated', {
        ...log.getRequestContext(req),
        action: 'validated',
        keyId: keyMetadata.id,
        tier: keyMetadata.tier,
        metadata: { keyName: keyMetadata.name }
      });
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
    log.security('JWT token validated', {
      ...log.getRequestContext(req),
      eventType: 'auth_success',
      severity: 'low',
      details: {
        userEmail: user.email || user.id,
        userRole: user.role || 'no-role'
      }
    });
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
    
    log.rateLimitEvent('Rate limit exceeded', {
      ...log.getRequestContext(req),
      allowed: false,
      algorithm: rule.config.algorithm,
      remaining: 0,
      limit: rule.config.max,
      metadata: {
        ruleName: rule.name,
        identifier,
        rateLimitType: req.apiKey ? 'api_key' : 'ip_based'
      }
    });
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
        log.security('API key rate limiting error', {
          eventType: 'rate_limit_exceeded',
          severity: 'high',
          error: error instanceof Error ? error.message : String(error),
          apiKey: req.headers['x-api-key'] as string,
          endpoint: req.originalUrl
        });
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
        log.security('JWT rate limiting error', {
          eventType: 'rate_limit_exceeded',
          severity: 'high',
          error: error instanceof Error ? error.message : String(error),
          userId: req.user?.id,
          endpoint: req.originalUrl
        });
        next();
      }
    } else {
      // Priority 3: Default IP-based rate limiting
      rateLimitMiddleware(req, res, next);
    }
  };
};

// Apply middleware in order - THIS MUST BE BEFORE ROUTE DEFINITIONS
app.use(ipFilter);
app.use(jwtAuth); // Add JWT authentication
app.use(apiKeyAuth); // Add API key authentication
app.use(rateLimitLogger);

// Add sensitive endpoint logging and rate limiting
app.use(createSensitiveEndpointLogger());
app.use(createAutoSensitiveRateLimiter(redis));

// Health check endpoint
app.get('/health', validateSystemEndpoint(undefined, HealthResponseSchema), (req: Request, res: Response) => {
  const health = {
    status: redis.isHealthy() ? 'ok' as const : 'error' as const,
    timestamp: new Date().toISOString(),
    redis: redis.isHealthy(),
    uptime: process.uptime(),
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV || 'development',
  };

  res.status(redis.isHealthy() ? 200 : 503).json(health);
});

// Dashboard endpoint
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Redirect root to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Configuration endpoints
app.get('/config', validateSystemEndpoint(undefined, ConfigResponseSchema), (req: Request, res: Response) => {
  const config = {
    message: 'Configuration settings',
    config: {
      server: {
        port: appConfig.server.port,
        host: appConfig.server.host,
        env: process.env.NODE_ENV || 'development',
      },
      redis: {
        enabled: appConfig.redis.enabled,
        host: appConfig.redis.host,
        port: appConfig.redis.port,
        connected: redis.isHealthy(),
      },
      security: {
        corsOrigin: corsConfig.origins.length === 1 && corsConfig.origins[0] === '*' ? '*' : `${corsConfig.origins.length} origins configured`,
        corsInfo: getCorsInfo(corsConfig),
        demoUsersEnabled: appConfig.security.demoUsersEnabled,
      },
      rateLimit: {
        defaultAlgorithm: appConfig.defaultRateLimit.algorithm,
        activeRules: appConfig.rules.length,
      },
    },
  };

  res.json(config);
});

// Rate limit management endpoints
app.post('/rules', validateRuleEndpoint(CreateRuleRequestSchema, undefined, RuleResponseSchema), (req: Request, res: Response) => {
  try {
    const rule: RateLimitRule = req.body;
    
    // Add or update rule
    const existingIndex = appConfig.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      appConfig.rules[existingIndex] = rule;
    } else {
      const newRule = { 
        ...rule, 
        id: rule.id || `rule-${Date.now()}`,
      };
      appConfig.rules.push(newRule);
    }

    const savedRule = appConfig.rules.find(r => r.id === rule.id);
    
    return res.json({ 
      message: 'Rule added/updated successfully', 
      rule: {
        id: savedRule!.id,
        name: savedRule!.name,
        pattern: savedRule!.pattern,
        method: savedRule!.method,
        config: savedRule!.config,
        enabled: savedRule!.enabled,
        priority: savedRule!.priority,
        description: (savedRule as any).description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to add/update rule',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.delete('/rules/:ruleId', validateRuleEndpoint(undefined, RuleParamsSchema, RuleResponseSchema), (req: Request, res: Response) => {
  try {
    const { ruleId } = (req as any).validatedParams || req.params;
    const index = appConfig.rules.findIndex(r => r.id === ruleId);
    
    if (index === -1) {
      return res.status(404).json({ 
        error: 'Rule not found',
        message: `Rule with ID '${ruleId}' does not exist`,
      });
    }

    appConfig.rules.splice(index, 1);
    return res.json({ 
      message: 'Rule deleted successfully',
      rule: undefined,
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to delete rule',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Reset rate limits
app.post('/reset/:key', validateApiKeyEndpoint(undefined, undefined, ResetParamsSchema, ResetResponseSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const paramsData = (req as any).validatedParams || req.params;
    const { key } = paramsData;

    // Try to delete keys for all algorithms
    const deletePromises = [
      redis.del(`tb:${key}`),
      redis.del(`sw:${key}`),
      redis.del(`fw:${key}`)
    ];

    await Promise.all(deletePromises);

    res.json({ 
      message: 'Rate limit reset successfully', 
      key,
      success: true,
    });
  } catch (error) {
    log.system('Rate limit reset error', {
      error: error instanceof Error ? error.message : String(error),
      endpoint: req.path,
      method: req.method
    });
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});

// JWT Authentication Endpoints

// Generate JWT token (demo endpoint)
app.post('/auth/login', validateJwtEndpoint(LoginRequestSchema, LoginResponseSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role = 'user' } = req.body;
    
    // Check if demo users are enabled
    if (!appConfig.security.demoUsersEnabled) {
      res.status(503).json({
        error: 'Demo authentication disabled',
        message: 'Demo users are disabled. Please configure your own authentication system.',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 503,
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
        message: 'Use one of the demo accounts: admin@example.com, premium@example.com, user@example.com, guest@example.com with password: demo123',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 401,
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
      expiresIn: '24h'
    });

  } catch (error: any) {
    res.status(500).json({ 
      error: 'Authentication failed',
      message: error.message,
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});

// Verify JWT token
app.get('/auth/verify', requireJWT(appConfig.security.jwtSecret), validateSystemEndpoint(undefined, VerifyTokenResponseSchema), (req: Request, res: Response) => {
  res.json({
    valid: true,
    user: req.user ? {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      tier: req.user.tier,
    } : undefined,
    message: 'Token is valid',
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
app.get('/stats', validateSystemEndpoint(undefined, StatsResponseSchema), async (req: Request, res: Response) => {
  try {
    const simpleStats = stats.getStats();
    
    // Transform endpoints array to object format
    const endpoints: Record<string, any> = {};
    if (simpleStats.topEndpoints) {
      simpleStats.topEndpoints.forEach(([endpoint, count]: [string, number]) => {
        endpoints[endpoint] = {
          requests: count,
          blocked: 0, // This would need tracking for accurate data
          lastAccess: new Date().toISOString(),
        };
      });
    }
    
    // Transform IPs array to object format  
    const ips: Record<string, any> = {};
    if (simpleStats.topIPs) {
      simpleStats.topIPs.forEach(([ip, count]: [string, number]) => {
        ips[ip] = {
          requests: count,
          blocked: 0, // This would need tracking for accurate data
          lastAccess: new Date().toISOString(),
        };
      });
    }
    
    res.json({
      message: 'API Rate Limiter Statistics',
      timestamp: new Date().toISOString(),
      stats: {
        totalRequests: simpleStats.totalRequests,
        blockedRequests: simpleStats.blockedRequests,
        allowedRequests: simpleStats.allowedRequests,
        startTime: new Date(simpleStats.startTime).toISOString(),
        uptime: simpleStats.uptime,
        endpoints,
        ips,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});

// Prometheus metrics endpoint for production monitoring
app.get('/metrics', (req: Request, res: Response) => {
  try {
    const simpleStats = stats.getStats();
    const performanceStats = performanceMonitor.getStats();
    const currentMemory = process.memoryUsage();
    const timestamp = Date.now();
    
    // Generate Prometheus-compatible metrics
    const metrics = [
      // Request metrics
      `# HELP api_requests_total Total number of API requests`,
      `# TYPE api_requests_total counter`,
      `api_requests_total{status="success"} ${simpleStats.totalRequests - simpleStats.totalBlocked}`,
      `api_requests_total{status="blocked"} ${simpleStats.totalBlocked}`,
      
      // Response time metrics
      `# HELP api_response_time_milliseconds Response time in milliseconds`,
      `# TYPE api_response_time_milliseconds histogram`,
      `api_response_time_milliseconds{quantile="0.5"} ${performanceStats.p50ResponseTime}`,
      `api_response_time_milliseconds{quantile="0.95"} ${performanceStats.p95ResponseTime}`,
      `api_response_time_milliseconds{quantile="0.99"} ${performanceStats.p99ResponseTime}`,
      `api_response_time_milliseconds_sum ${performanceStats.totalRequests * performanceStats.averageResponseTime}`,
      `api_response_time_milliseconds_count ${performanceStats.totalRequests}`,
      
      // Rate limiting metrics
      `# HELP rate_limit_blocked_total Total number of rate limited requests`,
      `# TYPE rate_limit_blocked_total counter`,
      `rate_limit_blocked_total ${simpleStats.totalBlocked}`,
      
      // Memory metrics (current process memory)
      `# HELP memory_usage_bytes Memory usage in bytes`,
      `# TYPE memory_usage_bytes gauge`,
      `memory_usage_bytes{type="heap_used"} ${currentMemory.heapUsed}`,
      `memory_usage_bytes{type="heap_total"} ${currentMemory.heapTotal}`,
      `memory_usage_bytes{type="external"} ${currentMemory.external}`,
      `memory_usage_bytes{type="rss"} ${currentMemory.rss}`,
      
      // Performance trend metrics
      `# HELP memory_trend_increasing Memory usage trend`,
      `# TYPE memory_trend_increasing gauge`,
      `memory_trend_increasing ${performanceStats.memoryTrend.increasing ? 1 : 0}`,
      
      // Error rate metrics
      `# HELP api_error_rate_percent Error rate percentage`,
      `# TYPE api_error_rate_percent gauge`,
      `api_error_rate_percent ${performanceStats.errorRate}`,
      
      // Requests per second
      `# HELP api_requests_per_second Current requests per second`,
      `# TYPE api_requests_per_second gauge`,
      `api_requests_per_second ${performanceStats.requestsPerSecond}`,
      
      // Uptime metrics
      `# HELP uptime_seconds Uptime in seconds`,
      `# TYPE uptime_seconds counter`,
      `uptime_seconds ${process.uptime()}`,
      
      // Redis metrics (basic connectivity)
      `# HELP redis_connected Redis connection status`,
      `# TYPE redis_connected gauge`,
      `redis_connected ${redis ? 1 : 0}`,
      
      ''
    ].join('\n');
    
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
    
    log.system('Prometheus metrics endpoint accessed', {
      endpoint: '/metrics',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
  } catch (error) {
    log.system('Metrics endpoint error', {
      error: error instanceof Error ? error.message : String(error),
      severity: 'medium' as const,
      endpoint: '/metrics'
    });
    res.status(500).send('Error generating metrics');
  }
});

// Performance stats endpoint
app.get('/performance', validateSystemEndpoint(undefined, PerformanceResponseSchema), (req: Request, res: Response) => {
  try {
    const performanceStats = performanceMonitor.getStats();
    const currentMetrics = performanceMonitor.getCurrentSystemMetrics();
    
    res.json({
      message: 'Performance Statistics',
      timestamp: new Date().toISOString(),
      performance: {
        totalRequests: performanceStats.totalRequests,
        averageResponseTime: performanceStats.averageResponseTime,
        p50ResponseTime: performanceStats.p50ResponseTime,
        p95ResponseTime: performanceStats.p95ResponseTime,
        p99ResponseTime: performanceStats.p99ResponseTime,
        memoryUsage: {
          rss: currentMetrics.memory.rss,
          heapUsed: currentMetrics.memory.heapUsed,
          heapTotal: currentMetrics.memory.heapTotal,
          external: currentMetrics.memory.external,
        },
        cpuUsage: {
          user: currentMetrics.cpu.user,
          system: currentMetrics.cpu.system,
        },
        uptime: currentMetrics.uptime,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get performance stats',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
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
      log.system('Rate limiting error', {
        error: err instanceof Error ? err.message : String(err),
        endpoint: req.originalUrl,
        method: req.method
      });
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
app.get('/api-keys/tiers', validateSystemEndpoint(undefined, ApiKeyTiersResponseSchema), (req: Request, res: Response) => {
  res.json({
    message: 'Available API key tiers',
    tiers: [
      {
        name: 'free',
        displayName: 'Free',
        limits: {
          requestsPerMinute: 100,
          requestsPerMonth: 10000,
        },
        features: ['Basic rate limiting', 'Standard support'],
        description: 'Basic rate limiting for free users',
      },
      {
        name: 'premium',
        displayName: 'Premium',
        limits: {
          requestsPerMinute: 1000,
          requestsPerMonth: 100000,
          burstCapacity: 100,
        },
        features: ['Enhanced rate limiting', 'Burst capacity', 'Priority support'],
        description: 'Enhanced rate limiting with burst capacity',
      },
      {
        name: 'enterprise',
        displayName: 'Enterprise',
        limits: {
          requestsPerMinute: 10000,
          requestsPerMonth: 1000000,
          burstCapacity: 500,
        },
        features: ['High-performance rate limiting', 'Large burst capacity', 'Premium support', 'Custom configurations'],
        description: 'High-performance rate limiting for enterprise',
      },
    ],
  });
});

// Generate new API key
app.post('/api-keys', validateApiKeyEndpoint(CreateApiKeyRequestSchema, undefined, undefined, ApiKeyResponseSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, tier = 'free', userId, organizationId, metadata } = req.body;

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
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});

// List API keys for a user
app.get('/api-keys', validateApiKeyEndpoint(undefined, ListApiKeysQuerySchema, undefined, undefined), async (req: Request, res: Response): Promise<void> => {
  try {
    const queryData = (req as any).validatedQuery || req.query;
    const { userId } = queryData;

    const keys = await apiKeyManager.getUserKeys(userId);

    res.json({
      message: 'API keys retrieved',
      keys,
    });

  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to retrieve API keys',
      message: error.message,
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});

// Get specific API key details
app.get('/api-keys/:keyId', validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, undefined), async (req: Request, res: Response): Promise<void> => {
  try {
    const paramsData = (req as any).validatedParams || req.params;
    const { keyId } = paramsData;
    
    const keyMetadata = await apiKeyManager.getKeyMetadata(keyId);
    
    if (!keyMetadata) {
      res.status(404).json({ 
        error: 'API key not found',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 404,
      });
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
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});

// Revoke API key
app.delete('/api-keys/:keyId', validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, undefined), async (req: Request, res: Response): Promise<void> => {
  try {
    const paramsData = (req as any).validatedParams || req.params;
    const { keyId } = paramsData;
    
    const success = await apiKeyManager.revokeApiKey(keyId);
    
    if (!success) {
      res.status(404).json({ 
        error: 'API key not found or already revoked',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 404,
      });
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
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});

// Get API key usage statistics
app.get('/api-keys/:keyId/usage', validateApiKeyEndpoint(undefined, undefined, ApiKeyParamsSchema, ApiKeyUsageResponseSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const paramsData = (req as any).validatedParams || req.params;
    const { keyId } = paramsData;
    
    const quotaCheck = await apiKeyManager.checkQuota(keyId);
    
    const keyMetadata = await apiKeyManager.getKeyMetadata(keyId);
    if (!keyMetadata) {
      res.status(404).json({ 
        error: 'API key not found',
        timestamp: new Date().toISOString(),
        path: req.path,
        statusCode: 404,
      });
      return;
    }

    res.json({
      keyId,
      usage: {
        currentMonth: quotaCheck.usage.currentMonthRequests,
        totalRequests: quotaCheck.usage.totalRequests,
        lastUsed: keyMetadata.lastUsed,
        quotaLimit: quotaCheck.quota || 0,
        quotaRemaining: Math.max(0, (quotaCheck.quota || 0) - quotaCheck.usage.currentMonthRequests),
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      },
      tier: keyMetadata.tier,
      rateLimit: {
        windowMs: keyMetadata.rateLimit?.windowMs || 60000,
        maxRequests: keyMetadata.rateLimit?.maxRequests || 100,
        algorithm: keyMetadata.rateLimit?.algorithm || 'sliding-window',
      },
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Failed to retrieve usage information',
      message: error.message,
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 500,
    });
  }
});


// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.system('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    endpoint: req.originalUrl,
    method: req.method,
    severity: 'critical'
  });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const server = app.listen(appConfig.server.port, appConfig.server.host, () => {
  log.system('API Rate Limiter started', {
    host: appConfig.server.host,
    port: appConfig.server.port,
    redisHost: appConfig.redis.host,
    redisPort: appConfig.redis.port,
    redisEnabled: appConfig.redis.enabled,
    defaultAlgorithm: appConfig.defaultRateLimit.algorithm,
    activeRules: appConfig.rules.length,
    environment: process.env.NODE_ENV || 'development',
    metadata: {
      performanceMonitoring: true,
      cleanupTaskStarted: true
    }
  });
});

// Handle server startup errors
server.on('error', (err: any) => {
  log.system('Server startup error', {
    error: err.message,
    port: appConfig.server.port,
    host: appConfig.server.host,
    severity: 'critical',
    metadata: { errorCode: err.code }
  });
  process.exit(1);
});

// Start performance monitoring cleanup
startPerformanceCleanup();

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.system('Received SIGTERM, shutting down gracefully', {
    signal: 'SIGTERM'
  });
  server.close(async () => {
    await redis.disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  log.system('Received SIGINT, shutting down gracefully', {
    signal: 'SIGINT'
  });
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
      log.system('Failed to parse RATE_LIMIT_RULES', {
        error: error instanceof Error ? error.message : String(error),
        config: rulesConfig,
        severity: 'high'
      });
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
