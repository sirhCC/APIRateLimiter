# 📖 API Reference

Complete reference for all API Rate Limiter endpoints, with examples and response formats.

## 🏥 Health & Status Endpoints

### GET /health
Check service health and Redis connectivity.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-06T10:30:00.000Z",
  "uptime": 3600,
  "redis": {
    "connected": true,
    "latency": "1ms"
  }
}
```

### GET /stats
Real-time usage statistics and rate limiting metrics.

**Response**:
```json
{
  "totalRequests": 15420,
  "rateLimitedRequests": 45,
  "requestsPerSecond": 12.5,
  "averageResponseTime": 25,
  "endpoints": {
    "/api/users": {
      "requests": 8934,
      "rateLimited": 12
    }
  }
}
```

### GET /performance
Detailed performance metrics including percentiles.

**Response**:
```json
{
  "metrics": {
    "responseTime": {
      "p50": 15,
      "p95": 45,
      "p99": 120
    },
    "memory": {
      "used": "45.2MB",
      "percentage": 67.8
    },
    "cpu": {
      "usage": 12.5,
      "trend": "stable"
    }
  }
}
```

## 🔑 API Key Management

### POST /api-keys
Generate a new API key with specified tier and metadata.

**Request**:
```json
{
  "name": "Production API Key",
  "tier": "premium",
  "userId": "user_12345",
  "organizationId": "org_567",
  "metadata": {
    "description": "Key for production workloads",
    "environment": "production"
  }
}
```

**Response**:
```json
{
  "id": "key_abc123def456",
  "key": "ak_live_1234567890abcdef...",
  "name": "Production API Key",
  "tier": "premium",
  "userId": "user_12345",
  "organizationId": "org_567",
  "created": "2025-08-06T10:30:00.000Z",
  "rateLimit": {
    "requestsPerMinute": 1000,
    "burstCapacity": 150,
    "monthlyQuota": 100000
  }
}
```

### GET /api-keys
List API keys for a user or organization.

**Query Parameters**:
- `userId` (string): Filter by user ID
- `organizationId` (string): Filter by organization
- `status` (string): Filter by status (active, revoked)

**Response**:
```json
{
  "keys": [
    {
      "id": "key_abc123",
      "name": "Production API Key",
      "tier": "premium",
      "status": "active",
      "created": "2025-08-06T10:30:00.000Z",
      "lastUsed": "2025-08-06T12:15:00.000Z"
    }
  ],
  "pagination": {
    "total": 15,
    "page": 1,
    "limit": 10
  }
}
```

### GET /api-keys/:keyId
Get detailed information about a specific API key.

**Response**:
```json
{
  "id": "key_abc123",
  "name": "Production API Key",
  "tier": "premium",
  "status": "active",
  "usage": {
    "requestsThisMinute": 45,
    "requestsThisMonth": 12450,
    "quotaRemaining": 87550
  },
  "metadata": {
    "description": "Key for production workloads"
  }
}
```

### DELETE /api-keys/:keyId
Revoke an API key permanently.

**Response**:
```json
{
  "success": true,
  "message": "API key revoked successfully",
  "revokedAt": "2025-08-06T12:30:00.000Z"
}
```

### GET /api-keys/:keyId/usage
Get detailed usage statistics for an API key.

**Response**:
```json
{
  "usage": {
    "current": {
      "requestsPerMinute": 45,
      "requestsToday": 2340,
      "requestsThisMonth": 12450
    },
    "limits": {
      "requestsPerMinute": 1000,
      "monthlyQuota": 100000
    },
    "history": [
      {
        "date": "2025-08-06",
        "requests": 2340
      }
    ]
  }
}
```

### GET /api-keys/tiers
Get available API key tiers and their limits.

**Response**:
```json
{
  "tiers": [
    {
      "name": "free",
      "requestsPerMinute": 100,
      "burstCapacity": 10,
      "monthlyQuota": 10000,
      "features": ["basic rate limiting"]
    },
    {
      "name": "premium",
      "requestsPerMinute": 1000,
      "burstCapacity": 150,
      "monthlyQuota": 100000,
      "features": ["burst capacity", "priority support"]
    },
    {
      "name": "enterprise",
      "requestsPerMinute": 10000,
      "burstCapacity": 1500,
      "monthlyQuota": 1000000,
      "features": ["custom limits", "dedicated support", "SLA"]
    }
  ]
}
```

## 🔐 JWT Authentication

### POST /auth/login
Authenticate with email/password and receive JWT token.

**Request**:
```json
{
  "email": "admin@example.com",
  "password": "demo123"
}
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "admin@example.com",
    "role": "admin",
    "tier": "enterprise"
  },
  "expiresIn": "24h"
}
```

### GET /auth/verify
Verify JWT token validity.

**Headers**: `Authorization: Bearer <jwt-token>`

**Response**:
```json
{
  "valid": true,
  "user": {
    "id": "user_123",
    "email": "admin@example.com",
    "role": "admin",
    "permissions": ["read", "write", "admin"]
  },
  "expiresAt": "2025-08-07T10:30:00.000Z"
}
```

## 👤 Protected Endpoints

### GET /admin/users
List all users (admin only).

**Headers**: `Authorization: Bearer <admin-jwt-token>`

**Response**:
```json
{
  "users": [
    {
      "id": "user_123",
      "email": "admin@example.com",
      "role": "admin",
      "created": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /premium/features
Access premium features.

**Headers**: `Authorization: Bearer <premium-jwt-token>`

**Response**:
```json
{
  "features": [
    "Advanced analytics",
    "Custom rate limits",
    "Priority support"
  ]
}
```

### GET /secure/data
Access secure data with permission checking.

**Headers**: `Authorization: Bearer <jwt-token>`

**Response**:
```json
{
  "data": "Sensitive information",
  "accessLevel": "user"
}
```

## 🧪 Demo & Testing Endpoints

### GET /demo/strict
Heavily rate limited endpoint (5 requests/minute).

**Rate Limit**: 5 requests per minute

**Response**:
```json
{
  "message": "This is a strictly rate-limited endpoint",
  "rateLimit": {
    "remaining": 4,
    "resetTime": "2025-08-06T10:31:00.000Z"
  }
}
```

### GET /demo/moderate
Moderately rate limited endpoint (30 requests/minute).

**Rate Limit**: 30 requests per minute

**Response**:
```json
{
  "message": "This endpoint has moderate rate limiting",
  "timestamp": "2025-08-06T10:30:00.000Z"
}
```

### GET /demo/heavy
Endpoint for high-volume testing (1000 requests/minute).

**Rate Limit**: 1000 requests per minute

**Response**:
```json
{
  "message": "High-volume endpoint for load testing",
  "requestId": "req_abc123"
}
```

### GET /demo/interactive
Interactive endpoint with real-time rate limit info.

**Response**:
```json
{
  "message": "Interactive demo endpoint",
  "rateLimit": {
    "algorithm": "sliding-window",
    "window": "60s",
    "remaining": 95,
    "total": 100
  }
}
```

## ⚙️ Configuration

### GET /config
Get current service configuration.

**Response**:
```json
{
  "rateLimiting": {
    "defaultAlgorithm": "sliding-window",
    "defaultWindowMs": 60000,
    "defaultMaxRequests": 100
  },
  "security": {
    "jwtEnabled": true,
    "apiKeyEnabled": true,
    "ipFiltering": true
  },
  "redis": {
    "enabled": false,
    "fallbackMode": "in-memory"
  }
}
```

## 📊 Rate Limit Headers

All responses include rate limiting headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1625097600
X-RateLimit-Policy: sliding-window
```

## ❌ Error Responses

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded the rate limit of 100 requests per minute",
  "retryAfter": 45,
  "resetTime": "2025-08-06T10:31:00.000Z"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions for this endpoint"
}
```

### 400 Bad Request
```json
{
  "error": "Validation error",
  "message": "Invalid request format",
  "details": [
    {
      "field": "tier",
      "message": "Must be one of: free, premium, enterprise"
    }
  ]
}
```

## 🔧 API Key Authentication

Include API key in requests using the `X-API-Key` header:

```http
GET /api/protected-endpoint
X-API-Key: ak_live_1234567890abcdef...
```

API key authentication provides:
- Automatic tier detection
- Usage quota enforcement  
- Monthly limit tracking
- Request rate limiting based on tier

## 🌐 CORS Support

The API supports Cross-Origin Resource Sharing (CORS) with configurable origins:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Key
```

---

**Next**: [🔐 Authentication Guide](../Security/JWT-Authentication.md) or [📊 Dashboard Guide](../Monitoring/Dashboard-Guide.md)
