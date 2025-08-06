# 🔐 Security Overview

The API Rate Limiter provides enterprise-grade security with multiple layers of protection, authentication, and monitoring.

## 🛡️ Security Features

### Multi-Layer Authentication
- **JWT Authentication**: Role-based access control with secure tokens
- **API Key Management**: Tiered access system with usage tracking
- **IP Filtering**: Whitelist/blacklist support for network-level protection
- **CORS Configuration**: Cross-origin request protection

### Cryptographic Security
- **Secure Secret Generation**: Cryptographically random JWT secrets
- **Key Hashing**: SHA-256 hashing for API key storage
- **Session Security**: Secure session management with rotation
- **Environment Protection**: Automatic secure environment setup

### Request Protection
- **Input Validation**: Comprehensive Zod schema validation
- **Rate Limiting**: Multiple algorithms to prevent abuse
- **Request Sanitization**: Protection against injection attacks
- **Error Handling**: Secure error responses without information leakage

## 🔑 Authentication Methods

### 1. JWT (JSON Web Tokens)

**Features**:
- Role-based access control (Admin, Premium, User, Guest)
- Permission-based authorization
- Configurable expiration (default: 24 hours)
- Automatic token validation

**Usage**:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Supported Roles**:
- **Admin**: Full system access, user management
- **Premium**: Enhanced features, higher rate limits
- **User**: Standard access, basic features
- **Guest**: Limited access, read-only

### 2. API Keys

**Features**:
- Tiered access system (Free, Premium, Enterprise)
- Usage tracking and quota enforcement
- Monthly limits and burst capacity
- Secure key generation and storage

**Usage**:
```http
X-API-Key: ak_live_1234567890abcdef...
```

**Tier Comparison**:

| Tier | Rate Limit | Burst | Monthly Quota | Features |
|------|------------|-------|---------------|----------|
| Free | 100/min | 10 | 10,000 | Basic rate limiting |
| Premium | 1,000/min | 150 | 100,000 | Burst capacity, priority support |
| Enterprise | 10,000/min | 1,500 | 1,000,000 | Custom limits, SLA, dedicated support |

## 🏗️ Security Architecture

### Authentication Flow

```mermaid
graph TD
    A[Client Request] --> B{Has JWT Token?}
    B -->|Yes| C[Validate JWT]
    B -->|No| D{Has API Key?}
    D -->|Yes| E[Validate API Key]
    D -->|No| F[Check Public Endpoint]
    C --> G{Valid?}
    E --> H{Valid & Within Quota?}
    F --> I{Rate Limited?}
    G -->|Yes| J[Check Permissions]
    G -->|No| K[401 Unauthorized]
    H -->|Yes| L[Apply API Key Rate Limits]
    H -->|No| M[403 Forbidden / 429 Too Many Requests]
    I -->|No| N[Process Request]
    I -->|Yes| O[429 Too Many Requests]
    J --> P{Has Permission?}
    P -->|Yes| Q[Process Request]
    P -->|No| R[403 Forbidden]
```

### Security Middleware Stack

1. **Helmet**: Security headers (CSP, HSTS, etc.)
2. **CORS**: Cross-origin request handling
3. **IP Filter**: Whitelist/blacklist enforcement
4. **JWT Auth**: Token validation and user context
5. **API Key Auth**: Key validation and quota checking
6. **Rate Limiter**: Request throttling and protection
7. **Input Validation**: Request schema validation

## 🔒 Secure Configuration

### Environment Variables

Critical security configurations:

```bash
# JWT Configuration
JWT_SECRET=<cryptographically-secure-secret>
JWT_EXPIRES_IN=24h
JWT_ALGORITHM=HS256

# API Key Security
API_KEY_SECRET=<secure-encryption-key>
API_KEY_HEADER=x-api-key

# Session Security
SESSION_SECRET=<secure-session-secret>
ENCRYPTION_KEY=<aes-encryption-key>

# Network Security
IP_WHITELIST=127.0.0.1,::1
IP_BLACKLIST=
ENABLE_TRUST_PROXY=true
```

### Automatic Setup

The service includes automated secure setup:

```bash
npm run setup
```

This generates:
- Cryptographically secure JWT secrets (256-bit)
- API key encryption keys
- Session secrets
- Production warnings for insecure configurations

