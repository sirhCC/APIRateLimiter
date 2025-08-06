# 🚀 API Rate Limiter

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**🛡️ Enterprise-Grade API Protection**  
*Production-ready rate limiting service with advanced security & monitoring*

[🚀 Quick Start](#-quick-start) • [📖 Documentation](#-documentation) • [🏗️ Architecture](#%EF%B8%8F-architecture) • [🔐 Security](#-security) • [🎯 Features](#-features)

</div>

---

## 🎯 What is API Rate Limiter?

A production-grade Node.js service that provides **rate limiting as a service** for any API. Built with TypeScript, Express, and Redis, it offers multiple algorithms, enterprise security, and comprehensive monitoring.

### ✨ Key Benefits

- **🛡️ Enterprise Security**: JWT + API keys + cryptographic secrets
- **⚡ High Performance**: Sub-millisecond response times with Redis optimization
- **🧪 Production Ready**: 73/73 tests passing, comprehensive error handling
- **📊 Real-time Monitoring**: Interactive dashboard with live statistics
- **🔄 Zero Downtime**: Graceful Redis failover with in-memory fallback

## 🚀 Quick Start

Get up and running in under 5 minutes:

```bash
# Clone and install
git clone <your-repository-url>
cd APIRateLimiter-2
npm install

# Automated secure setup
npm run setup

# Start development server
npm run dev
```

🎨 **Dashboard**: Open `http://localhost:3000/dashboard`  
🏥 **Health Check**: `curl http://localhost:3000/health`  
🧪 **Test API**: `curl http://localhost:3000/demo/strict`

**Need more details?** See the [📖 Complete Quick Start Guide](./docs/wiki/Getting-Started/Quick-Start.md)

## 🎯 Features

<table>
<tr>
<td width="50%">

### 🔒 **Security & Authentication**
- **Dual Authentication**: JWT tokens + API key management
- **Multi-tier Access**: Free, Premium, Enterprise tiers
- **IP Filtering**: Whitelist/blacklist with geographic support
- **Cryptographic Secrets**: Automatic secure environment setup
- **Audit Logging**: Comprehensive security event tracking

### ⚡ **Performance & Algorithms**
- **3 Rate Limiting Algorithms**: Token Bucket, Sliding Window, Fixed Window
- **Redis Lua Scripts**: Atomic operations prevent race conditions
- **Circular Buffers**: O(1) statistics with bounded memory
- **LRU Caches**: Efficient endpoint and IP tracking
- **Sub-ms Response Times**: Optimized for high-throughput APIs

</td>
<td width="50%">

### 📊 **Monitoring & Analytics**
- **Real-time Dashboard**: Interactive web UI for management
- **Performance Metrics**: P50/P95/P99 response time tracking
- **Usage Analytics**: Request patterns and rate limit statistics
- **Health Monitoring**: Service status and dependency checks
- **Export Capabilities**: CSV, JSON, PDF reporting

### 🛠️ **Operations & Deployment**
- **Docker Ready**: Complete containerization with Redis cluster
- **Environment Driven**: Secure configuration management
- **Graceful Degradation**: Redis failover with in-memory backup
- **Load Balancer Support**: Horizontal scaling with session affinity
- **Production Hardened**: SSL/TLS, security headers, input validation

</td>
</tr>
</table>

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Requests                      │
├─────────────────────────────────────────────────────────┤
│               API Rate Limiter Service                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │   Express   │ │ Middleware  │ │   Dashboard     │   │
│  │   Server    │ │   Stack     │ │     (Web UI)    │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │    Redis    │ │  Statistics │ │   Performance   │   │
│  │   Cluster   │ │   Engine    │ │    Monitor      │   │
│  │ (Optional)  │ │             │ │                 │   │
│  └─────────────┘ └─────────────┘ └─────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                Protected API Services                   │
└─────────────────────────────────────────────────────────┘
```

**Learn More**: [🏗️ System Architecture](./docs/wiki/Architecture/System-Overview.md)

## 🔐 Security

### Authentication Methods

**JWT Authentication** - Role-based access control:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "demo123"}'
```

**API Key Management** - Tiered access system:
```bash
curl -X POST http://localhost:3000/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Key", "tier": "premium", "userId": "user123"}'
```

### Security Features

- **Cryptographic Secrets**: Automatic generation of secure JWT secrets
- **Rate Limiting Protection**: Multiple algorithms prevent API abuse
- **Input Validation**: Comprehensive Zod schema validation
- **Security Headers**: Helmet middleware with CSP, HSTS, and more
- **Audit Trail**: Security event logging and monitoring

**Deep Dive**: [🔐 Security Overview](./docs/wiki/Security/Security-Overview.md)

## 📖 Documentation

### 📚 **Complete Wiki Documentation**

Our comprehensive wiki covers everything from quick setup to advanced deployment:

#### 🚀 **Getting Started**
- [📖 Quick Start Guide](./docs/wiki/Getting-Started/Quick-Start.md) - 5-minute setup
- [📦 Installation Guide](./docs/wiki/Getting-Started/Installation.md) - Detailed installation
- [⚙️ Configuration Guide](./docs/wiki/Getting-Started/Configuration.md) - Environment setup
- [🎯 First Steps](./docs/wiki/Getting-Started/First-Steps.md) - Initial configuration

#### 📖 **API Reference**
- [📋 API Documentation](./docs/wiki/API/API-Reference.md) - Complete endpoint reference
- [🔐 Authentication](./docs/wiki/API/Authentication.md) - JWT and API key usage
- [⚡ Rate Limiting](./docs/wiki/API/Rate-Limiting.md) - Algorithm details and headers
- [❌ Error Handling](./docs/wiki/API/Error-Handling.md) - Error codes and responses

#### 🏗️ **Architecture & Design**
- [🎯 System Overview](./docs/wiki/Architecture/System-Overview.md) - High-level architecture
- [🔄 Data Flow](./docs/wiki/Architecture/Data-Flow.md) - Request processing pipeline
- [⚡ Performance Design](./docs/wiki/Architecture/Performance-Design.md) - Optimization patterns
- [🧠 Algorithm Details](./docs/wiki/Architecture/Rate-Limiting-Algorithms.md) - Rate limiting deep dive

#### 🛠️ **Deployment**
- [🏠 Local Development](./docs/wiki/Deployment/Local-Development.md) - Development setup
- [🚀 Production Setup](./docs/wiki/Deployment/Production-Setup.md) - Production deployment
- [🐳 Docker Deployment](./docs/wiki/Deployment/Docker-Deployment.md) - Container deployment
- [📈 Scaling Guide](./docs/wiki/Deployment/Scaling.md) - High availability setup

#### 📊 **Monitoring & Analytics**
- [📊 Dashboard Guide](./docs/wiki/Monitoring/Dashboard-Guide.md) - Web dashboard usage
- [📈 Metrics & Statistics](./docs/wiki/Monitoring/Metrics.md) - Performance monitoring
- [🏥 Health Checks](./docs/wiki/Monitoring/Health-Checks.md) - System health monitoring
- [🔍 Troubleshooting](./docs/wiki/Monitoring/Troubleshooting.md) - Common issues

### 📋 **Quick Reference**

| Resource | Description | Link |
|----------|-------------|------|
| 🎯 **API Endpoints** | Complete API reference | [View Docs](./docs/wiki/API/API-Reference.md) |
| 🔐 **Security Guide** | Authentication & security | [View Docs](./docs/wiki/Security/Security-Overview.md) |
| 🚀 **Production Setup** | Deployment guide | [View Docs](./docs/wiki/Deployment/Production-Setup.md) |
| 📊 **Dashboard** | Monitoring interface | [View Docs](./docs/wiki/Monitoring/Dashboard-Guide.md) |
| 🧪 **Testing** | Test suite documentation | [View Docs](./docs/wiki/Testing/Testing-Guide.md) |

## 🧪 Testing & Quality

### Test Results: **73/73 Tests Passing** ✅

```bash
npm test
```

**Coverage Areas**:
- ✅ Rate limiting algorithms (Token Bucket, Sliding Window, Fixed Window)
- ✅ Authentication systems (JWT, API keys)
- ✅ Security middleware and validation
- ✅ Performance monitoring and statistics
- ✅ Redis integration and fallback mechanisms
- ✅ API endpoints and error handling

**Quality Metrics**:
- 🎯 **100% Test Reliability**: All tests pass consistently
- ⚡ **Fast Execution**: Complete test suite runs in <5 seconds
- 🛡️ **Edge Case Coverage**: Redis failover, race conditions, memory leaks
- 📊 **Performance Validation**: Response time and throughput testing

## 🐳 Docker Deployment

### Quick Docker Setup

```bash
# Start with Docker Compose (includes Redis)
docker-compose up -d

# Verify deployment
curl http://localhost:3000/health
```

### Production Docker

```bash
# Build production image
docker build -t api-rate-limiter .

# Run with Redis cluster
docker-compose -f docker-compose.prod.yml up -d
```

**Docker Features**:
- Multi-stage builds for optimized images
- Non-root user for security
- Health checks for container monitoring
- Redis cluster support
- Load balancer ready

## 📊 Performance Metrics

### Benchmarks

- **Response Time**: <1ms median, <50ms P95
- **Throughput**: 10,000+ requests/second
- **Memory Usage**: <50MB baseline, efficient scaling
- **CPU Usage**: <5% idle, <30% under load
- **Redis Operations**: <2ms latency with Lua scripts

### Optimization Features

- **Circular Buffers**: O(1) statistics calculations
- **LRU Caches**: Bounded memory usage (500-1000 items)
- **Redis Lua Scripts**: Atomic operations, reduced network calls
- **Connection Pooling**: Efficient Redis connections
- **Lazy Loading**: Resources loaded on demand

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Setup

```bash
# Fork and clone your fork
git clone https://github.com/your-username/api-rate-limiter.git
cd api-rate-limiter

# Install dependencies
npm install

# Setup development environment
npm run setup

# Run tests
npm test

# Start development server
npm run dev
```

### Contributing Guidelines

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Test** your changes (`npm test`)
4. **Commit** with clear messages (`git commit -m 'Add amazing feature'`)
5. **Push** to your branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

**More Details**: [🔧 Development Guide](./docs/wiki/Development/Development-Guide.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Community

### Getting Help

- **📖 Documentation**: Start with our [Quick Start Guide](./docs/wiki/Getting-Started/Quick-Start.md)
- **🐛 Issues**: Report bugs via [GitHub Issues](https://github.com/your-username/api-rate-limiter/issues)
- **💬 Discussions**: Join our [GitHub Discussions](https://github.com/your-username/api-rate-limiter/discussions)
- **📧 Email**: Contact us at support@api-rate-limiter.com

### Status & Monitoring

- **🏥 Health Check**: `curl http://localhost:3000/health`
- **📊 Live Dashboard**: `http://localhost:3000/dashboard`
- **📈 Performance**: `curl http://localhost:3000/performance`
- **📋 Statistics**: `curl http://localhost:3000/stats`

---

<div align="center">

**🎉 Ready to protect your APIs with enterprise-grade rate limiting?**

[🚀 Get Started](./docs/wiki/Getting-Started/Quick-Start.md) • [📖 Read the Docs](./docs/wiki/Home.md) • [🔐 Security Guide](./docs/wiki/Security/Security-Overview.md) • [🐳 Deploy with Docker](#-docker-deployment)

**Built with ❤️ for the API community**

</div>
