import { Express, Request, Response } from 'express';
import { RedisClient } from '../utils/redis';
import { SimpleStats } from '../utils/stats';
import { PerformanceMonitor } from '../utils/performance';
import { ApiRateLimiterConfig } from '../types';
import { renderMetrics } from '../utils/metrics';
import { computeConfigHash } from '../utils/config';
import { validateSystemEndpoint } from '../middleware/validation';
import {
  ConfigResponseSchema,
  HealthResponseSchema,
  PerformanceResponseSchema,
  StatsResponseSchema,
} from '../utils/schemas';
import { getErrorMessage, sendError } from '../utils/httpErrors';
import { ERROR_CODES } from '../utils/errorCodes';
import { log } from '../utils/logger';

export interface SecurityConfigSummary {
  corsOrigin: string;
  corsInfo: unknown;
  demoUsersEnabled: boolean;
}

export interface RegisterSystemRoutesOptions {
  appConfig: ApiRateLimiterConfig;
  redis: RedisClient;
  stats: SimpleStats;
  performanceMonitor: PerformanceMonitor;
  dashboardFilePath: string;
  securityConfig: SecurityConfigSummary;
}

export function registerSystemRoutes(app: Express, options: RegisterSystemRoutesOptions): void {
  const { appConfig, redis, stats, performanceMonitor, dashboardFilePath, securityConfig } = options;

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
}
