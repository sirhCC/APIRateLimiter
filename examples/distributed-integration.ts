import express from 'express';
import { setupDistributedRateLimiter, quickSetupDistributed, productionSetupDistributed } from '../src/utils/distributedSetup';
import { log } from '../src/utils/logger';

/**
 * Example: Distributed Rate Limiter Integration
 * 
 * This file demonstrates how to integrate the distributed rate limiter
 * into your Express application with various configuration options.
 */

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Example 1: Quick Setup (Recommended for development)
 * 
 * This is the easiest way to get started with distributed rate limiting.
 * It uses sensible defaults and minimal configuration.
 */
async function exampleQuickSetup() {
  console.log('Setting up distributed rate limiter with quick setup...');
  
  try {
    const { limiter, getStats, shutdown } = await quickSetupDistributed(app, {
      limit: 1000,           // 1000 requests per window
      windowMs: 3600000,     // 1 hour window
      excludePaths: ['/health', '/metrics']  // Don't rate limit these paths
    });
    
    console.log('✅ Quick setup completed successfully!');
    
    // You can access statistics
    const stats = getStats();
    console.log('Current stats:', {
      instanceId: stats.instanceId,
      totalRequests: stats.totalRequests,
      clusterHealth: stats.clusterHealth
    });
    
    return { shutdown };
  } catch (error) {
    console.error('❌ Quick setup failed:', error);
    throw error;
  }
}

/**
 * Example 2: Advanced Configuration
 * 
 * This shows how to use the full configuration options for more control
 * over the distributed rate limiting behavior.
 */
async function exampleAdvancedSetup() {
  console.log('Setting up distributed rate limiter with advanced configuration...');
  
  try {
    const { limiter, getStats, shutdown } = await setupDistributedRateLimiter({
      app,
      
      // Redis cluster configuration (can be overridden via environment variables)
      redis: {
        instanceId: `api-rate-limiter-${process.env.HOSTNAME || 'local'}-${PORT}`,
        coordinationPrefix: 'my_app:rate_limiter',
        
        // Use cluster mode if available, fallback to single instance
        ...(process.env.REDIS_CLUSTER_NODES ? {
          cluster: {
            nodes: process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
              const [host, port] = node.split(':');
              return { host, port: parseInt(port) };
            }),
            options: {
              enableOfflineQueue: false,
              redisOptions: {
                password: process.env.REDIS_PASSWORD,
                connectTimeout: 10000,
                lazyConnect: true
              },
              maxRetriesPerRequest: 3,
              retryDelayOnFailover: 100,
              scaleReads: 'slave'
            }
          }
        } : {
          single: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0')
          }
        }),
        
        // Circuit breaker configuration
        circuitBreaker: {
          failureThreshold: 5,      // Open circuit after 5 failures
          successThreshold: 3,      // Close circuit after 3 successes
          timeout: 60000            // Wait 60 seconds before half-open
        }
      },
      
      // Default rate limiting rules
      rateLimiting: {
        defaultLimit: 1000,         // Default limit per window
        defaultWindowMs: 3600000,   // 1 hour default window
        defaultAlgorithm: 'sliding-window'  // Most accurate algorithm
      },
      
      // Custom rules for specific endpoints
      customRules: [
        {
          path: '/api/auth/login',
          methods: ['POST'],
          limit: 5,                 // Very restrictive for login
          windowMs: 900000,         // 15 minutes
          algorithm: 'sliding-window'
        },
        {
          path: '/api/auth/register',
          methods: ['POST'],
          limit: 3,                 // Even more restrictive for registration
          windowMs: 3600000,        // 1 hour
          algorithm: 'sliding-window'
        },
        {
          path: /^\/api\/users\/\d+\/profile$/,  // RegExp for user profile updates
          methods: ['PUT', 'PATCH'],
          limit: 10,
          windowMs: 600000,         // 10 minutes
          algorithm: 'token-bucket'
        },
        {
          path: '/api/data/upload',
          methods: ['POST'],
          limit: 50,
          windowMs: 3600000,        // 1 hour
          algorithm: 'token-bucket'  // Good for bursty uploads
        },
        {
          path: '/api/admin/',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          limit: 100,
          windowMs: 3600000,        // 1 hour
          algorithm: 'sliding-window'
        }
      ],
      
      // Feature toggles
      features: {
        circuitBreaker: true,       // Enable circuit breaker
        monitoring: true,           // Enable performance monitoring
        fallbackMode: true          // Enable local fallback when Redis is down
      },
      
      // Paths to exclude from rate limiting
      excludePaths: [
        '/health',
        '/metrics',
        '/ping',
        /^\/static\//,              // Static assets
        /^\/public\//               // Public content
      ]
    });
    
    console.log('✅ Advanced setup completed successfully!');
    
    // Monitor statistics periodically
    setInterval(() => {
      const stats = getStats();
      log.system('Distributed rate limiter stats', {
        metadata: {
          instanceId: stats.instanceId,
          totalRequests: stats.totalRequests,
          blockedRequests: stats.blockedRequests,
          errorCount: stats.errorCount,
          clusterConnected: stats.clusterHealth.connected,
          circuitBreakerState: stats.clusterHealth.circuitBreakerState,
          uptime: Math.round(stats.uptime)
        }
      });
    }, 300000); // Every 5 minutes
    
    return { shutdown };
  } catch (error) {
    console.error('❌ Advanced setup failed:', error);
    throw error;
  }
}

