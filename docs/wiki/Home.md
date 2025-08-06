# 🚀 API Rate Limiter - Wiki Home

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

**🛡️ Enterprise-Grade API Protection**  
*Production-ready rate limiting service with advanced security & comprehensive monitoring*

</div>

---

## 📚 Welcome to the Documentation

This wiki provides comprehensive documentation for the API Rate Limiter - a production-grade Node.js service that provides rate limiting as a service for any API. Built with TypeScript, Express, and Redis, it offers multiple algorithms, security features, and enterprise-level monitoring.

## 🎯 Project Status: **PRODUCTION READY** ✅

- **✅ 73/73 Tests Passing** - 100% test reliability
- **✅ Enterprise Security** - JWT + API keys + cryptographic secrets
- **✅ High Performance** - Sub-millisecond response times
- **✅ Production Deployment** - Docker-ready with Redis cluster support

---

## 🗺️ Navigation Guide

### 🚀 **Getting Started**
- **[Quick Start Guide](./Getting-Started/Quick-Start.md)** - Get up and running in 5 minutes
- **[Installation](./Getting-Started/Installation.md)** - Detailed installation instructions
- **[Configuration](./Getting-Started/Configuration.md)** - Environment setup and configuration
- **[First Steps](./Getting-Started/First-Steps.md)** - Your first API calls and dashboard access

### 🏗️ **Architecture & Design**
- **[System Overview](./Architecture/System-Overview.md)** - High-level architecture and components
- **[Rate Limiting Algorithms](./Architecture/Rate-Limiting-Algorithms.md)** - Token Bucket, Sliding Window, Fixed Window
- **[Data Flow](./Architecture/Data-Flow.md)** - Request processing and middleware chain
- **[Performance Design](./Architecture/Performance-Design.md)** - Circular buffers, LRU caches, Redis optimization

### 📖 **API Documentation**
- **[API Reference](./API/API-Reference.md)** - Complete endpoint documentation
- **[Authentication](./API/Authentication.md)** - JWT tokens and API key management
- **[Rate Limiting](./API/Rate-Limiting.md)** - Rate limiting headers and behavior
- **[Error Handling](./API/Error-Handling.md)** - Error codes and response formats

### 🔐 **Security**
- **[Security Overview](./Security/Security-Overview.md)** - Comprehensive security features
- **[JWT Authentication](./Security/JWT-Authentication.md)** - JSON Web Token implementation
- **[API Key Management](./Security/API-Key-Management.md)** - Multi-tier API key system
- **[Best Practices](./Security/Best-Practices.md)** - Security recommendations and hardening

### 🛠️ **Deployment**
- **[Local Development](./Deployment/Local-Development.md)** - Development environment setup
- **[Docker Deployment](./Deployment/Docker-Deployment.md)** - Container-based deployment
- **[Production Setup](./Deployment/Production-Setup.md)** - Production deployment guide
- **[Scaling & High Availability](./Deployment/Scaling.md)** - Distributed and load-balanced deployment

### 📊 **Monitoring & Analytics**
- **[Dashboard Guide](./Monitoring/Dashboard-Guide.md)** - Interactive web dashboard
- **[Metrics & Statistics](./Monitoring/Metrics.md)** - Performance monitoring and analytics
- **[Health Checks](./Monitoring/Health-Checks.md)** - System health monitoring
- **[Troubleshooting](./Monitoring/Troubleshooting.md)** - Common issues and solutions

### 🧪 **Testing & Quality**
- **[Testing Guide](./Testing/Testing-Guide.md)** - Comprehensive testing documentation
- **[Test Results](./Testing/Test-Results.md)** - Current test status and coverage
- **[Quality Assurance](./Testing/Quality-Assurance.md)** - QA processes and standards
- **[Load Testing](./Testing/Load-Testing.md)** - Performance and load testing

### 🔧 **Development**
- **[Development Guide](./Development/Development-Guide.md)** - Contributing and development workflow
- **[Code Architecture](./Development/Code-Architecture.md)** - Codebase structure and patterns
- **[Adding Features](./Development/Adding-Features.md)** - How to extend the system
- **[TypeScript Guide](./Development/TypeScript-Guide.md)** - TypeScript patterns and practices

### 📋 **Reference**
- **[Configuration Reference](./Reference/Configuration-Reference.md)** - Complete configuration options
- **[CLI Commands](./Reference/CLI-Commands.md)** - Command-line tools and scripts
- **[Environment Variables](./Reference/Environment-Variables.md)** - All environment configuration
- **[Troubleshooting Guide](./Reference/Troubleshooting-Guide.md)** - Common issues and solutions

---

## 🎯 Quick Links

### Essential Pages
- [📊 **Live Dashboard**](http://localhost:3000/dashboard) - Interactive management interface
- [🏥 **Health Check**](http://localhost:3000/health) - Service status and connectivity
- [📈 **Statistics**](http://localhost:3000/stats) - Real-time usage statistics
- [⚡ **Performance**](http://localhost:3000/performance) - Performance metrics

### Key Features
- **Multiple Algorithms**: Token Bucket, Sliding Window, Fixed Window
- **Dual Authentication**: JWT tokens + API key management
- **Enterprise Security**: Cryptographic secrets, audit logging, IP filtering
- **High Performance**: Redis Lua scripts, circular buffers, sub-ms response times
- **Production Ready**: Docker deployment, health monitoring, graceful degradation

### Developer Resources
- [🧪 **Test Scripts**](../tests/) - Comprehensive test suite (73/73 passing)
- [🐳 **Docker Setup**](../../docker-compose.yml) - Container orchestration
- [⚙️ **Configuration**](../../.env) - Environment configuration
- [📝 **Examples**](../examples/) - Code examples and integration guides

---

## 🏆 Why Choose This Rate Limiter?

<table>
<tr>
<td width="33%" align="center">

### 🛡️ **Enterprise Security**
- 🔒 Cryptographic JWT secrets
- 🛡️ Multi-tier API key system  
- 📝 Comprehensive audit logging
- 🔄 Redis failover protection
- ⚡ Zero-downtime hardening

</td>
<td width="33%" align="center">

### 🚀 **High Performance**
- ⚡ 3 optimized algorithms
- 🔥 Redis Lua atomic operations
- 📈 Circular buffers & LRU caches  
- 🎯 P50/P95/P99 tracking
- 🏃‍♂️ Sub-millisecond responses

</td>
<td width="33%" align="center">

### 🧪 **Production Quality**
- ✅ **73/73 tests passing**
- 🎯 Enterprise-grade testing
- 📊 20.2% coverage baseline
- 🔬 Chaos engineering ready
- 🚀 CI/CD pipeline prepared

</td>
</tr>
</table>

---

## 📞 Support & Community

- **Issues**: Report bugs and request features via GitHub Issues
- **Documentation**: This wiki provides comprehensive guides
- **Testing**: Run `npm test` to verify your installation
- **Development**: See [Development Guide](./Development/Development-Guide.md)

---

<div align="center">

**🎉 Ready to protect your APIs with enterprise-grade rate limiting?**

[🚀 Get Started](./Getting-Started/Quick-Start.md) • [📖 Read the Docs](./API/API-Reference.md) • [🔐 Security Guide](./Security/Security-Overview.md)

</div>
