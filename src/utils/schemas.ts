import { z } from 'zod';

/**
 * Comprehensive Schema Validation for API Rate Limiter
 * 
 * This module defines Zod schemas for all API endpoints, providing:
 * - Runtime type validation
 * - TypeScript type inference
 * - Detailed error messages
 * - Security validation
 */

// Common schemas
export const IdSchema = z.string().min(1, 'ID cannot be empty').max(100, 'ID too long');
export const EmailSchema = z.string().email('Invalid email format');
export const PasswordSchema = z.string().min(6, 'Password must be at least 6 characters');
export const UrlPatternSchema = z.string().min(1, 'URL pattern cannot be empty');
export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

// API Key tier schema
export const ApiKeyTierSchema = z.enum(['free', 'premium', 'enterprise'], {
  message: 'Tier must be one of: free, premium, enterprise'
});

// Rate limiting algorithm schema
export const AlgorithmSchema = z.enum(['token-bucket', 'sliding-window', 'fixed-window'], {
  message: 'Algorithm must be one of: token-bucket, sliding-window, fixed-window'
});

// JWT role schema
export const JwtRoleSchema = z.enum(['admin', 'premium', 'user', 'guest'], {
  message: 'Role must be one of: admin, premium, user, guest'
});

// Metadata schema for flexible key-value pairs
export const MetadataSchema = z.record(z.string(), z.unknown()).optional();

// Rate limiting configuration schema
export const RateLimitConfigSchema = z.object({
  windowMs: z.number().int().min(1000, 'Window must be at least 1000ms').max(86400000, 'Window cannot exceed 24 hours'),
  maxRequests: z.number().int().min(1, 'Max requests must be at least 1').max(1000000, 'Max requests too high'),
  algorithm: AlgorithmSchema,
  burstCapacity: z.number().int().min(1).max(10000).optional(),
  refillRate: z.number().int().min(1).max(1000).optional(),
});

// ================================
// Authentication Endpoints
// ================================

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  role: JwtRoleSchema.optional(),
});

export const LoginResponseSchema = z.object({
  message: z.string(),
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: z.string(),
    tier: z.string(),
  }),
  expiresIn: z.string(),
});

export const VerifyTokenResponseSchema = z.object({
  valid: z.boolean(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: z.string(),
    tier: z.string(),
  }).optional(),
  message: z.string().optional(),
});

// ================================
// API Key Management
// ================================

export const CreateApiKeyRequestSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100, 'Name too long'),
  tier: ApiKeyTierSchema,
  userId: z.string().min(1, 'User ID cannot be empty').max(100, 'User ID too long').optional(),
  organizationId: z.string().min(1).max(100).optional(),
  metadata: MetadataSchema,
  expiresAt: z.string().datetime().optional(),
});

export const ApiKeyResponseSchema = z.object({
  message: z.string(),
  apiKey: z.string(),
  metadata: z.object({
    id: z.string(),
    name: z.string(),
    tier: z.string(),
    userId: z.string().optional(),
    organizationId: z.string().optional(),
    createdAt: z.string().optional(),
    expiresAt: z.string().optional(),
    metadata: MetadataSchema,
  }),
});

export const ListApiKeysQuerySchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  organizationId: z.string().optional(),
  tier: ApiKeyTierSchema.optional(),
  limit: z.string().regex(/^\d+$/, 'Limit must be a number').transform(Number).refine(n => n >= 1 && n <= 100, 'Limit must be between 1 and 100').optional(),
  offset: z.string().regex(/^\d+$/, 'Offset must be a number').transform(Number).optional(),
});

export const ApiKeyParamsSchema = z.object({
  keyId: IdSchema,
});

export const ApiKeyUsageResponseSchema = z.object({
  keyId: z.string(),
  usage: z.object({
    currentMonth: z.number(),
    totalRequests: z.number(),
    lastUsed: z.string().optional(),
    quotaLimit: z.number(),
    quotaRemaining: z.number(),
    resetDate: z.string(),
  }),
  tier: z.string(),
  rateLimit: z.object({
    windowMs: z.number(),
    maxRequests: z.number(),
    algorithm: z.string(),
  }),
});

// ================================
// Rule Management
// ================================

export const CreateRuleRequestSchema = z.object({
  id: IdSchema.optional(),
  name: z.string().min(1, 'Rule name cannot be empty').max(100, 'Rule name too long'),
  pattern: UrlPatternSchema,
  method: HttpMethodSchema.optional(),
  config: RateLimitConfigSchema,
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1, 'Priority must be at least 1').max(1000, 'Priority too high').default(100),
  description: z.string().max(500, 'Description too long').optional(),
});

export const RuleParamsSchema = z.object({
  ruleId: IdSchema,
});

