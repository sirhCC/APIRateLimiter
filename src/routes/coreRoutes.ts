import { Express, Request, Response, RequestHandler } from 'express';
import { RedisClient } from '../utils/redis';
import { SimpleStats } from '../utils/stats';
import { PerformanceMonitor } from '../utils/performance';
import { ApiRateLimiterConfig, RateLimitRule } from '../types';
import { log } from '../utils/logger';
import { renderMetrics } from '../utils/metrics';
import { computeConfigHash } from '../utils/config';
import { createOptimizedRateLimiter, RateLimitPresets } from '../middleware/optimizedRateLimiter';
import { requireJWT, requirePermission, requireRole } from '../middleware/jwtAuth';
import { getErrorMessage, sendError } from '../utils/httpErrors';
import { ERROR_CODES } from '../utils/errorCodes';
import {
  validateApiKeyEndpoint,
  validateJwtEndpoint,
  validateRuleEndpoint,
  validateSystemEndpoint,
} from '../middleware/validation';
import {
  ConfigResponseSchema,
  CreateRuleRequestSchema,
  HealthResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  PerformanceResponseSchema,
  ResetParamsSchema,
  ResetResponseSchema,
  RuleParamsSchema,
  RuleResponseSchema,
  StatsResponseSchema,
  VerifyTokenResponseSchema,
} from '../utils/schemas';

interface SecurityConfigSummary {
  corsOrigin: string;
  corsInfo: unknown;
  demoUsersEnabled: boolean;
}

export interface RegisterCoreRoutesOptions {
  appConfig: ApiRateLimiterConfig;
  redis: RedisClient;
  stats: SimpleStats;
  performanceMonitor: PerformanceMonitor;
  authRateLimiter: RequestHandler;
  dashboardFilePath: string;
  securityConfig: SecurityConfigSummary;
}

