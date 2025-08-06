# 🚀 API Rate Limiter

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**🛡️ Enterprise-Grade API Protection**  
*Production-ready rate limiting service with advanced security & comprehensive monitoring*

[![Tests](https://img.shields.io/badge/Tests-73%2F73%20Passing-brightgreen)](./tests/)
[![Coverage](https://img.shields.io/badge/Coverage-20.2%25-yellow)](./tests/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](./docker-compose.yml)
[![Production](https://img.shields.io/badge/Production-Ready-success)](#-production-deployment)

[🚀 Quick Start](#-quick-start) • [📖 API Reference](#-api-reference) • [🔐 Security](#-security-features) • [🛠️ Deployment](#-production-deployment) • [📊 Dashboard](#-dashboard--monitoring)

</div>

---

## 🎯 What is API Rate Limiter?

The **API Rate Limiter** is a standalone, production-ready service that provides **rate limiting as a service** for any API. Built with Node.js, TypeScript, Express, and Redis, it offers enterprise-grade protection with multiple algorithms, comprehensive security features, and real-time monitoring.

### 🌟 Key Features

- **🔥 Multiple Algorithms**: Token Bucket, Sliding Window, Fixed Window
- **🔐 Dual Authentication**: JWT tokens + multi-tier API key system  
- **🛡️ Enterprise Security**: Cryptographic secrets, audit logging, IP filtering
- **⚡ High Performance**: Redis Lua scripts, sub-millisecond response times
- **📊 Real-time Monitoring**: Interactive dashboard with P50/P95/P99 metrics
- **🐳 Production Ready**: Docker deployment with Redis cluster support

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Redis server
- npm or yarn

### 1. Clone & Install
```bash
git clone https://github.com/your-username/api-rate-limiter.git
cd api-rate-limiter
npm install
```

### 2. Setup Environment
```bash
# Create environment file
cp .env.example .env

# Automated secure setup (generates JWT secrets, API keys, etc.)
npm run setup
```

### 3. Start Services
```bash
# Start Redis (if not running)
redis-server

# Start the API Rate Limiter
npm run dev
```

### 4. Test & Explore
```bash
# Test rate limiting
curl http://localhost:3000/demo/moderate

# Check health
curl http://localhost:3000/health

# View live dashboard
open http://localhost:3000/dashboard
```

**🎉 That's it!** Your rate limiter is running and ready to protect APIs.

---

## 📖 API Reference

### Core Endpoints

#### Rate Limiting Proxy
```http
POST /api/rate-limit
Content-Type: application/json
X-API-Key: your-api-key

{
  "path": "/api/users",
  "method": "GET",
  "ip": "192.168.1.100",
  "userId": "user123"
}
```

**Response:**
```json
{
  "allowed": true,
  "remaining": 95,
  "resetTime": 1672531200000,
  "headers": {
    "X-RateLimit-Limit": "100",
    "X-RateLimit-Remaining": "95",
    "X-RateLimit-Reset": "1672531200"
  }
}
```

#### Authentication
```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h"
}
```

### Demo Endpoints (for testing)

| Endpoint | Rate Limit | Description |
|----------|------------|-------------|
| `GET /demo/strict` | 5/minute | Strict rate limiting |
| `GET /demo/moderate` | 10/minute | Moderate rate limiting |
| `GET /demo/heavy` | 1/second | Heavy load testing |
| `GET /demo/interactive` | 3/10 seconds | Interactive testing |

### Monitoring Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health check |
| `GET /stats` | Real-time statistics |
| `GET /performance` | Performance metrics |
| `GET /dashboard` | Interactive web UI |

---

## 🏗️ Rate Limiting Algorithms

### 1. Token Bucket
Best for APIs with bursty traffic patterns.

```javascript
{
  algorithm: 'token-bucket',
  tokensPerInterval: 100,    // Tokens per interval
  interval: 60000,           // 1 minute
  burstCapacity: 150         // Allow bursts up to 150
}
```

### 2. Sliding Window
Precise control with Redis sorted sets.

```javascript
{
  algorithm: 'sliding-window',
  maxRequests: 100,          // Max requests
  windowSize: 60000,         // 1 minute window
  precision: 1000            // 1 second precision
}
```

### 3. Fixed Window
Memory efficient with Redis counters.

```javascript
{
  algorithm: 'fixed-window',
  maxRequests: 100,          // Max requests per window
  windowSize: 60000          // 1 minute window
}
```

---

## 🔐 Security Features

### Multi-tier API Key System

| Tier | Rate Limit | Features |
|------|------------|----------|
| **Free** | 100/min | Basic rate limiting |
| **Premium** | 1,000/min + burst | Priority processing, analytics |
| **Enterprise** | 10,000/min + burst | Custom rules, SLA, support |

### JWT Authentication
```bash
# Generate secure JWT secret (done automatically by npm run setup)
JWT_SECRET=your-cryptographically-secure-secret
JWT_EXPIRY=24h
JWT_ISSUER=api-rate-limiter
```

### IP Filtering
```javascript
// Whitelist specific IPs
IP_WHITELIST=192.168.1.0/24,10.0.0.0/8

// Block specific IPs
IP_BLACKLIST=1.2.3.4,5.6.7.8

// Geographic filtering
GEO_BLOCK_COUNTRIES=CN,RU
```

### Security Headers
Automatically applied security headers:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security`
- `Content-Security-Policy`

---

## 📊 Dashboard & Monitoring

### Interactive Web Dashboard
Access the dashboard at `http://localhost:3000/dashboard`

**Features:**
- 📊 Real-time rate limit statistics
- 🔑 API key management and generation
- 👥 User authentication and JWT token management
- 📈 Performance metrics (P50/P95/P99)
- 🎛️ Configuration management
- 📋 Live request logs

### Performance Metrics

| Metric | Description |
|--------|-------------|
| **Response Time** | P50/P95/P99 percentiles |
| **Memory Usage** | Heap usage with circular buffers |
| **CPU Usage** | Process CPU utilization |
| **Redis Performance** | Connection pool and operation times |
| **Request Rate** | Requests per second by endpoint |

### Real-time Statistics
```bash
# View current statistics
curl http://localhost:3000/stats

# Performance metrics
curl http://localhost:3000/performance

# Detailed metrics export
curl http://localhost:3000/metrics/export
```

---

## 🛠️ Production Deployment

### Docker Deployment

#### Quick Docker Setup
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f api-rate-limiter

# Scale the service
docker-compose up -d --scale api-rate-limiter=3
```

#### Production Docker Compose
```yaml
version: '3.8'
services:
  api-rate-limiter:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### Environment Configuration

#### Production Environment Variables
```bash
# Core Configuration
NODE_ENV=production
PORT=3000
REDIS_URL=redis://localhost:6379

# Security (generated by npm run setup)
JWT_SECRET=your-secure-secret
ENCRYPTION_KEY=your-encryption-key
API_KEY_SECRET=your-api-key-secret

# Performance
REDIS_MAX_RETRIES=3
REDIS_CONNECT_TIMEOUT=5000
RATE_LIMIT_MEMORY_CACHE=true

# Monitoring
ENABLE_PROMETHEUS=true
LOG_LEVEL=info
```

### Cloud Platform Deployment

#### AWS ECS
```bash
# Build and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com
docker build -t api-rate-limiter .
docker tag api-rate-limiter:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/api-rate-limiter:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/api-rate-limiter:latest
```

#### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-rate-limiter
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-rate-limiter
  template:
    metadata:
      labels:
        app: api-rate-limiter
    spec:
      containers:
      - name: api-rate-limiter
        image: your-registry/api-rate-limiter:latest
        ports:
        - containerPort: 3000
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
```

---

## 🧪 Testing & Development

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm run test -- --testNamePattern="API Key"

# Watch mode for development
npm run test:watch
```

### Test Results
- **✅ 73/73 tests passing**
- **📊 20.2% code coverage**
- **🔬 Comprehensive integration tests**
- **⚡ Performance benchmarks**

### Development Commands
```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint and format code
npm run lint
npm run format

# Setup development environment
npm run setup:dev
```

### Load Testing
```bash
# Basic load test
npm run test:load

# Heavy load test (1000 req/s)
npm run test:load:heavy

# Custom load test
npx artillery run tests/load-test-config.yml
```

---

## 🔧 Configuration Reference

### Core Configuration

#### Rate Limiting Rules
```javascript
// config/rate-limits.js
module.exports = {
  rules: [
    {
      path: '/api/auth/*',
      method: 'POST',
      limit: 5,
      window: 60000,
      algorithm: 'sliding-window',
      priority: 1
    },
    {
      path: '/api/users',
      method: 'GET',
      limit: 100,
      window: 60000,
      algorithm: 'token-bucket',
      burstCapacity: 150
    }
  ]
};
```

#### Advanced Configuration
```javascript
// Full configuration options
const config = {
  // Server
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  // Redis
  redis: {
    url: process.env.REDIS_URL,
    maxRetries: 3,
    connectTimeout: 5000,
    lazyConnect: true
  },
  
  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: '24h',
    enableApiKeys: true,
    enableJWT: true,
    enableIPFilter: true
  },
  
  // Performance
  performance: {
    enableCache: true,
    cacheTTL: 1000,
    maxMemoryUsage: '512mb',
    enableCircularBuffers: true
  }
};
```

### API Key Management
```bash
# Generate new API key via CLI
node scripts/generate-api-key.js --tier=premium

# Revoke API key
node scripts/revoke-api-key.js --key=api_key_here

# List all API keys
node scripts/list-api-keys.js
```

---

## 🚦 Usage Examples

### Basic Integration
```javascript
// Express.js integration
const rateLimit = require('./src/middleware/rateLimiter');

app.use('/api', rateLimit({
  algorithm: 'token-bucket',
  tokensPerInterval: 100,
  interval: 60000,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip
}));
```

### Custom Rate Limiting Rules
```javascript
// Custom rules based on user tier
const customRateLimit = rateLimit({
  keyGenerator: (req) => `${req.user.tier}:${req.ip}`,
  limit: (req) => {
    switch(req.user.tier) {
      case 'premium': return 1000;
      case 'free': return 100;
      default: return 50;
    }
  }
});
```

### Microservice Integration
```javascript
// Rate limit before forwarding to microservice
app.use('/api/users', rateLimit(userAPILimits), (req, res) => {
  // Forward to user microservice
  proxy('http://user-service:3001', {
    proxyReqPathResolver: (req) => req.originalUrl
  })(req, res);
});
```

---

## 📚 Additional Resources

### Documentation
- [System Architecture](./docs/ARCHITECTURE.md) - Detailed system design
- [Security Guide](./docs/SECURITY.md) - Comprehensive security documentation
- [API Documentation](./docs/API.md) - Complete API reference
- [Deployment Guide](./docs/DEPLOYMENT.md) - Production deployment strategies

### Examples & Tutorials
- [Integration Examples](./examples/) - Code examples for common use cases
- [Docker Examples](./examples/docker/) - Docker deployment examples
- [Kubernetes Examples](./examples/k8s/) - Kubernetes deployment manifests

### Performance & Monitoring
- [Performance Benchmarks](./docs/PERFORMANCE.md) - Detailed performance analysis
- [Monitoring Setup](./docs/MONITORING.md) - Prometheus & Grafana integration
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Common issues and solutions

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Reporting Issues
- Use the [GitHub Issues](https://github.com/your-username/api-rate-limiter/issues) page
- Include system information and steps to reproduce
- Provide logs and error messages when applicable

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙋‍♂️ Support

- **📧 Email**: support@api-rate-limiter.com
- **💬 Discord**: [Join our community](https://discord.gg/api-rate-limiter)
- **📝 Documentation**: Comprehensive guides in this README
- **🐛 Issues**: [GitHub Issues](https://github.com/your-username/api-rate-limiter/issues)

---

<div align="center">

**🎉 Ready to protect your APIs with enterprise-grade rate limiting?**

[🚀 Get Started](#-quick-start) • [📖 Read the Docs](#-api-reference) • [🔐 Security Guide](#-security-features) • [🛠️ Deploy to Production](#-production-deployment)

---

*Built with ❤️ by the API Rate Limiter team*

</div>
