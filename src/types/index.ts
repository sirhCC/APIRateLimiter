import { Request } from 'express';
import { ApiKeyMetadata } from '../utils/apiKeys';

declare global {
  namespace Express {
    interface Request {
      isWhitelisted?: boolean;
      apiKey?: ApiKeyMetadata;
      isApiKeyAuthenticated?: boolean;
    }
  }
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Maximum number of requests per window
  algorithm: 'token-bucket' | 'sliding-window' | 'fixed-window';
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  onLimitReached?: (req: any, res: any) => void;
}

export interface TokenBucketConfig extends RateLimitConfig {
  algorithm: 'token-bucket';
  refillRate: number; // Tokens per second
  bucketSize: number; // Maximum tokens in bucket
}

export interface SlidingWindowConfig extends RateLimitConfig {
  algorithm: 'sliding-window';
  precision?: number; // Window precision in milliseconds
}

export interface FixedWindowConfig extends RateLimitConfig {
  algorithm: 'fixed-window';
}

export interface RateLimitRule {
  id: string;
  name: string;
  pattern: string; // URL pattern to match
  method?: string; // HTTP method (optional, defaults to all)
  config: RateLimitConfig;
  enabled: boolean;
  priority: number; // Higher priority rules are checked first
}

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  resetTime: number;
  windowStart: number;
  remainingRequests: number;
}

export interface ProxyConfig {
  target: string; // Target API URL
  pathRewrite?: Record<string, string>;
  changeOrigin?: boolean;
  timeout?: number;
}

export interface ApiRateLimiterConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  server: {
    port: number;
    host: string;
  };
  defaultRateLimit: RateLimitConfig;
  rules: RateLimitRule[];
  proxy?: ProxyConfig;
  monitoring: {
    enabled: boolean;
    statsRetentionMs: number;
  };
}
