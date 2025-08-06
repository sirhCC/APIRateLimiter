# 🚀 Production Setup Guide

Complete guide for deploying the API Rate Limiter in production environments with security, performance, and reliability considerations.

## 🎯 Pre-Production Checklist

### System Requirements

**Minimum Requirements**:
- **CPU**: 2 cores, 2.4GHz
- **Memory**: 4GB RAM
- **Storage**: 20GB SSD
- **Network**: 1Gbps connection
- **OS**: Linux (Ubuntu 20.04+, CentOS 8+, RHEL 8+)

**Recommended Requirements**:
- **CPU**: 4+ cores, 3.0GHz
- **Memory**: 8GB+ RAM
- **Storage**: 50GB+ SSD with backup
- **Network**: 10Gbps connection
- **OS**: Linux with security hardening

### Dependencies

**Required Software**:
- Node.js 16+ (LTS recommended)
- npm 8+ or yarn 1.22+
- Redis 6.0+ (for production performance)
- Docker 20.10+ (for containerized deployment)
- Git 2.25+

**Optional but Recommended**:
- NGINX (reverse proxy and load balancing)
- PM2 (process management)
- Prometheus + Grafana (monitoring)
- ELK Stack (logging)

## 🔧 Environment Configuration

### Secure Environment Setup

**1. Generate Production Secrets**:
```bash
# Run the automated secure setup
npm run setup

# Verify secrets were generated
cat .env | grep -E "(SECRET|KEY)"
```

**2. Production Environment Variables**:
```bash
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Redis Configuration (Required for Production)
REDIS_ENABLED=true
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-redis-password
REDIS_DB=0

# Security Configuration
JWT_SECRET=your-cryptographically-secure-secret-here
JWT_EXPIRES_IN=24h
API_KEY_SECRET=your-api-key-encryption-secret
SESSION_SECRET=your-session-secret
ENCRYPTION_KEY=your-aes-encryption-key

# Rate Limiting
DEFAULT_WINDOW_MS=60000
DEFAULT_MAX_REQUESTS=100
DEFAULT_ALGORITHM=sliding-window

# Security & Access Control
IP_WHITELIST=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
IP_BLACKLIST=
ENABLE_TRUST_PROXY=true

# Monitoring
MONITORING_ENABLED=true
STATS_RETENTION_MS=3600000
```

**3. Environment Security**:
```bash
# Set proper file permissions
chmod 600 .env
chown app:app .env

# Verify no secrets in version control
git status --ignored | grep .env
```

### SSL/TLS Configuration

**1. Obtain SSL Certificate**:
```bash
# Using Let's Encrypt
sudo certbot certonly --nginx -d api-rate-limiter.yourdomain.com

# Using custom certificate
sudo mkdir -p /etc/ssl/private
sudo cp your-certificate.crt /etc/ssl/certs/
sudo cp your-private-key.key /etc/ssl/private/
sudo chmod 600 /etc/ssl/private/your-private-key.key
```

**2. NGINX SSL Configuration**:
```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api-rate-limiter.yourdomain.com;

    ssl_certificate /etc/ssl/certs/your-certificate.crt;
    ssl_certificate_key /etc/ssl/private/your-private-key.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🐳 Docker Production Deployment

### Docker Configuration

**1. Production Dockerfile**:
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy application
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Build TypeScript
RUN npm run build

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["npm", "start"]
```

**2. Production Docker Compose**:
```yaml
version: '3.8'

services:
  api-rate-limiter:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - REDIS_ENABLED=true
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass yourredispassword
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/ssl/certs:/etc/ssl/certs
      - /etc/ssl/private:/etc/ssl/private
    depends_on:
      - api-rate-limiter
    restart: unless-stopped
    networks:
      - app-network

volumes:
  redis-data:

networks:
  app-network:
    driver: bridge
```

### Deployment Commands

```bash
# Build and deploy
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs api-rate-limiter

# Health check
curl -f https://your-domain.com/health
```

## ⚖️ Load Balancing & High Availability

### NGINX Load Balancer Configuration

```nginx
upstream api_rate_limiter {
    least_conn;
    server api-limiter-1:3000 max_fails=3 fail_timeout=30s;
    server api-limiter-2:3000 max_fails=3 fail_timeout=30s;
    server api-limiter-3:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    location /health {
        proxy_pass http://api_rate_limiter;
        proxy_set_header Host $host;
    }
    
    location / {
        proxy_pass http://api_rate_limiter;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Rate limiting at load balancer level
        limit_req zone=api burst=20 nodelay;
    }
}

# Rate limiting zone
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}
```

### Redis Cluster Configuration

**Redis Cluster Setup**:
```bash
# Redis cluster configuration
port 7000
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
requirepass yourredispassword
```

**Application Redis Cluster Config**:
```bash
REDIS_CLUSTER_ENABLED=true
REDIS_CLUSTER_NODES=redis-1:7000,redis-2:7000,redis-3:7000
REDIS_PASSWORD=yourredispassword
```

## 📊 Monitoring & Logging

### Production Monitoring

**1. Prometheus Configuration**:
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'api-rate-limiter'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

**2. Application Metrics Endpoint**:
```javascript
// Add to your application
app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});
```

