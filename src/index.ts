import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from 'dotenv';
import { RedisClient } from './utils/redis';
import { createRateLimitMiddleware, createResetEndpoint } from './middleware';
import { ApiRateLimiterConfig, RateLimitRule } from './types';

// Load environment variables
config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
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

// Initialize Redis client
const redis = new RedisClient(appConfig.redis);

// Create rate limiting middleware
const rateLimitMiddleware = createRateLimitMiddleware({
  redis,
  rules: appConfig.rules,
  defaultConfig: appConfig.defaultRateLimit,
  keyGenerator: (req) => {
    // Use API key if present, otherwise fall back to IP
    const apiKey = req.headers['x-api-key'] as string;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return apiKey ? `api:${apiKey}:${req.path}` : `ip:${ip}:${req.path}`;
  },
  onLimitReached: (req, res, rule) => {
    console.log(`Rate limit exceeded for rule "${rule.name}" - ${req.method} ${req.path}`);
  },
});

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

// Stats endpoint
app.get('/stats', async (req, res) => {
  try {
    // This is a basic implementation - you could extend this
    // to provide detailed statistics from Redis
    res.json({
      message: 'Stats endpoint - implement detailed statistics as needed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Apply rate limiting to all other routes
app.use(rateLimitMiddleware);

// Proxy endpoint (if configured)
if (appConfig.proxy) {
  app.use('/*', (req, res) => {
    // Basic proxy implementation
    // In production, you might want to use http-proxy-middleware
    res.json({
      message: 'Proxy functionality - implement based on your needs',
      target: appConfig.proxy?.target,
      originalUrl: req.originalUrl,
    });
  });
} else {
  // Default endpoint for testing
  app.get('/*', (req, res) => {
    res.json({
      message: 'API Rate Limiter is working!',
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      headers: req.headers,
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
});

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