## 🛡️ Rate Limiting Security

### Algorithm Selection

**Token Bucket**:
- Allows controlled bursts
- Good for APIs with variable load
- Prevents sustained abuse

**Sliding Window**:
- Precise request tracking
- Consistent enforcement
- Memory efficient with Redis

**Fixed Window**:
- Simple and fast
- Good for basic protection
- Minimal memory footprint

### Sensitive Endpoint Protection

Special rate limiting for security-critical endpoints:

```typescript
// Authentication endpoints: 5 requests/minute
POST /auth/login
POST /api-keys
DELETE /api-keys/*

// Management endpoints: 20 requests/minute  
GET /admin/*
GET /api-keys
PUT /api-keys/*

// Information endpoints: 100 requests/minute
GET /config
GET /stats
GET /performance
```

## 🔍 Security Monitoring

### Audit Logging

The service logs security-relevant events:

```json
{
  "timestamp": "2025-08-06T10:30:00.000Z",
  "level": "security",
  "event": "authentication_failure",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "details": {
    "reason": "invalid_jwt",
    "endpoint": "/admin/users"
  }
}
```

### Tracked Events

- Authentication attempts (success/failure)
- Rate limit violations
- API key generation/revocation
- Suspicious activity patterns
- IP-based access attempts

### Real-time Monitoring

Dashboard provides security insights:
- Failed authentication attempts
- Rate limiting statistics
- API key usage patterns
- Geographic access patterns
- Threat detection alerts

## 🚨 Security Best Practices

### Deployment Security

1. **Use HTTPS**: Always deploy with TLS encryption
2. **Secure Redis**: Use Redis AUTH and network isolation
3. **Environment Protection**: Never commit secrets to version control
4. **Regular Updates**: Keep dependencies updated
5. **Monitoring**: Implement security monitoring and alerting

### API Key Management

1. **Rotate Keys**: Regularly rotate API keys
2. **Minimal Permissions**: Use lowest required tier
3. **Monitor Usage**: Track API key usage patterns
4. **Secure Storage**: Store keys securely on client side
5. **Revoke Quickly**: Have processes for emergency key revocation

### JWT Best Practices

1. **Short Expiration**: Use reasonable token expiration times
2. **Secure Storage**: Store tokens securely (httpOnly cookies)
3. **Refresh Tokens**: Implement token refresh mechanism
4. **Logout Handling**: Implement secure logout
5. **Secret Rotation**: Regularly rotate JWT secrets

## 🔧 Security Configuration

### CORS Setup

```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));
```

### IP Filtering

```typescript
// Whitelist specific IPs
IP_WHITELIST=192.168.1.0/24,10.0.0.0/8

// Blacklist specific IPs  
IP_BLACKLIST=192.168.1.100,suspicious.example.com
```

### Security Headers

Automatic security headers via Helmet:

```http
Content-Security-Policy: default-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

## 🚩 Security Incidents

### Incident Response

1. **Detection**: Monitor logs and alerts
2. **Assessment**: Evaluate threat scope
3. **Containment**: Block suspicious IPs/revoke keys
4. **Investigation**: Analyze attack patterns
5. **Recovery**: Restore normal operations
6. **Documentation**: Document lessons learned

### Emergency Procedures

**Compromised API Key**:
```bash
# Revoke immediately
curl -X DELETE http://localhost:3000/api-keys/compromised_key_id
```

**Suspicious Activity**:
```bash
# Add IP to blacklist
IP_BLACKLIST=suspicious.ip.address,existing.blacklist.ips
```

**JWT Secret Compromise**:
1. Generate new JWT secret
2. Update environment configuration
3. Restart service (invalidates all tokens)
4. Notify users to re-authenticate

## 🔍 Vulnerability Assessment

### Regular Security Checks

1. **Dependency Scanning**: Check for vulnerable packages
2. **Static Analysis**: Code security analysis
3. **Penetration Testing**: Regular security testing
4. **Configuration Review**: Security configuration audit

### Security Tools Integration

```bash
# Dependency vulnerability check
npm audit

# Security linting
npm run lint:security

# Container security scan  
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v $PWD:/src aquasec/trivy image api-rate-limiter
```

---

**Next**: [🔑 JWT Authentication](./JWT-Authentication.md) or [🔐 API Key Management](./API-Key-Management.md)
