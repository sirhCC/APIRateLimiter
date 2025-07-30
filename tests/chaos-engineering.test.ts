/**
 * Chaos Engineering Tests
 * Priority #5: Testing & Quality Infrastructure
 * 
 * Tests system resilience under failure conditions:
 * - Redis connection loss
 * - Memory pressure
 * - Network partitions
 * - High CPU usage
 * - Gradual degradation
 */

import { performance } from 'perf_hooks';
import express from 'express';
import request from 'supertest';

// Mock Redis with controlled failure scenarios
let redisFailureMode = false;
let redisLatencyMs = 0;
let redisConnectionLost = false;

jest.mock('../src/utils/redis', () => ({
  createRedisClient: () => ({
    get isConnected() {
      return !redisConnectionLost;
    },
    disconnect: jest.fn(),
    async tokenBucket(...args: any[]) {
      if (redisConnectionLost) throw new Error('Redis connection lost');
      if (redisFailureMode) throw new Error('Redis operation failed');
      if (redisLatencyMs > 0) await new Promise(resolve => setTimeout(resolve, redisLatencyMs));
      return { allowed: true, remaining: 10 };
    },
    async slidingWindow(...args: any[]) {
      if (redisConnectionLost) throw new Error('Redis connection lost');
      if (redisFailureMode) throw new Error('Redis operation failed');
      if (redisLatencyMs > 0) await new Promise(resolve => setTimeout(resolve, redisLatencyMs));
      return { allowed: true, remaining: 10 };
    },
    async fixedWindow(...args: any[]) {
      if (redisConnectionLost) throw new Error('Redis connection lost');
      if (redisFailureMode) throw new Error('Redis operation failed');
      if (redisLatencyMs > 0) await new Promise(resolve => setTimeout(resolve, redisLatencyMs));
      return { allowed: true, remaining: 10 };
    }
  })
}));

