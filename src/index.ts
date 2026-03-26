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
import { initializeApiKeyManager } from './utils/apiKeys';
import { validateSecurityOnStartup } from './utils/secretManager';
import { setupCors, getCorsInfo, createCorsConfig } from './utils/corsConfig';
import { createApiKeyMiddleware } from './middleware/apiKeyAuth';
import { createJWTAuthMiddleware } from './middleware/jwtAuth';
import { createRateLimitMiddleware, createAutoSensitiveRateLimiter, createSensitiveEndpointLogger } from './middleware';
import { createSensitiveEndpointLimiter } from './middleware/sensitiveEndpointLimiter';
import { createOptimizedRateLimiter } from './middleware/optimizedRateLimiter';
import { createIPFilterMiddleware } from './middleware/ipFilter';
import { createRateLimitLogger } from './middleware/logger';
import { ApiRateLimiterConfig } from './types';
import { log, loggerMiddleware } from './utils/logger';
import { loadConfig } from './utils/config';
import { registerCoreRoutes } from './routes/coreRoutes';
import { registerApiKeyRoutes } from './routes/apiKeyRoutes';
import { getErrorMessage, sendError } from './utils/httpErrors';
import { ERROR_CODES } from './utils/errorCodes';

// Load environment variables
config({ quiet: true });

// Enhanced security validation
validateSecurityOnStartup();

// Setup CORS configuration
const corsOptions = setupCors();
const corsConfig = createCorsConfig();

// Load and validate config centrally
const appConfig: ApiRateLimiterConfig = loadConfig();
log.system('Configuration loaded', {
  environment: process.env.NODE_ENV || 'development',
  redisEnabled: appConfig.redis.enabled,
  defaultAlgorithm: appConfig.defaultRateLimit.algorithm,
  metadata: { rules: appConfig.rules.length }
});

const app = express();

// Middleware
app.use(loggerMiddleware); // Add request ID and logger to requests
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(cors(corsOptions));
app.use(cookieParser()); // Add cookie parser for JWT support
app.use(performanceMonitor.middleware()); // Add performance monitoring
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}
app.use(express.json());


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

// Create rate limiters for sensitive endpoints
const authRateLimiter = createSensitiveEndpointLimiter(redis, 'auth');
const criticalRateLimiter = createSensitiveEndpointLimiter(redis, 'critical');
const managementRateLimiter = createSensitiveEndpointLimiter(redis, 'management');

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
          error: getErrorMessage(error),
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
          error: getErrorMessage(error),
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

registerCoreRoutes(app, {
  appConfig,
  redis,
  stats,
  performanceMonitor,
  authRateLimiter,
  dashboardFilePath: path.join(__dirname, '../public/dashboard.html'),
  securityConfig: {
    corsOrigin: corsConfig.origins.length === 1 && corsConfig.origins[0] === '*' ? '*' : `${corsConfig.origins.length} origins configured`,
    corsInfo: getCorsInfo(corsConfig),
    demoUsersEnabled: appConfig.security.demoUsersEnabled,
  },
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
        error: getErrorMessage(err),
        endpoint: req.originalUrl,
        method: req.method
      });
    }
    next(err);
  });
});



registerApiKeyRoutes(app, {
  apiKeyManager,
  managementRateLimiter,
  criticalRateLimiter,
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


// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log.system('Unhandled error', {
    error: getErrorMessage(err),
    endpoint: req.originalUrl,
    method: req.method,
    severity: 'critical'
  });
  sendError(
    res,
    req,
    500,
    'Internal Server Error',
    process.env.NODE_ENV === 'development' ? getErrorMessage(err) : 'An unexpected error occurred',
    {
      code: ERROR_CODES.SYSTEM.INTERNAL_SERVER_ERROR,
    }
  );
});

let server: any = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(appConfig.server.port, appConfig.server.host, () => {
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

  startPerformanceCleanup();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.system('Received SIGTERM, shutting down gracefully', {
    signal: 'SIGTERM'
  });
  if (server) {
    server.close(async () => {
      await redis.disconnect();
      process.exit(0);
    });
  } else {
    await redis.disconnect();
    process.exit(0);
  }
});

process.on('SIGINT', async () => {
  log.system('Received SIGINT, shutting down gracefully', {
    signal: 'SIGINT'
  });
  if (server) {
    server.close(async () => {
      await redis.disconnect();
      process.exit(0);
    });
  } else {
    await redis.disconnect();
    process.exit(0);
  }
});

export default app;
