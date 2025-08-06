# 📦 Installation Guide

Complete installation instructions for the API Rate Limiter service across different environments and deployment scenarios.

## 🎯 Quick Installation

### Prerequisites

**System Requirements**:
- Node.js 16+ and npm 8+
- Git for cloning repository
- Redis (optional, service works without it)
- 2GB+ RAM, 2+ CPU cores recommended

**Platform Support**:
- Windows 10/11, macOS 10.15+, Linux (Ubuntu 18.04+)
- Docker Desktop (for containerized setup)
- Cloud platforms (AWS, Azure, GCP)

### Basic Installation

**1. Clone Repository**:
```bash
git clone https://github.com/your-username/api-rate-limiter.git
cd api-rate-limiter
```

**2. Install Dependencies**:
```bash
npm install
```

**3. Environment Setup**:
```bash
# Automated secure setup (recommended)
npm run setup

# Or manual configuration
cp .env.example .env
# Edit .env with your settings
```

**4. Start Service**:
```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

**5. Verify Installation**:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-06T10:30:00.000Z",
  "uptime": 10,
  "redis": {
    "connected": false,
    "fallback": "in-memory"
  }
}
```

## 🐳 Docker Installation

### Docker Compose (Recommended)

**1. Quick Start with Docker**:
```bash
# Clone and start with Docker Compose
git clone https://github.com/your-username/api-rate-limiter.git
cd api-rate-limiter
docker-compose up -d
```

**2. Verify Docker Installation**:
```bash
docker-compose ps
curl http://localhost:3000/health
```

### Docker Manual Setup

**1. Build Image**:
```bash
docker build -t api-rate-limiter .
```

**2. Run Container**:
```bash
docker run -d \
  --name api-rate-limiter \
  -p 3000:3000 \
  -e NODE_ENV=production \
  api-rate-limiter
```

**3. With Redis**:
```bash
# Start Redis container
docker run -d --name redis -p 6379:6379 redis:latest

# Start API Rate Limiter with Redis
docker run -d \
  --name api-rate-limiter \
  -p 3000:3000 \
  -e REDIS_ENABLED=true \
  -e REDIS_HOST=redis \
  --link redis:redis \
  api-rate-limiter
```

## ☁️ Cloud Platform Installation

### AWS Deployment

**1. EC2 Instance Setup**:
```bash
# Update system
sudo yum update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Git
sudo yum install -y git

# Clone and setup
git clone https://github.com/your-username/api-rate-limiter.git
cd api-rate-limiter
npm install
npm run setup
```

**2. ElastiCache Redis Setup**:
```bash
# Configure environment for ElastiCache
echo "REDIS_ENABLED=true" >> .env
echo "REDIS_HOST=your-elasticache-endpoint.cache.amazonaws.com" >> .env
echo "REDIS_PORT=6379" >> .env
```

**3. ECS Deployment**:
```json
{
  "family": "api-rate-limiter",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "api-rate-limiter",
      "image": "your-account.dkr.ecr.region.amazonaws.com/api-rate-limiter:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "REDIS_ENABLED",
          "value": "true"
        }
      ]
    }
  ]
}
```

### Azure Deployment

**1. Azure App Service**:
```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login and create resource group
az login
az group create --name api-rate-limiter-rg --location eastus

# Create App Service plan
az appservice plan create \
  --name api-rate-limiter-plan \
  --resource-group api-rate-limiter-rg \
  --sku B1 \
  --is-linux

# Create web app
az webapp create \
  --resource-group api-rate-limiter-rg \
  --plan api-rate-limiter-plan \
  --name your-api-rate-limiter \
  --runtime "NODE|18-lts"
```

**2. Azure Redis Cache**:
```bash
# Create Redis cache
az redis create \
  --resource-group api-rate-limiter-rg \
  --name your-redis-cache \
  --location eastus \
  --sku Basic \
  --vm-size c0

# Configure app settings
az webapp config appsettings set \
  --resource-group api-rate-limiter-rg \
  --name your-api-rate-limiter \
  --settings REDIS_ENABLED=true REDIS_HOST=your-redis-cache.redis.cache.windows.net
```

### Google Cloud Deployment

**1. Cloud Run Deployment**:
```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
source ~/.bashrc

# Initialize gcloud
gcloud init

# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT-ID/api-rate-limiter
gcloud run deploy --image gcr.io/PROJECT-ID/api-rate-limiter --platform managed
```

**2. Memorystore Redis**:
```bash
# Create Redis instance
gcloud redis instances create api-rate-limiter-redis \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_6_x

# Get Redis IP
gcloud redis instances describe api-rate-limiter-redis \
  --region=us-central1 \
  --format="get(host)"
```