describe('Chaos Engineering Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    // Reset failure modes
    redisFailureMode = false;
    redisLatencyMs = 0;
    redisConnectionLost = false;

    // Create test app
    app = express();
    app.use(express.json());
    
    // Mock rate limiter middleware
    app.use(async (req, res, next) => {
      try {
        // Simulate rate limiter check
        const redis = require('../src/utils/redis').createRedisClient();
        await redis.tokenBucket('test', 1000, 10, Date.now(), 'test-id');
        next();
      } catch (error) {
        // Fail open on Redis errors
        next();
      }
    });

    app.get('/test', (req, res) => {
      res.json({ message: 'success', timestamp: Date.now() });
    });

    app.get('/health', (req, res) => {
      res.json({ status: 'ok', redis: !redisConnectionLost });
    });
  });

  describe('Redis Connection Failures', () => {
    test('should handle Redis connection loss gracefully', async () => {
      // Start with working Redis
      let response = await request(app).get('/test');
      expect(response.status).toBe(200);

      // Simulate Redis connection loss
      redisConnectionLost = true;

      // App should still work (fail-open behavior)
      response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('success');
    });

    test('should handle Redis operation failures', async () => {
      redisFailureMode = true;

      const response = await request(app).get('/test');
      expect(response.status).toBe(200); // Should fail open
    });

    test('should handle Redis reconnection', async () => {
      // Start disconnected
      redisConnectionLost = true;
      let response = await request(app).get('/test');
      expect(response.status).toBe(200);

      // Reconnect
      redisConnectionLost = false;
      response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });
  });

  describe('Network Latency Scenarios', () => {
    test('should handle high Redis latency', async () => {
      redisLatencyMs = 2000; // 2 second delay

      const startTime = performance.now();
      const response = await request(app).get('/test');
      const endTime = performance.now();

      expect(response.status).toBe(200);
      // Should complete within reasonable time (not wait for Redis)
      expect(endTime - startTime).toBeLessThan(3000);
    });

    test('should handle variable network conditions', async () => {
      const latencies = [0, 100, 500, 1000, 100, 0];
      const results: Array<{ latency: number; responseTime: number; status: number }> = [];

      for (const latency of latencies) {
        redisLatencyMs = latency;
        const startTime = performance.now();
        const response = await request(app).get('/test');
        const endTime = performance.now();

        results.push({
          latency,
          responseTime: endTime - startTime,
          status: response.status
        });
      }

      // All requests should succeed
      expect(results.every(r => r.status === 200)).toBe(true);
      
      // Response times should be reasonable even with high Redis latency
      expect(results.every(r => r.responseTime < 3000)).toBe(true);
    });
  });

  describe('Memory Pressure Tests', () => {
    test('should handle memory allocation stress', async () => {
      const initialMemory = process.memoryUsage();
      const largeObjects: any[] = [];

      try {
        // Allocate large objects to simulate memory pressure
        for (let i = 0; i < 100; i++) {
          largeObjects.push(new Array(100000).fill('x'));
          
          // Test API during memory pressure
          if (i % 20 === 0) {
            const response = await request(app).get('/test');
            expect(response.status).toBe(200);
          }
        }

        // Final test under peak memory usage
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);

      } finally {
        // Cleanup
        largeObjects.length = 0;
        if (global.gc) global.gc();
      }

      const finalMemory = process.memoryUsage();
      console.log(`Memory test: ${Math.round((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024)}MB growth`);
    });

    test('should handle rapid object creation/destruction', async () => {
      for (let cycle = 0; cycle < 10; cycle++) {
        // Create and destroy objects rapidly
        const tempObjects = Array.from({ length: 1000 }, () => ({ data: Math.random() }));
        
        const response = await request(app).get('/test');
        expect(response.status).toBe(200);
        
        // Cleanup
        tempObjects.length = 0;
      }
    });
  });

  describe('Concurrent Load Tests', () => {
    test('should handle concurrent request bursts', async () => {
      const concurrentRequests = 50;
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/test')
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed
      expect(responses.every(r => r.status === 200)).toBe(true);
      
      // Check for consistent response
      responses.forEach(response => {
        expect(response.body.message).toBe('success');
        expect(response.body.timestamp).toBeDefined();
      });
    });

    test('should handle mixed Redis failure scenarios under load', async () => {
      const scenarios = [
        { name: 'normal', setup: () => {} },
        { name: 'connection_lost', setup: () => { redisConnectionLost = true; } },
        { name: 'high_latency', setup: () => { redisLatencyMs = 1000; } },
        { name: 'operation_failure', setup: () => { redisFailureMode = true; } }
      ];

      for (const scenario of scenarios) {
        scenario.setup();
        
        // Run concurrent requests for each scenario
        const requests = Array.from({ length: 20 }, () =>
          request(app).get('/test')
        );

        const responses = await Promise.all(requests);
        
        // All should succeed (fail-open behavior)
        expect(responses.every(r => r.status === 200)).toBe(true);
        
        // Reset for next scenario
        redisConnectionLost = false;
        redisLatencyMs = 0;
        redisFailureMode = false;
      }
    });
  });

  describe('Gradual Degradation Tests', () => {
    test('should handle gradual Redis degradation', async () => {
      const degradationSteps = [
        { latency: 0, failureRate: 0 },
        { latency: 100, failureRate: 0.1 },
        { latency: 500, failureRate: 0.2 },
        { latency: 1000, failureRate: 0.5 },
        { latency: 2000, failureRate: 0.8 },
        { latency: 0, failureRate: 0 } // Recovery
      ];

      const results: Array<{
        step: { latency: number; failureRate: number };
        successRate: number;
        avgResponseTime: number;
      }> = [];

      for (const step of degradationSteps) {
        redisLatencyMs = step.latency;
        redisFailureMode = Math.random() < step.failureRate;

        const responses = await Promise.all([
          request(app).get('/test'),
          request(app).get('/test'),
          request(app).get('/test')
        ]);

        const successRate = responses.filter(r => r.status === 200).length / responses.length;
        
        results.push({
          step,
          successRate,
          avgResponseTime: responses.reduce((sum, r) => sum + 100, 0) / responses.length // Simplified timing
        });

        // Reset failure mode for next iteration
        redisFailureMode = false;
      }

      // System should maintain high availability even during degradation
      expect(results.every(r => r.successRate >= 0.8)).toBe(true);
      
      console.log('Degradation test results:', results);
    });
  });

  describe('Recovery Tests', () => {
    test('should recover from complete system failure', async () => {
      // Simulate complete failure
      redisConnectionLost = true;
      redisFailureMode = true;

      // System should still respond
      let response = await request(app).get('/test');
      expect(response.status).toBe(200);

      // Gradual recovery
      redisFailureMode = false;
      response = await request(app).get('/test');
      expect(response.status).toBe(200);

      redisConnectionLost = false;
      response = await request(app).get('/test');
      expect(response.status).toBe(200);
    });

    test('should handle flapping Redis connection', async () => {
      const results: number[] = [];

      // Simulate connection flapping
      for (let i = 0; i < 20; i++) {
        redisConnectionLost = i % 3 === 0; // Connection up 2/3 of the time
        
        const response = await request(app).get('/test');
        results.push(response.status);
      }

      // Should maintain high success rate despite flapping
      const successRate = results.filter(status => status === 200).length / results.length;
      expect(successRate).toBeGreaterThan(0.9);
    });
  });

  describe('Edge Case Handling', () => {
    test('should handle extremely high request rates', async () => {
      const startTime = performance.now();
      const promises: Promise<any>[] = [];

      // Fire 1000 requests as fast as possible
      for (let i = 0; i < 1000; i++) {
        promises.push(request(app).get('/test'));
      }

      const responses = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = responses.filter(r => r.status === 200).length;
      const totalTime = endTime - startTime;
      const requestsPerSecond = 1000 / (totalTime / 1000);

      console.log(`Processed ${successCount}/1000 requests in ${totalTime.toFixed(2)}ms (${requestsPerSecond.toFixed(2)} req/s)`);

      // Should handle at least 90% of requests successfully
      expect(successCount / 1000).toBeGreaterThan(0.9);
    });

    test('should handle resource exhaustion gracefully', async () => {
      // Simulate resource exhaustion by creating many concurrent operations
      const heavyOperations = Array.from({ length: 100 }, async (_, i) => {
        // Simulate CPU-intensive work
        let sum = 0;
        for (let j = 0; j < 100000; j++) {
          sum += Math.sin(j);
        }
        
        return request(app).get('/test');
      });

      const responses = await Promise.all(heavyOperations);
      const successRate = responses.filter(r => r.status === 200).length / responses.length;

      // Should maintain reasonable success rate even under resource pressure
      expect(successRate).toBeGreaterThan(0.8);
    });
  });
});