export function registerCoreRoutes(app: Express, options: RegisterCoreRoutesOptions): void {
  const jwt = require('jsonwebtoken');
  const {
    appConfig,
    redis,
    stats,
    performanceMonitor,
    authRateLimiter,
    dashboardFilePath,
    securityConfig,
  } = options;

  app.get('/health', validateSystemEndpoint(undefined, HealthResponseSchema), (req: Request, res: Response) => {
    const status = redis.getStatus();
    const health = {
      status: status.healthy ? 'ok' as const : 'error' as const,
      timestamp: new Date().toISOString(),
      redis: {
        enabled: status.enabled,
        healthy: status.healthy,
        connected: status.connected,
        circuitBreakerOpen: status.circuitBreakerOpen,
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version,
      environment: process.env.NODE_ENV || 'development',
    };

    res.status(status.healthy ? 200 : 503).json(health);
  });

  app.get('/ready', async (req: Request, res: Response) => {
    const status = redis.getStatus();
    const ping = await redis.pingLatency();
    const ready = status.healthy && !status.circuitBreakerOpen;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      redis: {
        ...status,
        pingLatencyMs: ping,
      },
      config: {
        defaultAlgorithm: appConfig.defaultRateLimit.algorithm,
        rules: appConfig.rules.length,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
      },
    });
  });

  app.get('/dashboard', (req, res) => {
    res.sendFile(dashboardFilePath);
  });

  app.get('/', (req, res) => {
    res.redirect('/dashboard');
  });

  app.get('/config', validateSystemEndpoint(undefined, ConfigResponseSchema), (req: Request, res: Response) => {
    res.json({
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
        security: securityConfig,
        rateLimit: {
          defaultAlgorithm: appConfig.defaultRateLimit.algorithm,
          activeRules: appConfig.rules.length,
        },
      },
    });
  });

  app.get('/config/hash', (req: Request, res: Response) => {
    const { hash, includedFields } = computeConfigHash(appConfig);
    res.json({
      message: 'Configuration fingerprint',
      hash,
      includedFields,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/rules', validateRuleEndpoint(CreateRuleRequestSchema, undefined, RuleResponseSchema), (req: Request, res: Response) => {
    try {
      const incomingRule: RateLimitRule = req.body;
      const existingIndex = appConfig.rules.findIndex((rule) => rule.id === incomingRule.id);

      let savedRule: RateLimitRule;
      if (existingIndex >= 0) {
        appConfig.rules[existingIndex] = incomingRule;
        savedRule = appConfig.rules[existingIndex];
      } else {
        savedRule = {
          ...incomingRule,
          id: incomingRule.id || `rule-${Date.now()}`,
        };
        appConfig.rules.push(savedRule);
      }

      return res.json({
        message: 'Rule added/updated successfully',
        rule: {
          id: savedRule.id,
          name: savedRule.name,
          pattern: savedRule.pattern,
          method: savedRule.method,
          config: savedRule.config,
          enabled: savedRule.enabled,
          priority: savedRule.priority,
          description: (savedRule as RateLimitRule & { description?: string }).description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      return sendError(res, req, 500, 'Failed to add/update rule', getErrorMessage(error), {
        code: ERROR_CODES.RULES.UPSERT_FAILED,
      });
    }
  });

  app.delete('/rules/:ruleId', validateRuleEndpoint(undefined, RuleParamsSchema, RuleResponseSchema), (req: Request, res: Response) => {
    try {
      const { ruleId } = (req as Request & { validatedParams?: { ruleId: string } }).validatedParams || req.params;
      const index = appConfig.rules.findIndex((rule) => rule.id === ruleId);

      if (index === -1) {
        return sendError(res, req, 404, 'Rule not found', `Rule with ID '${ruleId}' does not exist`, {
          code: ERROR_CODES.RULES.NOT_FOUND,
        });
      }

      appConfig.rules.splice(index, 1);
      return res.json({
        message: 'Rule deleted successfully',
        rule: undefined,
      });
    } catch (error) {
      return sendError(res, req, 500, 'Failed to delete rule', getErrorMessage(error), {
        code: ERROR_CODES.RULES.DELETE_FAILED,
      });
    }
  });

  app.post('/reset/:key', validateApiKeyEndpoint(undefined, undefined, ResetParamsSchema, ResetResponseSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { key: string } }).validatedParams || req.params;
      const { key } = paramsData;
      const currentWindowStart = Math.floor(Date.now() / 60000) * 60000;

      await Promise.all([
        redis.del(key),
        redis.del(`tb:${key}`),
        redis.del(`sw:${key}`),
        redis.del(`fw:${key}`),
        redis.del(`${key}:${currentWindowStart}`),
        redis.del(`fw:${key}:${currentWindowStart}`),
      ]);

      res.json({
        message: 'Rate limit reset successfully',
        key,
        success: true,
      });
    } catch (error) {
      log.system('Rate limit reset error', {
        error: getErrorMessage(error),
        endpoint: req.path,
        method: req.method,
      });
      sendError(res, req, 500, 'Internal Server Error', getErrorMessage(error), {
        code: ERROR_CODES.RATE_LIMIT.RESET_FAILED,
      });
    }
  });

  app.post('/auth/login', authRateLimiter, validateJwtEndpoint(LoginRequestSchema, LoginResponseSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!appConfig.security.demoUsersEnabled) {
        sendError(res, req, 503, 'Demo authentication disabled', 'Demo users are disabled. Please configure your own authentication system.', {
          code: ERROR_CODES.AUTH.DEMO_DISABLED,
        });
        return;
      }

      const demoUsers = {
        'admin@example.com': { id: 'admin-1', role: 'admin', tier: 'enterprise' },
        'premium@example.com': { id: 'premium-1', role: 'premium', tier: 'premium' },
        'user@example.com': { id: 'user-1', role: 'user', tier: 'free' },
        'guest@example.com': { id: 'guest-1', role: 'guest', tier: 'free' },
      } as const;

      const user = demoUsers[email as keyof typeof demoUsers];
      if (!user || password !== 'demo123') {
        sendError(res, req, 401, 'Invalid credentials', 'Use one of the demo accounts: admin@example.com, premium@example.com, user@example.com, guest@example.com with password: demo123', {
          code: ERROR_CODES.AUTH.INVALID_CREDENTIALS,
        });
        return;
      }

      const token = jwt.sign(
        {
          id: user.id,
          email,
          role: user.role,
          tier: user.tier,
          permissions: user.role === 'admin' ? ['read', 'write', 'admin'] : ['read'],
        },
        appConfig.security.jwtSecret,
        {
          expiresIn: '24h',
          algorithm: 'HS256',
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
        expiresIn: '24h',
      });
    } catch (error) {
      sendError(res, req, 500, 'Authentication failed', getErrorMessage(error), {
        code: ERROR_CODES.AUTH.LOGIN_FAILED,
      });
    }
  });

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

  app.get('/metrics', async (req: Request, res: Response): Promise<void> => {
    if (process.env.METRICS_ENABLED === 'false') {
      sendError(res, req, 404, 'Metrics disabled', 'Metrics are disabled', {
        code: ERROR_CODES.METRICS.DISABLED,
      });
      return;
    }

    try {
      const metrics = await renderMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(metrics);
      log.system('Prometheus metrics endpoint accessed', {
        endpoint: '/metrics',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    } catch (error) {
      log.system('Metrics endpoint error', {
        error: getErrorMessage(error),
        severity: 'medium',
        endpoint: '/metrics',
      });
      sendError(res, req, 500, 'Metrics Error', 'Failed to render metrics', {
        code: ERROR_CODES.METRICS.RENDER_FAILED,
      });
    }
  });

  app.get('/admin/users', requireJWT(appConfig.security.jwtSecret), requireRole(['admin']), (req, res) => {
    res.json({
      message: 'Admin endpoint accessed successfully',
      user: req.user,
      data: {
        totalUsers: 1234,
        activeUsers: 892,
        premiumUsers: 156,
      },
    });
  });

  app.get('/premium/features', requireJWT(appConfig.security.jwtSecret), requireRole(['admin', 'premium']), (req, res) => {
    res.json({
      message: 'Premium features accessed',
      user: req.user,
      features: [
        'Advanced Analytics',
        'Priority Support',
        'Custom Rate Limits',
        'API Access',
      ],
    });
  });

  app.get('/secure/data', requireJWT(appConfig.security.jwtSecret), requirePermission(['read', 'write']), (req, res) => {
    res.json({
      message: 'Secure data accessed',
      user: req.user,
      data: {
        sensitive: 'This requires read and write permissions',
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.get('/stats', validateSystemEndpoint(undefined, StatsResponseSchema), async (req: Request, res: Response) => {
    try {
      const simpleStats = stats.getStats();
      const endpoints: Record<string, { requests: number; blocked: number; lastAccess: string }> = {};
      const ips: Record<string, { requests: number; blocked: number; lastAccess: string }> = {};

      if (simpleStats.topEndpoints) {
        simpleStats.topEndpoints.forEach(([endpoint, count]: [string, number]) => {
          endpoints[endpoint] = {
            requests: count,
            blocked: 0,
            lastAccess: new Date().toISOString(),
          };
        });
      }

      if (simpleStats.topIPs) {
        simpleStats.topIPs.forEach(([ip, count]: [string, number]) => {
          ips[ip] = {
            requests: count,
            blocked: 0,
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
      sendError(res, req, 500, 'Stats Error', getErrorMessage(error), {
        code: ERROR_CODES.STATS.READ_FAILED,
      });
    }
  });

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
      sendError(res, req, 500, 'Performance Error', getErrorMessage(error), {
        code: ERROR_CODES.PERFORMANCE.READ_FAILED,
      });
    }
  });

  app.get(/^\/performance\/endpoint\/(.+)$/, (req, res) => {
    try {
      const endpoint = decodeURIComponent(req.params[0] || '');
      if (!endpoint) {
        return sendError(res, req, 400, 'Missing endpoint', 'Endpoint path is required', {
          code: ERROR_CODES.PERFORMANCE.ENDPOINT_MISSING,
        });
      }

      const endpointStats = performanceMonitor.getEndpointStats(endpoint);
      if (!endpointStats) {
        return sendError(res, req, 404, 'Performance data not found', 'No performance data found for this endpoint', {
          code: ERROR_CODES.PERFORMANCE.ENDPOINT_NOT_FOUND,
          extra: { endpoint },
        });
      }

      return res.json({
        message: `Performance statistics for ${endpoint}`,
        timestamp: new Date().toISOString(),
        endpoint,
        stats: endpointStats,
      });
    } catch (error) {
      return sendError(res, req, 500, 'Performance Error', getErrorMessage(error), {
        code: ERROR_CODES.PERFORMANCE.READ_FAILED,
      });
    }
  });

  app.get('/metrics/export', (req, res) => {
    try {
      const exportData = performanceMonitor.exportMetrics();
      res.json({
        message: 'Performance metrics export',
        data: exportData,
      });
    } catch (error) {
      sendError(res, req, 500, 'Metrics Export Error', 'Failed to export metrics', {
        code: ERROR_CODES.METRICS.EXPORT_FAILED,
      });
    }
  });

  app.get('/test', (req, res) => {
    res.json({
      message: 'Test endpoint with JWT-aware rate limiting',
      timestamp: new Date().toISOString(),
      user: req.user || null,
      rateLimitInfo: {
        hasApiKey: !!req.apiKey,
        hasJWT: !!req.user,
        rateLimitApplied: req.apiKey ? 'API Key' : req.user ? 'JWT Role' : 'IP-based',
      },
    });
  });

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

  app.post('/stats/reset', (req, res) => {
    stats.reset();
    res.json({ message: 'Statistics reset successfully' });
  });
}
