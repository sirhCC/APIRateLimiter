import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request } from 'express';

/**
 * Centralized structured logging utility for the API Rate Limiter
 * 
 * Features:
 * - Structured JSON logging for production
 * - Pretty console output for development  
 * - Daily rotating files
 * - Request correlation IDs
 * - Performance metrics integration
 * - Security event tracking
 */

interface LogContext {
  requestId?: string;
  userId?: string;
  apiKeyId?: string;
  endpoint?: string;
  method?: string;
  ip?: string;
  userAgent?: string;
  tier?: string;
  algorithm?: string;
  remaining?: number;
  limit?: number;
  windowMs?: number;
  category?: string;
  environment?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  errors?: string[];
  error?: string;
  host?: string;
  port?: number;
  signal?: string;
  redisHost?: string;
  redisPort?: number;
  redisEnabled?: boolean;
  defaultAlgorithm?: string;
  activeRules?: number;
  metadata?: Record<string, any>;
  config?: string;
  invalidOrigins?: string;
  fallback?: boolean;
  originsCount?: string;
  credentials?: string;
  origins?: string;
  keyId?: string;
}

interface SecurityLogContext extends LogContext {
  eventType: 'auth_success' | 'auth_failure' | 'rate_limit_exceeded' | 'api_key_validated' | 'security_violation' | 'sensitive_endpoint_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, any>;
  apiKey?: string;
}

interface PerformanceLogContext extends LogContext {
  responseTime?: number;
  memoryUsage?: number;
  cpuUsage?: number;
  redisLatency?: number;
}

// Custom format for development (pretty printing)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
  })
);

// Custom format for production (structured JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Log level based on environment
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create transports based on environment
const transports: winston.transport[] = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    level: logLevel,
    format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  })
);

// File transports for production
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
  // Daily rotating file for all logs
  transports.push(
    new DailyRotateFile({
      filename: 'logs/api-rate-limiter-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '30d',
      level: 'info',
      format: prodFormat,
    })
  );

  // Separate file for errors
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '30d',
      level: 'error',
      format: prodFormat,
    })
  );

  // Separate file for security events
  transports.push(
    new DailyRotateFile({
      filename: 'logs/security-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '90d',
      level: 'info',
      format: prodFormat,
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  transports,
  exitOnError: false,
});

/**
 * Enhanced logger class with rate limiter specific methods
 */
export class ApiRateLimiterLogger {
  private static instance: ApiRateLimiterLogger;
  private baseLogger: winston.Logger;

  private constructor() {
    this.baseLogger = logger;
  }

  static getInstance(): ApiRateLimiterLogger {
    if (!ApiRateLimiterLogger.instance) {
      ApiRateLimiterLogger.instance = new ApiRateLimiterLogger();
    }
    return ApiRateLimiterLogger.instance;
  }

  /**
   * Generate a correlation ID for request tracking
   */
  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract request context for logging
   */
  getRequestContext(req: Partial<Request>): LogContext {
    return {
      requestId: (req as any).requestId || this.generateRequestId(),
      endpoint: req.path || req.url,
      method: req.method,
      ip: req.ip || (req as any).clientIp,
      userAgent: req.get?.('User-Agent'),
      userId: (req as any).user?.id || (req as any).user?.email,
      apiKeyId: (req as any).apiKey?.id,
      tier: (req as any).apiKey?.tier || (req as any).user?.role,
    };
  }

  /**
   * General logging methods
   */
  debug(message: string, context: LogContext = {}) {
    this.baseLogger.debug(message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.baseLogger.info(message, context);
  }

  warn(message: string, context: LogContext = {}) {
    this.baseLogger.warn(message, context);
  }

  error(message: string, error?: Error | any, context: LogContext = {}) {
    const errorContext = error instanceof Error ? {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
    } : error ? { error } : {};

    this.baseLogger.error(message, {
      ...context,
      ...errorContext,
    });
  }

  /**
   * Security-specific logging
   */
  security(message: string, context: SecurityLogContext) {
    this.baseLogger.info(`[SECURITY] ${message}`, {
      ...context,
      category: 'security',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Performance-specific logging
   */
  performance(message: string, context: PerformanceLogContext) {
    this.baseLogger.info(`[PERFORMANCE] ${message}`, {
      ...context,
      category: 'performance',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Rate limiting specific logging
   */
  rateLimitEvent(message: string, context: LogContext & {
    allowed: boolean;
    algorithm: string;
    remaining: number;
    limit: number;
    resetTime?: number;
  }) {
    const logLevel = context.allowed ? 'info' : 'warn';
    this.baseLogger[logLevel](`[RATE_LIMIT] ${message}`, {
      ...context,
      category: 'rate_limiting',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * API key events
   */
  apiKeyEvent(message: string, context: LogContext & {
    action: 'validated' | 'invalid' | 'quota_exceeded' | 'generated' | 'revoked';
    keyId?: string;
    tier?: string;
  }) {
    this.baseLogger.info(`[API_KEY] ${message}`, {
      ...context,
      category: 'api_key',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * System startup and configuration
   */
  system(message: string, context: LogContext = {}) {
    this.baseLogger.info(`[SYSTEM] ${message}`, {
      ...context,
      category: 'system',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Redis operations
   */
  redis(message: string, context: LogContext & {
    operation?: string;
    latency?: number;
    fallback?: boolean;
    host?: string;
    port?: number;
  }) {
    this.baseLogger.info(`[REDIS] ${message}`, {
      ...context,
      category: 'redis',
      timestamp: new Date().toISOString(),
    });
  }
}

// Export singleton instance
export const log = ApiRateLimiterLogger.getInstance();

// Export for compatibility with existing code
export default log;

/**
 * Express middleware to add request ID and logger to request object
 */
export function loggerMiddleware(req: any, res: any, next: any) {
  req.requestId = log.generateRequestId();
  req.logger = log;
  
  // Add request ID to response headers for tracing
  res.setHeader('X-Request-ID', req.requestId);
  
  next();
}

/**
 * Utility function to create child logger with context
 */
export function createChildLogger(context: LogContext) {
  return {
    debug: (message: string, additionalContext: LogContext = {}) => 
      log.debug(message, { ...context, ...additionalContext }),
    info: (message: string, additionalContext: LogContext = {}) => 
      log.info(message, { ...context, ...additionalContext }),
    warn: (message: string, additionalContext: LogContext = {}) => 
      log.warn(message, { ...context, ...additionalContext }),
    error: (message: string, error?: Error | any, additionalContext: LogContext = {}) => 
      log.error(message, error, { ...context, ...additionalContext }),
    security: (message: string, securityContext: Omit<SecurityLogContext, keyof LogContext>) => {
      const fullContext = { ...context, ...securityContext } as SecurityLogContext;
      log.security(message, fullContext);
    },
    performance: (message: string, perfContext: Omit<PerformanceLogContext, keyof LogContext>) => 
      log.performance(message, { ...context, ...perfContext }),
  };
}