## 🔧 Development Environment Setup

### Local Development

**1. Complete Development Setup**:
```bash
# Clone repository
git clone https://github.com/your-username/api-rate-limiter.git
cd api-rate-limiter

# Install dependencies
npm install

# Install development tools (optional)
npm install -g nodemon typescript

# Setup environment
npm run setup

# Start development server
npm run dev
```

**2. Redis Development Setup**:

**Windows (Chocolatey)**:
```powershell
# Install Chocolatey if not installed
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Redis
choco install redis-64

# Start Redis
redis-server

# Enable in environment
echo "REDIS_ENABLED=true" >> .env
```

**macOS (Homebrew)**:
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Redis
brew install redis

# Start Redis
brew services start redis

# Enable in environment
echo "REDIS_ENABLED=true" >> .env
```

**Linux (Ubuntu/Debian)**:
```bash
# Install Redis
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Enable in environment
echo "REDIS_ENABLED=true" >> .env
```

### IDE Configuration

**VS Code Setup**:
```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "bradlc.vscode-tailwindcss"
  ],
  "settings": {
    "typescript.preferences.importModuleSpecifier": "relative",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true
    }
  }
}
```

## 🧪 Testing Installation

### Verify Installation

**1. Run Test Suite**:
```bash
# Run all tests
npm test

# Expected output
✓ 73 tests passing
✓ All core functionality working
✓ Redis fallback operational
```

**2. Manual Testing**:
```bash
# Health check
curl http://localhost:3000/health

# Generate API key
curl -X POST http://localhost:3000/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key", "tier": "free", "userId": "test"}'

# Test rate limiting
curl http://localhost:3000/demo/strict
```

**3. Dashboard Testing**:
- Open `http://localhost:3000/dashboard`
- Verify all sections load correctly
- Test API key generation
- Check real-time statistics

### Performance Testing

**1. Load Testing**:
```bash
# Install testing tools
npm install -g autocannon

# Basic load test
autocannon -c 10 -d 30 http://localhost:3000/demo/moderate

# Rate limit test
autocannon -c 50 -d 10 http://localhost:3000/demo/strict
```

**2. Stress Testing**:
```bash
# High concurrency test
autocannon -c 100 -d 60 http://localhost:3000/health

# Monitor during test
curl http://localhost:3000/performance
```

## 🔒 Security Configuration

### Basic Security Setup

**1. Environment Security**:
```bash
# Set proper file permissions
chmod 600 .env

# Verify no secrets in git
git status --ignored | grep .env
```

**2. Network Security**:
```bash
# Configure IP whitelist
echo "IP_WHITELIST=127.0.0.1,::1,192.168.0.0/16" >> .env

# Enable trust proxy for load balancers
echo "ENABLE_TRUST_PROXY=true" >> .env
```

### SSL/HTTPS Setup

**1. Development SSL**:
```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Configure HTTPS
echo "HTTPS_ENABLED=true" >> .env
echo "SSL_CERT_PATH=./cert.pem" >> .env
echo "SSL_KEY_PATH=./key.pem" >> .env
```

**2. Production SSL**:
```bash
# Use Let's Encrypt
sudo certbot certonly --standalone -d your-domain.com

# Configure paths
echo "SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem" >> .env
echo "SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem" >> .env
```

## 🚨 Troubleshooting Installation

### Common Issues

**Node.js Version Issues**:
```bash
# Check version
node --version  # Should be 16+

# Install correct version with nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Permission Issues**:
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use npm prefix
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
```

**Redis Connection Issues**:
```bash
# Check Redis status
redis-cli ping  # Should return PONG

# Check Redis logs
tail -f /var/log/redis/redis-server.log

# Test connection
redis-cli monitor
```

**Port Conflicts**:
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Or use different port
echo "PORT=3001" >> .env
```

**Docker Issues**:
```bash
# Check Docker status
docker --version
docker-compose --version

# Check container logs
docker-compose logs api-rate-limiter

# Restart containers
docker-compose down && docker-compose up -d
```

### Getting Help

**Documentation**:
- [Quick Start Guide](./Quick-Start.md)
- [Configuration Reference](../Reference/Configuration-Reference.md)
- [Troubleshooting Guide](../Reference/Troubleshooting-Guide.md)

**Testing**:
```bash
# Run diagnostic script
npm run diagnose

# Check system requirements
npm run check-system

# Verify configuration
npm run validate-config
```

---

**Next**: [⚙️ Configuration Guide](../Getting-Started/Configuration.md) or [🚀 Quick Start](../Getting-Started/Quick-Start.md)
