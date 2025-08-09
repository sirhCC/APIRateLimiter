import crypto from 'crypto';
import { z } from 'zod';
import { RateLimitRule, ApiRateLimiterConfig } from '../types';
import { log } from './logger';

// Zod schema for environment-driven configuration
const EnvSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  PORT: z.string().regex(/^\d+$/).optional().default('3000'),
  HOST: z.string().optional().default('0.0.0.0'),
  REDIS_HOST: z.string().optional().default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).optional().default('6379'),
  REDIS_DB: z.string().regex(/^\d+$/).optional().default('0'),
  REDIS_ENABLED: z.string().optional(),
  DEFAULT_WINDOW_MS: z.string().regex(/^\d+$/).optional().default('60000'),
  DEFAULT_MAX_REQUESTS: z.string().regex(/^\d+$/).optional().default('100'),
  DEFAULT_ALGORITHM: z.enum(['token-bucket', 'sliding-window', 'fixed-window']).optional().default('sliding-window'),
  MONITORING_ENABLED: z.string().optional(),
  STATS_RETENTION_MS: z.string().regex(/^\d+$/).optional().default('3600000'),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().optional().default('24h'),
  JWT_ALGORITHM: z.enum(['HS256']).optional().default('HS256'),
  DEMO_USERS_ENABLED: z.string().optional(),
  CORS_ORIGIN: z.string().optional().default('development-default'),
  LOG_AUTH_EVENTS: z.string().optional(),
  LOG_RATE_LIMIT_VIOLATIONS: z.string().optional(),
  RATE_LIMIT_RULES: z.string().optional(),
});

export type LoadedEnv = z.infer<typeof EnvSchema>;

function parseRules(json?: string): RateLimitRule[] {
  if (!json) return [];
  try {
    const rules = JSON.parse(json);
    if (!Array.isArray(rules)) return [];
    return rules as RateLimitRule[];
  } catch (e) {
    log.system('Invalid RATE_LIMIT_RULES JSON', { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

export function loadConfig(): ApiRateLimiterConfig {
  const parsed = EnvSchema.parse(process.env);

  const rules = parseRules(parsed.RATE_LIMIT_RULES);

  const cfg: ApiRateLimiterConfig = {
    redis: {
      host: parsed.REDIS_HOST,
      port: parseInt(parsed.REDIS_PORT, 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(parsed.REDIS_DB, 10),
      enabled: parsed.REDIS_ENABLED === 'true',
    },
    server: {
      port: parseInt(parsed.PORT, 10),
      host: parsed.HOST,
    },
    defaultRateLimit: {
      windowMs: parseInt(parsed.DEFAULT_WINDOW_MS, 10),
      max: parseInt(parsed.DEFAULT_MAX_REQUESTS, 10),
      algorithm: parsed.DEFAULT_ALGORITHM,
    },
    rules,
    monitoring: {
      enabled: parsed.MONITORING_ENABLED !== 'false',
      statsRetentionMs: parseInt(parsed.STATS_RETENTION_MS, 10),
    },
    security: {
      jwtSecret: parsed.JWT_SECRET || 'fallback-demo-secret-change-in-production',
      jwtExpiresIn: parsed.JWT_EXPIRES_IN,
      jwtAlgorithm: parsed.JWT_ALGORITHM,
      demoUsersEnabled: parsed.DEMO_USERS_ENABLED !== 'false',
      corsOrigin: parsed.CORS_ORIGIN,
      logAuthEvents: parsed.LOG_AUTH_EVENTS === 'true',
      logRateLimitViolations: parsed.LOG_RATE_LIMIT_VIOLATIONS === 'true',
    },
  };

  return cfg;
}

// Deep stable stringify to ensure consistent hash irrespective of key insertion order
function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

// Select non-sensitive subset for hashing
function configFingerprintSubset(cfg: ApiRateLimiterConfig) {
  return {
    server: { port: cfg.server.port, host: cfg.server.host },
    redis: { host: cfg.redis.host, port: cfg.redis.port, enabled: cfg.redis.enabled, db: cfg.redis.db },
    defaultRateLimit: cfg.defaultRateLimit,
    monitoring: cfg.monitoring,
    security: { // exclude secrets
      demoUsersEnabled: cfg.security.demoUsersEnabled,
      corsOrigin: cfg.security.corsOrigin,
      jwtAlgorithm: cfg.security.jwtAlgorithm,
    },
    rules: (cfg.rules || []).map(r => ({
      id: r.id,
      pattern: r.pattern,
      method: r.method,
      priority: r.priority,
      enabled: r.enabled,
      algorithm: r.config.algorithm,
      windowMs: r.config.windowMs,
      max: r.config.max,
    })).sort((a, b) => (a.priority || 0) - (b.priority || 0)),
  };
}

export function computeConfigHash(cfg: ApiRateLimiterConfig): { hash: string; includedFields: string[] } {
  const subset = configFingerprintSubset(cfg);
  const serialized = stableStringify(subset);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');
  return {
    hash,
    includedFields: [
      'server.port','server.host',
      'redis.host','redis.port','redis.enabled','redis.db',
      'defaultRateLimit.windowMs','defaultRateLimit.max','defaultRateLimit.algorithm',
      'monitoring.enabled','monitoring.statsRetentionMs',
      'security.demoUsersEnabled','security.corsOrigin','security.jwtAlgorithm',
      'rules[].id','rules[].pattern','rules[].method','rules[].priority','rules[].enabled','rules[].config'
    ]
  };
}