**3. Grafana Dashboard**:
```json
{
  "dashboard": {
    "title": "API Rate Limiter Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[1m])"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph", 
        "targets": [
          {
            "expr": "histogram_quantile(0.95, http_request_duration_seconds_bucket)"
          }
        ]
      }
    ]
  }
}
```

### Centralized Logging

**1. ELK Stack Configuration**:
```yaml
# docker-compose.logging.yml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:7.15.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data

  kibana:
    image: docker.elastic.co/kibana/kibana:7.15.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200

  logstash:
    image: docker.elastic.co/logstash/logstash:7.15.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

volumes:
  elasticsearch-data:
```

**2. Application Logging Configuration**:
```javascript
// Production logger configuration
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

## 🔒 Security Hardening

### System Security

**1. Firewall Configuration**:
```bash
# UFW firewall setup
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from 10.0.0.0/8 to any port 6379  # Redis access
```

**2. Fail2Ban Configuration**:
```ini
# /etc/fail2ban/jail.local
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-rate-limit]
enabled = true
filter = nginx-rate-limit
logpath = /var/log/nginx/access.log
maxretry = 10
bantime = 600
```

**3. System Hardening**:
```bash
# Disable unnecessary services
sudo systemctl disable cups
sudo systemctl disable bluetooth

# Update system packages
sudo apt update && sudo apt upgrade -y

# Configure automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Application Security

**1. Secrets Management**:
```bash
# Use Docker secrets for sensitive data
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "your-redis-password" | docker secret create redis_password -
```

**2. Container Security**:
```dockerfile
# Security-hardened container
FROM node:18-alpine

# Install security updates
RUN apk update && apk upgrade

# Remove unnecessary packages
RUN apk del --purge

# Use non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set proper permissions
COPY --chown=nodejs:nodejs . .
USER nodejs
```

## 📈 Performance Optimization

### Application Performance

**1. PM2 Process Management**:
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'api-rate-limiter',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    max_memory_restart: '1G'
  }]
};
```

**2. Database Optimization**:
```bash
# Redis optimization
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

### System Performance

**1. Kernel Parameters**:
```bash
# /etc/sysctl.conf optimizations
net.core.somaxconn = 1024
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 1024
net.ipv4.ip_local_port_range = 1024 65535
```

**2. File Descriptor Limits**:
```bash
# /etc/security/limits.conf
nodejs soft nofile 65535
nodejs hard nofile 65535
```

## 🚨 Backup & Recovery

### Automated Backup Strategy

**1. Redis Backup**:
```bash
#!/bin/bash
# redis-backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/redis"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup Redis data
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis_backup_$DATE.rdb

# Compress and encrypt
tar -czf $BACKUP_DIR/redis_backup_$DATE.tar.gz $BACKUP_DIR/redis_backup_$DATE.rdb
gpg --symmetric --cipher-algo AES256 $BACKUP_DIR/redis_backup_$DATE.tar.gz

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.rdb" -mtime +30 -delete
```

**2. Application Backup**:
```bash
#!/bin/bash
# app-backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/app"

# Backup application configuration
tar -czf $BACKUP_DIR/config_backup_$DATE.tar.gz \
  /app/.env \
  /app/config/ \
  /app/logs/

# Backup certificates
tar -czf $BACKUP_DIR/ssl_backup_$DATE.tar.gz \
  /etc/ssl/private/ \
  /etc/ssl/certs/
```

### Disaster Recovery

**1. Recovery Procedures**:
```bash
# Restore Redis data
redis-cli FLUSHALL
redis-cli DEBUG RESTART
cp /backup/redis/redis_backup_latest.rdb /var/lib/redis/dump.rdb
sudo systemctl restart redis

# Restore application
docker-compose down
tar -xzf /backup/app/config_backup_latest.tar.gz
docker-compose up -d
```

**2. Health Validation**:
```bash
# Verify service health after recovery
curl -f http://localhost:3000/health
curl -f http://localhost:3000/stats
```

## 📋 Production Checklist

### Pre-Deployment

- [ ] Environment variables configured and secured
- [ ] SSL certificates installed and validated
- [ ] Redis cluster configured and tested
- [ ] Load balancer configured and tested
- [ ] Monitoring and alerting configured
- [ ] Backup strategy implemented and tested
- [ ] Security hardening completed
- [ ] Performance optimization applied
- [ ] Documentation updated

### Post-Deployment

- [ ] Health checks passing
- [ ] All endpoints responding correctly
- [ ] Rate limiting functioning as expected
- [ ] Authentication working properly
- [ ] Monitoring data flowing correctly
- [ ] Logs being collected properly
- [ ] Backup systems operational
- [ ] Performance within acceptable limits
- [ ] Security scans completed

### Ongoing Maintenance

- [ ] Regular security updates
- [ ] Performance monitoring and optimization
- [ ] Backup verification and testing
- [ ] Log rotation and cleanup
- [ ] Certificate renewal
- [ ] Dependency updates
- [ ] Capacity planning and scaling

---

**Next**: [📊 Monitoring Setup](../Monitoring/Health-Checks.md) or [🔒 Security Hardening](../Security/Best-Practices.md)
