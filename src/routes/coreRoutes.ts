import { Express, RequestHandler } from 'express';
import { RedisClient } from '../utils/redis';
import { SimpleStats } from '../utils/stats';
import { PerformanceMonitor } from '../utils/performance';
import { ApiRateLimiterConfig } from '../types';
import { registerSystemRoutes, SecurityConfigSummary } from './systemRoutes';
import { registerAuthRoutes } from './authRoutes';
import { registerRuleRoutes } from './ruleRoutes';
import { registerDemoRoutes } from './demoRoutes';

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
  registerSystemRoutes(app, {
    appConfig: options.appConfig,
    redis: options.redis,
    stats: options.stats,
    performanceMonitor: options.performanceMonitor,
    dashboardFilePath: options.dashboardFilePath,
    securityConfig: options.securityConfig,
  });

  registerAuthRoutes(app, {
    appConfig: options.appConfig,
    authRateLimiter: options.authRateLimiter,
  });

  registerRuleRoutes(app, {
    appConfig: options.appConfig,
    redis: options.redis,
  });

  registerDemoRoutes(app, {
    appConfig: options.appConfig,
    redis: options.redis,
    stats: options.stats,
  });
}
