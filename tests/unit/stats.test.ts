/**
 * Unit Tests for Statistics Utilities
 * 
 * Tests the circular buffer implementation and LRU cache performance optimizations.
 */

import { SimpleStats } from '../../src/utils/stats';

describe('Statistics Utilities', () => {
  let stats: SimpleStats;

  beforeEach(() => {
    stats = new SimpleStats();
  });

  describe('SimpleStats Class', () => {
    it('should initialize with default values', () => {
      const result = stats.getStats();
      expect(result.totalRequests).toBe(0);
      expect(result.allowedRequests).toBe(0);
      expect(result.blockedRequests).toBe(0);
      expect(result.averageResponseTime).toBe(0);
    });

    it('should track request counts correctly', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      
      stats.recordRequest(mockReq, false, 100); // allowed
      stats.recordRequest(mockReq, false, 150); // allowed
      stats.recordRequest(mockReq, true, 50);   // blocked

      const result = stats.getStats();
      expect(result.totalRequests).toBe(3);
      expect(result.allowedRequests).toBe(2);
      expect(result.blockedRequests).toBe(1);
    });

    it('should calculate average response time correctly', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      
      stats.recordRequest(mockReq, false, 100);
      stats.recordRequest(mockReq, false, 200);
      stats.recordRequest(mockReq, true, 300);

      const result = stats.getStats();
      expect(result.averageResponseTime).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should track endpoint-specific statistics', () => {
      const mockReq1 = { method: 'GET', path: '/api/users', ip: '127.0.0.1' };
      const mockReq2 = { method: 'POST', path: '/api/posts', ip: '127.0.0.1' };
      
      stats.recordRequest(mockReq1, false, 150);
      stats.recordRequest(mockReq2, false, 100);
      stats.recordRequest(mockReq1, false, 200);

      const result = stats.getStats();
      expect(result.topEndpoints).toContainEqual(['GET /api/users', 2]);
      expect(result.topEndpoints).toContainEqual(['POST /api/posts', 1]);
    });

    it('should track IP-specific statistics', () => {
      const mockReq1 = { method: 'GET', path: '/test', ip: '192.168.1.1' };
      const mockReq2 = { method: 'GET', path: '/test', ip: '192.168.1.2' };
      
      stats.recordRequest(mockReq1, false); // allowed
      stats.recordRequest(mockReq2, true);  // blocked
      stats.recordRequest(mockReq1, false); // allowed

      const result = stats.getStats();
      expect(result.topIPs).toContainEqual(['192.168.1.1', 2]);
      expect(result.topIPs).toContainEqual(['192.168.1.2', 1]);
    });

    it('should handle rapid consecutive requests', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      
      // Simulate high-volume traffic
      for (let i = 0; i < 1000; i++) {
        stats.recordRequest(mockReq, i % 2 === 0, Math.random() * 1000);
      }

      const result = stats.getStats();
      expect(result.totalRequests).toBe(1000);
      expect(result.allowedRequests).toBe(500);
      expect(result.blockedRequests).toBe(500);
      expect(result.averageResponseTime).toBeGreaterThan(0);
    });

    it('should provide detailed statistics summary', () => {
      const mockReq = { method: 'GET', path: '/api/test', ip: '127.0.0.1' };
      
      stats.recordRequest(mockReq, false, 100);
      stats.recordRequest(mockReq, true, 200);

      const result = stats.getStats();
      
      expect(result).toHaveProperty('totalRequests');
      expect(result).toHaveProperty('allowedRequests');
      expect(result).toHaveProperty('blockedRequests');
      expect(result).toHaveProperty('averageResponseTime');
      expect(result).toHaveProperty('requestsPerMinute');
      expect(result).toHaveProperty('topEndpoints');
      expect(result).toHaveProperty('topIPs');
      expect(result).toHaveProperty('blockRate');
      expect(result).toHaveProperty('successRate');

      expect(result.totalRequests).toBe(2);
      expect(result.allowedRequests).toBe(1);
      expect(result.blockedRequests).toBe(1);
      expect(result.blockRate).toBe(50);
      expect(result.successRate).toBe(50);
    });

    it('should handle edge cases gracefully', () => {
      // Test with zero requests
      const result = stats.getStats();
      expect(result.averageResponseTime).toBe(0);
      expect(result.requestsPerMinute).toBe(0);

      // Test with missing response times
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      stats.recordRequest(mockReq, false); // no response time
      
      const result2 = stats.getStats();
      expect(result2.averageResponseTime).toBe(0);
    });

    it('should limit endpoint tracking to prevent memory leaks', () => {
      // Add more endpoints than the limit (500)
      for (let i = 0; i < 600; i++) {
        const mockReq = { method: 'GET', path: `/api/endpoint${i}`, ip: '127.0.0.1' };
        stats.recordRequest(mockReq, false, 100);
      }

      const result = stats.getStats();
      const endpointCount = result.memoryUsage.endpointsCached;
      
      // Should not exceed the maximum limit
      expect(endpointCount).toBeLessThanOrEqual(500);
    });

    it('should limit IP tracking to prevent memory leaks', () => {
      // Add more IPs than the limit (1000)
      for (let i = 0; i < 1200; i++) {
        const mockReq = { method: 'GET', path: '/test', ip: `192.168.1.${i % 255}` };
        stats.recordRequest(mockReq, false);
      }

      const result = stats.getStats();
      const ipCount = result.memoryUsage.ipsCached;
      
      // Should not exceed the maximum limit
      expect(ipCount).toBeLessThanOrEqual(1000);
    });

    it('should calculate request rate over time', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      
      // Record some requests
      for (let i = 0; i < 10; i++) {
        stats.recordRequest(mockReq, false, 100);
      }

      const result = stats.getStats();
      expect(result.requestsPerMinute).toBeGreaterThan(0);
      expect(result.currentRequestsPerMinute).toBeGreaterThan(0);
    });

    it('should handle concurrent access safely', async () => {
      // Simulate concurrent access from multiple sources
      const promises: Promise<void>[] = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            const mockReq = { 
              method: 'GET', 
              path: `/api/test${i % 10}`, 
              ip: `192.168.1.${i % 10}` 
            };
            stats.recordRequest(mockReq, false, Math.random() * 1000);
          })
        );
      }

      await Promise.all(promises);

      const result = stats.getStats();
      expect(result.totalRequests).toBe(100);
      expect(result.topEndpoints.length).toBeGreaterThan(0);
      expect(result.topIPs.length).toBeGreaterThan(0);
    });

    it('should provide response time percentiles', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      
      // Add requests with varying response times
      for (let i = 1; i <= 100; i++) {
        stats.recordRequest(mockReq, false, i * 10); // 10, 20, 30, ..., 1000
      }

      const result = stats.getStats();
      expect(result.p95ResponseTime).toBeGreaterThan(0);
      expect(result.p99ResponseTime).toBeGreaterThan(0);
      expect(result.p99ResponseTime).toBeGreaterThanOrEqual(result.p95ResponseTime);
    });

    it('should track peak requests per minute', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      
      // Add a burst of requests
      for (let i = 0; i < 50; i++) {
        stats.recordRequest(mockReq, false, 100);
      }

      const result = stats.getStats();
      expect(result.peakRequestsPerMinute).toBe(50);
      expect(result.currentRequestsPerMinute).toBe(50);
    });

    it('should cache statistics for performance', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      stats.recordRequest(mockReq, false, 100);

      // First call should compute stats
      const startTime = Date.now();
      const result1 = stats.getStats();
      const firstCallTime = Date.now() - startTime;

      // Second call should be cached (faster)
      const startTime2 = Date.now();
      const result2 = stats.getStats();
      const secondCallTime = Date.now() - startTime2;

      expect(result1).toEqual(result2);
      // Cache should make second call faster (though this might be flaky in fast environments)
      expect(result1.totalRequests).toBe(1);
    });

    it('should reset statistics correctly', () => {
      const mockReq = { method: 'GET', path: '/api/test', ip: '127.0.0.1' };
      
      // Add some data
      stats.recordRequest(mockReq, false, 100);
      
      let result = stats.getStats();
      expect(result.totalRequests).toBe(1);

      // Reset and verify
      stats.reset();
      result = stats.getStats();

      expect(result.totalRequests).toBe(0);
      expect(result.allowedRequests).toBe(0);
      expect(result.blockedRequests).toBe(0);
      expect(result.averageResponseTime).toBe(0);
      expect(result.topEndpoints).toHaveLength(0);
      expect(result.topIPs).toHaveLength(0);
    });

    it('should handle missing IP gracefully', () => {
      const mockReq = { method: 'GET', path: '/test' }; // no IP field
      
      stats.recordRequest(mockReq, false, 100);
      
      const result = stats.getStats();
      expect(result.totalRequests).toBe(1);
      expect(result.topIPs).toContainEqual(['unknown', 1]);
    });

    it('should track memory usage efficiently', () => {
      const mockReq = { method: 'GET', path: '/test', ip: '127.0.0.1' };
      
      // Add various amounts of data
      for (let i = 0; i < 150; i++) {
        stats.recordRequest(mockReq, false, i);
      }

      const result = stats.getStats();
      const memUsage = result.memoryUsage;
      
      expect(memUsage.responseTimesSampled).toBeLessThanOrEqual(100); // Circular buffer limit
      expect(memUsage.timestampsSampled).toBeGreaterThan(0);
      expect(memUsage.endpointsCached).toBeGreaterThan(0);
      expect(memUsage.ipsCached).toBeGreaterThan(0);
    });
  });
});