/**
 * Example 3: Production Configuration
 * 
 * This demonstrates a production-ready configuration with strict limits
 * and comprehensive monitoring.
 */
async function exampleProductionSetup() {
  console.log('Setting up distributed rate limiter for production...');
  
  try {
    const { limiter, getStats, shutdown } = await productionSetupDistributed(app);
    
    console.log('✅ Production setup completed successfully!');
    
    // Enhanced monitoring for production
    setInterval(async () => {
      const stats = getStats();
      
      // Check for alerts
      const errorRate = stats.errorCount / Math.max(stats.totalRequests, 1);
      const blockRate = stats.blockedRequests / Math.max(stats.totalRequests, 1);
      
      if (errorRate > 0.05) {  // 5% error rate
        log.system('High error rate detected in distributed rate limiter', {
          severity: 'critical' as const,
          metadata: {
            errorRate: errorRate * 100,
            totalRequests: stats.totalRequests,
            errorCount: stats.errorCount
          }
        });
      }
      
      if (blockRate > 0.2) {  // 20% block rate
        log.system('High block rate detected in distributed rate limiter', {
          severity: 'medium' as const,
          metadata: {
            blockRate: blockRate * 100,
            totalRequests: stats.totalRequests,
            blockedRequests: stats.blockedRequests
          }
        });
      }
      
      if (!stats.clusterHealth.connected) {
        log.system('Redis cluster connection lost', {
          severity: 'critical' as const,
          metadata: {
            circuitBreakerState: stats.clusterHealth.circuitBreakerState,
            activeNodes: stats.clusterHealth.activeNodes
          }
        });
      }
    }, 60000); // Every minute in production
    
    return { shutdown };
  } catch (error) {
    console.error('❌ Production setup failed:', error);
    throw error;
  }
}

/**
 * Example API Endpoints
 * 
 * These endpoints demonstrate how the distributed rate limiter works
 * with different types of requests.
 */

// Health check endpoint (excluded from rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    instance: process.env.INSTANCE_ID || 'unknown'
  });
});

// Authentication endpoints (strict rate limiting)
app.post('/api/auth/login', (req, res) => {
  // Simulate login processing
  const success = Math.random() > 0.1; // 90% success rate
  
  if (success) {
    res.json({
      success: true,
      token: 'example-jwt-token',
      message: 'Login successful'
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

app.post('/api/auth/register', (req, res) => {
  // Simulate registration processing
  res.json({
    success: true,
    message: 'Registration successful',
    userId: Math.random().toString(36).substring(7)
  });
});

// API endpoints (moderate rate limiting)
app.get('/api/users/:id/profile', (req, res) => {
  res.json({
    id: req.params.id,
    name: 'John Doe',
    email: 'john@example.com',
    lastLogin: new Date().toISOString()
  });
});

app.put('/api/users/:id/profile', (req, res) => {
  res.json({
    success: true,
    message: 'Profile updated successfully'
  });
});

// Data upload endpoint (token bucket algorithm)
app.post('/api/data/upload', (req, res) => {
  // Simulate file upload processing
  setTimeout(() => {
    res.json({
      success: true,
      fileId: Math.random().toString(36).substring(7),
      size: Math.floor(Math.random() * 1000000),
      message: 'File uploaded successfully'
    });
  }, Math.random() * 1000); // Random processing time
});

// Admin endpoints (restricted access)
app.get('/api/admin/stats', (req, res) => {
  res.json({
    totalUsers: Math.floor(Math.random() * 10000),
    activeConnections: Math.floor(Math.random() * 100),
    systemLoad: Math.random()
  });
});

// Test endpoint for rate limiting demonstration
app.get('/api/test/rate-limit', (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    message: 'This endpoint is rate limited',
    headers: {
      remaining: res.get('X-RateLimit-Remaining'),
      limit: res.get('X-RateLimit-Limit'),
      reset: res.get('X-RateLimit-Reset'),
      instance: res.get('X-RateLimit-Instance'),
      shard: res.get('X-RateLimit-Shard')
    }
  });
});

/**
 * Main Application Startup
 */
async function startApplication() {
  try {
    let shutdown: (() => Promise<void>) | undefined;
    
    // Choose setup method based on environment
    const setupMethod = process.env.RATE_LIMITER_SETUP || 'quick';
    
    switch (setupMethod) {
      case 'advanced':
        ({ shutdown } = await exampleAdvancedSetup());
        break;
      case 'production':
        ({ shutdown } = await exampleProductionSetup());
        break;
      case 'quick':
      default:
        ({ shutdown } = await exampleQuickSetup());
        break;
    }
    
    // Start the server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`📈 Distributed stats: http://localhost:${PORT}/stats/distributed`);
      console.log(`🔍 Distributed health: http://localhost:${PORT}/health/distributed`);
      console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test/rate-limit`);
    });
    
    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      server.close(() => {
        console.log('HTTP server closed.');
      });
      
      if (shutdown) {
        await shutdown();
        console.log('Distributed rate limiter shutdown completed.');
      }
      
      process.exit(0);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startApplication();
}

export default app;
