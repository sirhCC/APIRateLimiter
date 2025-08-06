# 🚀 Quick Start Guide

Get your API Rate Limiter up and running in under 5 minutes!

## ⚡ Prerequisites

- **Node.js** 16+ and **npm** 8+
- **Git** for cloning the repository
- **Redis** (optional - service works without it)

## 🎯 Step 1: Clone & Install

```bash
# Clone the repository
git clone <your-repository-url>
cd APIRateLimiter-2

# Install dependencies
npm install
```

## 🔧 Step 2: Environment Setup

The service includes automatic secure environment setup:

```bash
# Run the automated setup (generates secure secrets)
npm run setup
```

This creates a `.env` file with:
- ✅ Cryptographically secure JWT secrets
- ✅ API key encryption keys
- ✅ Session secrets
- ✅ Production-ready configuration

## 🚀 Step 3: Start the Service

```bash
# Start development server with hot reload
npm run dev

# Or for production
npm run build && npm start
```

The service starts at: **http://localhost:3000**

## 🎨 Step 4: Access the Dashboard

Open your browser to: **http://localhost:3000/dashboard**

The interactive dashboard provides:
- 📊 Real-time statistics and monitoring
- 🔑 API key generation and management
- 🧪 Testing endpoints and rate limit validation
- 📈 Performance metrics visualization

## 🧪 Step 5: Test the API

### Health Check
```bash
curl http://localhost:3000/health
```

### Generate an API Key
```bash
curl -X POST http://localhost:3000/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key", "tier": "free", "userId": "test-user"}'
```

### Test Rate Limiting
```bash
# Test the demo endpoint (rate limited to 5 requests/minute)
curl http://localhost:3000/demo/strict
```

## 🔐 Step 6: Authentication Testing

### JWT Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "demo123"}'
```

### Use the JWT Token
```bash
curl http://localhost:3000/admin/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📊 Step 7: Monitor Performance

Visit these endpoints to see your service in action:

- **Statistics**: http://localhost:3000/stats
- **Performance**: http://localhost:3000/performance  
- **Configuration**: http://localhost:3000/config

## 🎯 What's Working?

✅ **Rate Limiting**: Three algorithms (Token Bucket, Sliding Window, Fixed Window)  
✅ **Authentication**: JWT tokens + API key management  
✅ **Security**: Cryptographic secrets, input validation, IP filtering  
✅ **Monitoring**: Real-time dashboard, statistics, health checks  
✅ **Resilience**: Redis failover, graceful degradation  

## 🔄 Redis Setup (Optional)

For production deployment with Redis:

```bash
# Install Redis (Windows with Chocolatey)
choco install redis-64

# Or with Docker
docker run -d -p 6379:6379 redis:latest

# Update .env to enable Redis
REDIS_ENABLED=true
```

## 🐳 Docker Quick Start

```bash
# Start with Docker Compose (includes Redis)
docker-compose up -d

# Service available at http://localhost:3000
```

## 🧪 Test Everything Works

Run the comprehensive test suite:

```bash
npm test
```

**Expected**: 73/73 tests passing ✅

## 🎯 Next Steps

Now that you're up and running:

1. **[📖 Read API Documentation](../API/API-Reference.md)** - Learn all available endpoints
2. **[🔐 Security Setup](../Security/Security-Overview.md)** - Configure security features  
3. **[🛠️ Production Deployment](../Deployment/Production-Setup.md)** - Deploy to production
4. **[📊 Dashboard Guide](../Monitoring/Dashboard-Guide.md)** - Master the dashboard

## 🆘 Troubleshooting

### Service Won't Start
- Check Node.js version: `node --version` (need 16+)
- Verify installation: `npm install`
- Check ports: Ensure port 3000 is available

### Dashboard Not Loading  
- Verify service is running: http://localhost:3000/health
- Check browser console for errors
- Try incognito/private browsing mode

### Tests Failing
- Redis connection issues are expected if Redis not installed
- Core functionality tests should pass without Redis
- See [Testing Guide](../Testing/Testing-Guide.md)

## 💡 Pro Tips

- **Use the dashboard** for interactive testing and monitoring
- **Check /health** endpoint to verify Redis connectivity  
- **Monitor /stats** for real-time usage statistics
- **Try different demo endpoints** to see rate limiting in action

---

**🎉 Congratulations!** Your API Rate Limiter is now running and protecting your APIs with enterprise-grade security and performance.

**Next**: [📖 API Documentation](../API/API-Reference.md) or [🔐 Security Setup](../Security/Security-Overview.md)
