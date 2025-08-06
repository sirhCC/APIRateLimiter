# 📊 Dashboard Guide

Complete guide to the API Rate Limiter's interactive web dashboard for monitoring, management, and testing.

## 🎯 Dashboard Overview

The web dashboard is your central control panel for monitoring and managing the API Rate Limiter service. Access it at:

**URL**: `http://localhost:3000/dashboard`

The dashboard provides real-time insights into:
- System health and performance metrics
- Rate limiting statistics and activity
- API key management and usage tracking
- Interactive testing and configuration

## 🚀 Getting Started

### Accessing the Dashboard

1. **Start the Service**:
   ```bash
   npm run dev
   ```

2. **Open Dashboard**:
   Navigate to `http://localhost:3000/dashboard` in your browser

3. **Verify Connectivity**:
   - Green indicators show healthy systems
   - Red indicators highlight issues requiring attention

### Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│                    Header                           │
│  🛡️ API Rate Limiter Dashboard                      │
├─────────────────────────────────────────────────────┤
│  📊 System Status      │  🔑 API Key Management     │
│                        │                            │
├─────────────────────────────────────────────────────┤
│  📈 Performance        │  🧪 Testing Tools          │
│  Metrics               │                            │
├─────────────────────────────────────────────────────┤
│  📋 Configuration      │  🔍 Monitoring Tools       │
│  Information           │                            │
└─────────────────────────────────────────────────────┘
```

## 📊 System Status Section

### Health Indicators

**Service Status**:
- 🟢 **Healthy**: All systems operational
- 🟡 **Warning**: Minor issues detected
- 🔴 **Critical**: Service degradation

**Redis Connection**:
- 🟢 **Connected**: Redis available, optimal performance
- 🟡 **Fallback**: Using in-memory storage
- 🔴 **Disconnected**: Connection issues

**Performance Status**:
- 🟢 **Optimal**: Response times under 50ms
- 🟡 **Degraded**: Response times 50-200ms
- 🔴 **Critical**: Response times over 200ms

### Real-time Metrics

**Request Statistics**:
```
Total Requests: 15,420
Requests/Second: 12.5
Rate Limited: 45 (0.3%)
Average Response Time: 25ms
```

**Memory Usage**:
```
Used: 45.2MB / 512MB (8.8%)
Trend: ↗️ Increasing
Peak: 67.1MB
```

**Rate Limiting Activity**:
```
Active Limits: 23
Violations (1h): 12
Most Limited: /api/users (5 violations)
```

## 🔑 API Key Management

### Generate New API Key

1. **Fill Key Details**:
   ```
   Name: [Production API Key]
   Tier: [Premium ▼]
   User ID: [user_12345]
   Organization: [acme-corp]
   Description: [Key for production workloads]
   ```

2. **Click "Generate Key"**:
   - System creates cryptographically secure key
   - Displays key details and configuration
   - Shows rate limits and quotas for selected tier

3. **Save Key Securely**:
   ```
   Key: ak_live_1234567890abcdef...
   Rate Limit: 1000 requests/minute
   Monthly Quota: 100,000 requests
   Burst Capacity: 150 requests
   ```

### Key Management Features

**List All Keys**:
- View all generated API keys
- Filter by user, organization, or status
- Sort by creation date, usage, or tier

**Key Details**:
- Real-time usage statistics
- Monthly quota consumption
- Rate limiting status
- Metadata and configuration

**Key Operations**:
- 🔍 **View Details**: See full key information
- 📊 **Usage Stats**: Detailed usage analytics
- 🗑️ **Revoke Key**: Permanently disable key
- ⚙️ **Edit Metadata**: Update description and tags

### Usage Tracking

**Current Usage**:
```
Requests This Minute: 45/1000
Requests Today: 2,340
Requests This Month: 12,450/100,000
Quota Remaining: 87,550 (87.6%)
```

**Usage History Chart**:
```
📈 Daily Request Volume (Last 30 Days)
   ▄▄▄ ▄▄▄▄ ▄▄▄▄▄ ▄▄▄ ▄▄▄▄▄
Day: 1   5   10   15   20   25   30
Req: 1.2K 1.8K 2.1K 1.9K 2.3K 2.0K
```

## 📈 Performance Monitoring

### Response Time Metrics

**Percentile Distribution**:
```
P50 (Median): 15ms    ████████████
P95:          45ms    ████████████████████
P99:          120ms   ████████████████████████████
Max:          350ms   ████████████████████████████████████
```

**Trending Analysis**:
- **1 Hour**: Response times stable
- **24 Hours**: Minor degradation during peak hours
- **7 Days**: Overall improvement trend

### Throughput Analysis

**Requests Per Second**:
```
Current: 12.5 req/s
Average: 8.7 req/s
Peak: 45.2 req/s
Target: 50 req/s
```

**Error Rate Monitoring**:
```
2xx Success: 98.7% ████████████████████████████████████
4xx Client:   1.1% ██
5xx Server:   0.2% ▌
```

### Resource Utilization

**Memory Usage**:
```
Current: 45.2MB
Peak: 67.1MB
Limit: 512MB
Trend: Stable ➡️
```

**CPU Usage**:
```
Current: 12.5%
Average: 8.3%
Peak: 34.7%
Cores: 4
```

## 🧪 Testing Tools

### Rate Limit Testing

**Quick Test Buttons**:
- 🔴 **Strict Endpoint** (5 req/min): Test aggressive rate limiting
- 🟡 **Moderate Endpoint** (30 req/min): Test standard limits
- 🟢 **Heavy Endpoint** (1000 req/min): Test high-volume scenarios

**Test Results Display**:
```
Testing: /demo/strict (5 requests/minute)

