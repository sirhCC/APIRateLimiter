<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# API Rate Limiter Project Instructions

This is a standalone API Rate Limiter service built with Node.js, TypeScript, Express, and Redis.

## Project Overview
- **Purpose**: Provide rate limiting as a service for any API
- **Stack**: Node.js, TypeScript, Express, Redis, IORedis
- **Algorithms**: Token Bucket, Sliding Window, Fixed Window
- **Features**: Configurable rules, monitoring, proxy support, performance tracking, API key management

## Architecture & Data Flow
- **Entry Point**: `src/index.ts` - Express server with middleware stack
- **Middleware Chain**: Helmet → CORS → Performance Monitor → Morgan → JSON → IP Filter → API Key Auth → Rate Limit Logger → Rate Limiter
- **Core Components**:
  - `src/utils/redis.ts` - Redis client with Lua scripts for atomic operations
  - `src/utils/stats.ts` - Circular buffers & LRU caches for efficient statistics
  - `src/utils/performance.ts` - Real-time performance monitoring
  - `src/utils/apiKeys.ts` - API key generation, validation, and tier management
  - `src/middleware/` - Rate limiting algorithms and Express middleware
  - `src/types/` - TypeScript interfaces and type definitions

## Key Performance Patterns
- **Circular Buffers**: Used in `stats.ts` for O(1) operations vs O(n) array operations
- **LRU Caches**: Prevent memory leaks with bounded endpoint/IP tracking (500/1000 limits)
- **Lua Scripts**: Atomic Redis operations in `redis.ts` prevent race conditions
- **Caching**: 1-second cache for expensive statistics calculations
- **Memory Management**: Automatic cleanup prevents unbounded growth

## Rate Limiting Algorithms
1. **Token Bucket**: Allows bursts, good for APIs with varying load (`tokensPerInterval`, `burstCapacity`)
2. **Sliding Window**: Precise control using Redis sorted sets with timestamp cleanup
3. **Fixed Window**: Memory efficient with Redis counters and expiration

## API Key Management
- **Tiers**: Free (100/min), Premium (1000/min + burst), Enterprise (10000/min + burst)
- **Features**: Quota tracking, usage analytics, tier-based rate limits, key generation/revocation
- **Authentication**: Optional middleware with automatic tier detection and quota enforcement
- **Storage**: Redis-backed with hashed keys, user indexing, and monthly quota tracking

## Development Workflow
- **Dev Server**: `npm run dev` (nodemon with ts-node, auto-restart on changes)
- **Build**: `npm run build` (TypeScript compilation to `dist/`)
- **Production**: `npm start` (runs compiled JavaScript)
- **Testing**: Start Redis, run `npm run dev`, then `npm test` (uses `test-setup.js`)

## Configuration Patterns
- **Environment-driven**: All config through `.env` variables with sensible defaults
- **Type-safe Config**: `ApiRateLimiterConfig` interface ensures consistency
- **Rule System**: Priority-based pattern matching with regex support
- **Hot-reload**: Rules can be updated via REST API without restart

## Redis Integration
- **Connection**: IORedis with connection pooling, auto-reconnect, lazy connect
- **Lua Scripts**: Pre-compiled scripts for `tokenBucket`, `slidingWindow`, `fixedWindow`
- **Error Handling**: Graceful degradation when Redis unavailable (fail-open pattern)
- **Key Patterns**: `rate_limit:${ip}:${path}` or `api:${apiKey}:${path}`

## Monitoring & Statistics
- **Dual Statistics**: `SimpleStats` (basic) + `PerformanceMonitor` (advanced)
- **Real-time Metrics**: Response times (P50/P95/P99), memory usage, CPU trends
- **Endpoints**: `/stats`, `/performance`, `/health`, `/metrics/export`
- **Headers**: Standard rate limit headers (`X-RateLimit-*`) on all responses
- **API Keys**: Usage tracking, quota monitoring, tier information in headers

## Code Style Guidelines
- Use TypeScript strict mode
- Prefer async/await over Promises
- Use descriptive variable and function names
- Add proper error handling with try-catch blocks
- Include JSDoc comments for public methods
- Follow Express.js best practices

## Testing & Debugging
- **Health Check**: `/health` endpoint shows Redis connectivity
- **Demo Endpoints**: `/demo/strict`, `/demo/moderate`, `/demo/heavy`, `/demo/interactive`
- **Manual Testing**: Use curl to test rate limits, check headers
- **Statistics**: `/stats` and `/performance` for real-time monitoring
- **API Key Testing**: Generate keys via dashboard, test with `X-API-Key` header

## Key Files to Understand
- `src/index.ts` - Main server setup and middleware configuration
- `src/utils/stats.ts` - Performance-optimized statistics with circular buffers
- `src/utils/redis.ts` - Redis client with Lua scripts for atomic operations
- `src/utils/apiKeys.ts` - API key generation, validation, tier management, and usage tracking
- `src/middleware/apiKeyAuth.ts` - API key authentication and quota enforcement middleware
- `src/middleware/optimizedRateLimiter.ts` - High-performance rate limiter implementation
- `src/types/index.ts` - All TypeScript interfaces and type definitions

## Development Guidelines
- Always handle Redis connection errors gracefully (fail-open pattern)
- Use proper HTTP status codes (429 for rate limiting)
- Include rate limit headers in responses
- Log important events for monitoring
- Test with different Redis configurations
- Memory efficiency: Use circular buffers and LRU caches for bounded collections