export const RuleResponseSchema = z.object({
  message: z.string(),
  rule: z.object({
    id: z.string(),
    name: z.string(),
    pattern: z.string(),
    method: z.string().optional(),
    config: RateLimitConfigSchema,
    enabled: z.boolean(),
    priority: z.number(),
    description: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }).optional(),
});

// ================================
// Rate Limit Reset
// ================================

export const ResetParamsSchema = z.object({
  key: z.string().min(1, 'Reset key cannot be empty').max(200, 'Reset key too long'),
});

export const ResetResponseSchema = z.object({
  message: z.string(),
  key: z.string(),
  success: z.boolean(),
});

// ================================
// System Endpoints
// ================================

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string(),
  // Backward compatible: originally boolean, now may be object with details
  redis: z.union([z.boolean(), z.object({
    enabled: z.boolean(),
    healthy: z.boolean(),
    connected: z.boolean(),
    circuitBreakerOpen: z.boolean().optional(),
  })]),
  uptime: z.number(),
  version: z.string().optional(),
  environment: z.string().optional(),
});

export const StatsResponseSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
  stats: z.object({
    totalRequests: z.number(),
    blockedRequests: z.number(),
    allowedRequests: z.number(),
    startTime: z.string(),
    uptime: z.number(),
    endpoints: z.record(z.string(), z.object({
      requests: z.number(),
      blocked: z.number(),
      lastAccess: z.string().optional(),
    })),
    ips: z.record(z.string(), z.object({
      requests: z.number(),
      blocked: z.number(),
      lastAccess: z.string().optional(),
    })),
  }),
});

export const PerformanceResponseSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
  performance: z.object({
    totalRequests: z.number(),
    averageResponseTime: z.number(),
    p50ResponseTime: z.number(),
    p95ResponseTime: z.number(),
    p99ResponseTime: z.number(),
    memoryUsage: z.object({
      rss: z.number(),
      heapUsed: z.number(),
      heapTotal: z.number(),
      external: z.number(),
    }),
    cpuUsage: z.object({
      user: z.number(),
      system: z.number(),
    }),
    uptime: z.number(),
  }),
});

export const ConfigResponseSchema = z.object({
  message: z.string(),
  config: z.object({
    server: z.object({
      port: z.number(),
      host: z.string(),
      env: z.string(),
    }),
    redis: z.object({
      enabled: z.boolean(),
      host: z.string(),
      port: z.number(),
      connected: z.boolean().optional(),
    }),
    security: z.object({
      corsOrigin: z.string(),
      corsInfo: z.object({
        enabled: z.boolean(),
        originsCount: z.number(),
        allowsCredentials: z.boolean(),
        allowsWildcard: z.boolean(),
        maxAge: z.number(),
        methods: z.array(z.string()),
        environment: z.string(),
      }),
      demoUsersEnabled: z.boolean(),
    }),
    rateLimit: z.object({
      defaultAlgorithm: z.string(),
      activeRules: z.number(),
    }),
  }),
});

export const ApiKeyTiersResponseSchema = z.object({
  message: z.string(),
  tiers: z.array(z.object({
    name: z.string(),
    displayName: z.string(),
    limits: z.object({
      requestsPerMinute: z.number(),
      requestsPerMonth: z.number(),
      burstCapacity: z.number().optional(),
    }),
    features: z.array(z.string()),
    description: z.string(),
  })),
});

// ================================
// Error Response Schema
// ================================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.array(z.object({
    field: z.string().optional(),
    message: z.string(),
    code: z.string().optional(),
  })).optional(),
  timestamp: z.string(),
  path: z.string().optional(),
  statusCode: z.number().optional(),
});

// ================================
// Type Exports (inferred from schemas)
// ================================

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type VerifyTokenResponse = z.infer<typeof VerifyTokenResponseSchema>;
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;
export type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;
export type ListApiKeysQuery = z.infer<typeof ListApiKeysQuerySchema>;
export type ApiKeyParams = z.infer<typeof ApiKeyParamsSchema>;
export type ApiKeyUsageResponse = z.infer<typeof ApiKeyUsageResponseSchema>;
export type CreateRuleRequest = z.infer<typeof CreateRuleRequestSchema>;
export type RuleParams = z.infer<typeof RuleParamsSchema>;
export type RuleResponse = z.infer<typeof RuleResponseSchema>;
export type ResetParams = z.infer<typeof ResetParamsSchema>;
export type ResetResponse = z.infer<typeof ResetResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type StatsResponse = z.infer<typeof StatsResponseSchema>;
export type PerformanceResponse = z.infer<typeof PerformanceResponseSchema>;
export type ConfigResponse = z.infer<typeof ConfigResponseSchema>;
export type ApiKeyTiersResponse = z.infer<typeof ApiKeyTiersResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