Request 1: ✅ 200 OK (15ms)
Request 2: ✅ 200 OK (12ms)
Request 3: ✅ 200 OK (18ms)
Request 4: ✅ 200 OK (14ms)
Request 5: ✅ 200 OK (16ms)
Request 6: ❌ 429 Too Many Requests (8ms)

Rate Limit Headers:
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1625097600
```

### Authentication Testing

**JWT Authentication**:
1. **Login with Demo User**:
   ```
   Email: admin@example.com
   Password: demo123
   ```

2. **Receive JWT Token**:
   ```
   Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   Role: admin
   Expires: 24 hours
   ```

3. **Test Protected Endpoints**:
   - `/admin/users` (Admin only)
   - `/premium/features` (Premium+ only)
   - `/secure/data` (Authenticated users)

**API Key Testing**:
1. **Generate Test Key** (use form above)
2. **Test Endpoints with Key**:
   ```bash
   curl -H "X-API-Key: ak_test_123..." http://localhost:3000/api/data
   ```

## 🔍 Monitoring Tools

### Live Activity Feed

**Real-time Request Log**:
```
10:30:15 GET /api/users          200  15ms  user_123
10:30:14 POST /api-keys          201  23ms  admin
10:30:13 GET /demo/strict        429   8ms  192.168.1.1
10:30:12 GET /stats              200  12ms  dashboard
10:30:11 GET /health             200   5ms  health-check
```

**Activity Filters**:
- 🟢 **Successful Requests** (2xx)
- 🟡 **Client Errors** (4xx)
- 🔴 **Server Errors** (5xx)
- ⚠️ **Rate Limited** (429)

### Configuration Viewer

**Current Settings**:
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

## 📋 Advanced Features

### Export Functionality

**Statistics Export**:
- 📊 **CSV Export**: Download usage statistics
- 📈 **JSON Export**: Raw metrics data
- 📋 **PDF Report**: Formatted performance report

**API Key Export**:
- 📝 **Key List CSV**: All keys with metadata
- 📊 **Usage Report**: Detailed usage statistics
- 🔒 **Security Audit**: Key access patterns

### Alerts and Notifications

**Configurable Alerts**:
- 🚨 **High Error Rate**: >5% error rate
- ⚡ **Performance Degradation**: >100ms average response
- 🔄 **Redis Connection Lost**: Fallback mode activated
- 📈 **Quota Exceeded**: API key monthly limit reached

**Alert Display**:
```
🚨 ALERT: High error rate detected
   Error Rate: 7.2% (threshold: 5%)
   Duration: 5 minutes
   Action: Investigate client requests
   [Acknowledge] [View Details]
```

## 🛠️ Troubleshooting

### Common Issues

**Dashboard Not Loading**:
1. Verify service is running: `http://localhost:3000/health`
2. Check browser console for JavaScript errors
3. Try incognito/private browsing mode
4. Clear browser cache and cookies

**API Key Generation Fails**:
1. Check browser network tab for errors
2. Verify service has write permissions
3. Ensure required fields are filled
4. Check server logs for detailed errors

**Statistics Not Updating**:
1. Verify WebSocket connection (if implemented)
2. Refresh the page manually
3. Check if service is receiving requests
4. Verify monitoring is enabled in configuration

### Performance Optimization

**Dashboard Responsiveness**:
- Disable auto-refresh during heavy load testing
- Use pagination for large API key lists
- Filter data to reduce rendering overhead
- Close unused browser tabs

**Resource Usage**:
- Monitor memory usage during extended sessions
- Clear old data periodically
- Use efficient data visualization settings
- Optimize dashboard refresh intervals

## 🔧 Customization

### Dashboard Configuration

**Refresh Intervals**:
- Real-time metrics: 1 second
- Performance charts: 5 seconds
- Usage statistics: 30 seconds
- Configuration data: Manual refresh

**Display Options**:
- 🌓 **Dark/Light Mode**: Toggle theme
- 📊 **Chart Types**: Line, bar, area charts
- 📋 **Table Pagination**: Customize page sizes
- 🎨 **Color Schemes**: Accessibility options

### Integration Options

**Embedding Dashboard**:
```html
<iframe src="http://localhost:3000/dashboard" 
        width="100%" height="600px">
</iframe>
```

**API Integration**:
```javascript
// Fetch dashboard data programmatically
const stats = await fetch('/stats').then(r => r.json());
const performance = await fetch('/performance').then(r => r.json());
```

---

**Next**: [📈 Metrics & Statistics](./Metrics.md) or [🏥 Health Checks](./Health-Checks.md)
