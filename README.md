# API Rate Limiter

A standalone, Redis-backed rate limiting service that can protect any API with configurable rate limiting rules and multiple algorithms..

## Features

- **Multiple Rate Limiting Algorithms**
  - Token Bucket (allows bursts, good for varying loads)
  - Sliding Window (precise control, prevents burst attacks)
  - Fixed Window (simple, memory efficient)

- **Configurable Rules**
  - URL pattern matching with regex
  - HTTP method filtering
  - Priority-based rule matching
  - Dynamic rule management via REST API

- **Redis-Backed**
  - Distributed rate limiting across multiple instances
  - Persistent state between restarts
  - High performance with Redis

- **Production Ready**
  - Health checks and monitoring
  - Graceful shutdown
  - Comprehensive error handling
  - Security headers with Helmet.js

- **Monitoring & Management**
  - Rate limit statistics
  - Rule management endpoints
  - Reset capabilities
  - Health status reporting

## Quick Start

### Prerequisites

- Node.js 16+
- Redis server
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd api-rate-limiter
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Configure your Redis connection and settings in `.env`

5. Start the development server:
```bash
npm run dev
```

The rate limiter will start on `http://localhost:3000`

### Production Build

```bash
npm run build
npm start
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `REDIS_HOST` | localhost | Redis server host |
| `REDIS_PORT` | 6379 | Redis server port |
| `REDIS_PASSWORD` | - | Redis password (optional) |
| `REDIS_DB` | 0 | Redis database number |
| `DEFAULT_WINDOW_MS` | 60000 | Default window size (1 minute) |
| `DEFAULT_MAX_REQUESTS` | 100 | Default max requests per window |
| `DEFAULT_ALGORITHM` | sliding-window | Default rate limiting algorithm |

### Rate Limiting Algorithms

#### Token Bucket
Best for APIs with varying load patterns that need to allow occasional bursts.

```json
{
  "algorithm": "token-bucket",
  "windowMs": 60000,
  "max": 100,
  "refillRate": 10,
  "bucketSize": 50
}
```

#### Sliding Window
Provides precise rate limiting by tracking requests in a sliding time window.

```json
{
  "algorithm": "sliding-window",
  "windowMs": 60000,
  "max": 100
}
```

#### Fixed Window
Simple and memory-efficient, resets the counter at fixed intervals.

```json
{
  "algorithm": "fixed-window",
  "windowMs": 60000,
  "max": 100
}
```

## API Endpoints

### Health Check
```http
GET /health
```

Returns service health status including Redis connectivity.

### Configuration
```http
GET /config
```

Returns current configuration and active rules.

### Rule Management

#### Add/Update Rule
```http
POST /rules
Content-Type: application/json

{
  "id": "api-strict",
  "name": "Strict API Rate Limit",
  "pattern": "^/api/.*",
  "method": "POST",
  "config": {
    "windowMs": 60000,
    "max": 10,
    "algorithm": "sliding-window"
  },
  "enabled": true,
  "priority": 100
}
```

#### Delete Rule
```http
DELETE /rules/{ruleId}
```

### Rate Limit Reset
```http
POST /reset/{key}
```

Reset rate limits for a specific key.

### Statistics
```http
GET /stats
```

Get rate limiting statistics (extend as needed).

## Usage Examples

### As a Proxy
Configure the rate limiter to proxy requests to your API:

```javascript
// Set proxy configuration
const config = {
  proxy: {
    target: "https://your-api.com",
    changeOrigin: true
  }
};
```

### As Middleware
Use the rate limiter as middleware in your Express application:

```javascript
import { createRateLimitMiddleware } from './middleware';

const rateLimitMiddleware = createRateLimitMiddleware({
  redis: redisClient,
  rules: yourRules,
  defaultConfig: defaultConfig
});

app.use(rateLimitMiddleware);
```

### Rate Limiting Headers

The service adds the following headers to responses:

- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets
- `X-RateLimit-Window`: Window size in milliseconds
- `X-RateLimit-Algorithm`: Algorithm used
- `X-RateLimit-Rule`: Matched rule name (if any)

## Docker Support

Create a `Dockerfile`:

```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 3000

CMD ["npm", "start"]
```

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run clean` - Clean build directory

### Project Structure

```
src/
├── index.ts              # Main application server
├── types/
│   └── index.ts          # TypeScript type definitions
├── middleware/
│   ├── index.ts          # Express middleware
│   └── rateLimiter.ts    # Rate limiting algorithms
└── utils/
    └── redis.ts          # Redis client wrapper
```

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please file an issue on GitHub.

---

**Made with care for the developer community**
