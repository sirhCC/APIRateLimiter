<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# API Rate Limiter Project Instructions

This is a standalone API Rate Limiter service built with Node.js, TypeScript, Express, and Redis.

## Project Overview
- **Purpose**: Provide rate limiting as a service for any API
- **Stack**: Node.js, TypeScript, Express, Redis, IORedis
- **Algorithms**: Token Bucket, Sliding Window, Fixed Window
- **Features**: Configurable rules, monitoring, proxy support

## Code Style Guidelines
- Use TypeScript strict mode
- Prefer async/await over Promises
- Use descriptive variable and function names
- Add proper error handling with try-catch blocks
- Include JSDoc comments for public methods
- Follow Express.js best practices

## Architecture
- `src/types/` - TypeScript interfaces and type definitions
- `src/utils/` - Utility classes (Redis client, helpers)
- `src/middleware/` - Rate limiting algorithms and Express middleware
- `src/index.ts` - Main application server

## Rate Limiting Algorithms
1. **Token Bucket**: Allows bursts, good for APIs with varying load
2. **Sliding Window**: Precise control, prevents burst attacks
3. **Fixed Window**: Simple implementation, memory efficient

## Key Features to Remember
- Redis-backed for distributed rate limiting
- Configurable rules with pattern matching
- Multiple rate limiting algorithms
- RESTful management API
- Health checks and monitoring
- Graceful shutdown handling

## Development Guidelines
- Always handle Redis connection errors gracefully
- Use proper HTTP status codes (429 for rate limiting)
- Include rate limit headers in responses
- Log important events for monitoring
- Test with different Redis configurations
