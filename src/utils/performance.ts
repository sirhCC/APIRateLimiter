import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  requestDuration: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  timestamp: number;
  endpoint: string;
  method: string;
  statusCode: number;
  userAgent?: string;
  ip: string;
}

/**
 * High-performance monitoring with minimal overhead
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics: number;
  private cpuUsageStart: NodeJS.CpuUsage;

  constructor(maxMetrics: number = 1000) {
    this.maxMetrics = maxMetrics;
    this.cpuUsageStart = process.cpuUsage();
  }

  /**
   * Express middleware for performance monitoring
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = performance.now();
      const startCpu = process.cpuUsage();
      const startMemory = process.memoryUsage();

      // Capture response finish
      res.on('finish', () => {
        const duration = performance.now() - startTime;
        const cpuUsage = process.cpuUsage(startCpu);
        const endMemory = process.memoryUsage();

        const metric: PerformanceMetrics = {
          requestDuration: duration,
          memoryUsage: {
            rss: endMemory.rss - startMemory.rss,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            external: endMemory.external - startMemory.external,
            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
          },
          cpuUsage,
          timestamp: Date.now(),
          endpoint: `${req.method} ${req.path}`,
          method: req.method,
          statusCode: res.statusCode,
          userAgent: req.get('User-Agent'),
          ip: req.ip || req.connection.remoteAddress || 'unknown',
        };

        this.addMetric(metric);
      });

      next();
    };
  }

  private addMetric(metric: PerformanceMetrics) {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getStats() {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        slowestEndpoints: [],
        memoryTrend: { increasing: false, averageUsage: 0 },
        cpuTrend: { user: 0, system: 0 },
        errorRate: 0,
        requestsPerSecond: 0,
      };
    }

    const responseTimes = this.metrics.map(m => m.requestDuration).sort((a, b) => a - b);
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const recentMetrics = this.metrics.filter(m => m.timestamp > fiveMinutesAgo);

    // Calculate percentiles
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

    // Group by endpoint for slowest analysis
    const endpointPerformance = new Map<string, number[]>();
    this.metrics.forEach(metric => {
      if (!endpointPerformance.has(metric.endpoint)) {
        endpointPerformance.set(metric.endpoint, []);
      }
      endpointPerformance.get(metric.endpoint)!.push(metric.requestDuration);
    });

    const slowestEndpoints = Array.from(endpointPerformance.entries())
      .map(([endpoint, times]) => ({
        endpoint,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        requestCount: times.length,
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);

    // Memory trend analysis
    const memoryUsages = this.metrics.slice(-100).map(m => m.memoryUsage.heapUsed);
    const memoryTrend = {
      increasing: memoryUsages.length > 1 && 
                  memoryUsages[memoryUsages.length - 1] > memoryUsages[0],
      averageUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
    };

    // CPU trend
    const cpuUsages = this.metrics.slice(-100);
    const avgCpuUser = cpuUsages.reduce((sum, m) => sum + m.cpuUsage.user, 0) / cpuUsages.length;
    const avgCpuSystem = cpuUsages.reduce((sum, m) => sum + m.cpuUsage.system, 0) / cpuUsages.length;

    // Error rate
    const errorCount = this.metrics.filter(m => m.statusCode >= 400).length;
    const errorRate = (errorCount / this.metrics.length) * 100;

    // Requests per second (last 5 minutes)
    const requestsPerSecond = recentMetrics.length / 300; // 5 minutes = 300 seconds

    return {
      totalRequests: this.metrics.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      slowestEndpoints,
      memoryTrend,
      cpuTrend: { user: avgCpuUser, system: avgCpuSystem },
      errorRate: Math.round(errorRate * 100) / 100,
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      recentMetricsCount: recentMetrics.length,
    };
  }

  /**
   * Get detailed metrics for a specific endpoint
   */
  getEndpointStats(endpoint: string) {
    const endpointMetrics = this.metrics.filter(m => m.endpoint === endpoint);
    
    if (endpointMetrics.length === 0) {
      return null;
    }

    const responseTimes = endpointMetrics.map(m => m.requestDuration).sort((a, b) => a - b);
    const statusCodes = endpointMetrics.reduce((acc, m) => {
      acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return {
      totalRequests: endpointMetrics.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: responseTimes[0],
      maxResponseTime: responseTimes[responseTimes.length - 1],
      p50ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.5)],
      p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)],
      statusCodes,
      lastRequest: endpointMetrics[endpointMetrics.length - 1].timestamp,
    };
  }

  /**
   * Clear old metrics to free memory
   */
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.metrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
  }

  /**
   * Get current system metrics
   */
  getCurrentSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.cpuUsageStart);
    
    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024), // MB
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000), // ms
        system: Math.round(cpuUsage.system / 1000), // ms
      },
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics() {
    return {
      timestamp: Date.now(),
      stats: this.getStats(),
      system: this.getCurrentSystemMetrics(),
      recentMetrics: this.metrics.slice(-100), // Last 100 requests
    };
  }
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Cleanup task that should be run periodically
 */
export function startPerformanceCleanup(intervalMs: number = 300000) { // 5 minutes
  setInterval(() => {
    performanceMonitor.cleanup();
  }, intervalMs);
}
