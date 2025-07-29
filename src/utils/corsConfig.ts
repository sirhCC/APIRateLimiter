import { CorsOptions } from 'cors';

/**
 * CORS Configuration for API Rate Limiter
 * 
 * Provides environment-specific CORS configuration with:
 * - Secure origin validation
 * - Environment-based restrictions
 * - Proper error handling
 * - Multiple origin support
 */

export interface CorsConfig {
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
}

/**
 * Parse CORS origins from environment variable
 */
function parseCorsOrigins(corsOrigin?: string): string[] {
  if (!corsOrigin || corsOrigin.trim() === '') {
    return [];
  }

  // Handle special case for wildcard
  if (corsOrigin === '*') {
    return ['*'];
  }

  // Split multiple origins by comma and clean them
  return corsOrigin
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

/**
 * Validate CORS origin format
 */
function validateOrigin(origin: string): boolean {
  if (origin === '*') {
    return true;
  }

  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Get default CORS origins based on environment
 */
function getDefaultOrigins(env: string): string[] {
  switch (env) {
    case 'development':
      return [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:8080'
      ];
    
    case 'test':
      return [
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ];
    
    case 'staging':
      return [
        'https://staging.example.com',
        'https://staging-api.example.com'
      ];
    
    case 'production':
      return [
        'https://api.example.com',
        'https://dashboard.example.com'
      ];
    
    default:
      return ['http://localhost:3000'];
  }
}

/**
 * Create CORS configuration based on environment and settings
 */
export function createCorsConfig(): CorsConfig {
  const env = process.env.NODE_ENV || 'development';
  const corsOriginEnv = process.env.CORS_ORIGIN;
  
  // Parse origins from environment or use defaults
  let origins: string[];
  
  if (corsOriginEnv) {
    origins = parseCorsOrigins(corsOriginEnv);
    
    // Validate all origins
    const invalidOrigins = origins.filter(origin => !validateOrigin(origin));
    if (invalidOrigins.length > 0) {
      console.warn(`⚠️  WARNING: Invalid CORS origins detected: ${invalidOrigins.join(', ')}`);
      // Filter out invalid origins
      origins = origins.filter(origin => validateOrigin(origin));
    }
    
    // If all origins were invalid, fall back to defaults
    if (origins.length === 0) {
      console.warn(`⚠️  WARNING: All CORS origins were invalid, falling back to defaults`);
      origins = getDefaultOrigins(env);
    }
  } else {
    origins = getDefaultOrigins(env);
  }

  // Warn about wildcard in production
  if (env === 'production' && origins.includes('*')) {
    console.warn(`🚨 SECURITY WARNING: CORS wildcard (*) is enabled in production! This is a security risk.`);
  }

  const config: CorsConfig = {
    origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-RateLimit-*',
      'Cache-Control'
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-RateLimit-Retry-After',
      'X-Response-Time'
    ],
    maxAge: 86400, // 24 hours
  };

  console.log(`🌐 CORS configuration loaded:`);
  console.log(`   Environment: ${env}`);
  console.log(`   Origins: ${origins.length === 1 && origins[0] === '*' ? 'ALL (*)' : origins.length + ' configured'}`);
  console.log(`   Credentials: ${config.credentials}`);
  
  if (env === 'development' || process.env.DEBUG_CORS === 'true') {
    console.log(`   Allowed origins: ${origins.join(', ')}`);
  }

  return config;
}

/**
 * Convert our CorsConfig to Express CORS options
 */
export function toCorsOptions(config: CorsConfig): CorsOptions {
  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        return callback(null, true);
      }

      // Check if wildcard is allowed
      if (config.origins.includes('*')) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (config.origins.includes(origin)) {
        return callback(null, true);
      }

      // Check for subdomain matches (if configured)
      const isSubdomainAllowed = config.origins.some(allowedOrigin => {
        if (allowedOrigin.startsWith('*.')) {
          const domain = allowedOrigin.substring(2);
          return origin.endsWith(domain);
        }
        return false;
      });

      if (isSubdomainAllowed) {
        return callback(null, true);
      }

      // Origin not allowed
      const error = new Error(`CORS policy violation: Origin '${origin}' is not allowed`);
      console.warn(`🚫 CORS blocked: ${origin}`);
      callback(error, false);
    },
    credentials: config.credentials,
    methods: config.methods,
    allowedHeaders: config.allowedHeaders,
    exposedHeaders: config.exposedHeaders,
    maxAge: config.maxAge,
    optionsSuccessStatus: 200, // For legacy browser support
  };
}

/**
 * Validate CORS configuration on startup
 */
export function validateCorsConfig(config: CorsConfig): void {
  const env = process.env.NODE_ENV || 'development';
  
  // Security checks
  if (env === 'production') {
    if (config.origins.includes('*')) {
      throw new Error('🚨 SECURITY ERROR: CORS wildcard (*) is not allowed in production');
    }
    
    if (config.origins.some(origin => origin.startsWith('http:'))) {
      console.warn('⚠️  WARNING: HTTP origins detected in production environment');
    }
    
    if (config.origins.length === 0) {
      throw new Error('🚨 CONFIGURATION ERROR: No CORS origins configured for production');
    }
  }
  
  // Validate origin formats
  const invalidOrigins = config.origins.filter(origin => !validateOrigin(origin));
  if (invalidOrigins.length > 0) {
    throw new Error(`🚨 CONFIGURATION ERROR: Invalid CORS origins: ${invalidOrigins.join(', ')}`);
  }
  
  console.log('✅ CORS configuration validation passed');
}

/**
 * Get CORS configuration info for status endpoints
 */
export function getCorsInfo(config: CorsConfig) {
  return {
    enabled: true,
    originsCount: config.origins.length,
    allowsCredentials: config.credentials,
    allowsWildcard: config.origins.includes('*'),
    maxAge: config.maxAge,
    methods: config.methods,
    environment: process.env.NODE_ENV || 'development',
  };
}

/**
 * Main function to set up CORS
 */
export function setupCors() {
  const config = createCorsConfig();
  validateCorsConfig(config);
  return toCorsOptions(config);
}
