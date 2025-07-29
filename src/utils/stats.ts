/**
 * Circular buffer for efficient memory management
 */
class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  toArray(): T[] {
    if (this.size === 0) return [];
    
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    
    // Buffer is full, need to reorder
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }

  length(): number {
    return this.size;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}

/**
 * LRU Cache for endpoint/IP tracking with automatic cleanup
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)!;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  increment(key: K): number {
    const current = this.get(key) as number || 0;
    const newValue = current + 1;
    this.set(key, newValue as V);
    return newValue;
  }

  entries(): [K, V][] {
    return Array.from(this.cache.entries());
  }

  clear(): void {
    this.cache.clear();
  }
}

export class SimpleStats {
  private stats = {
    totalRequests: 0,
    blockedRequests: 0,
    allowedRequests: 0,
    startTime: Date.now(),
    requestsByEndpoint: new LRUCache<string, number>(500), // Limit to 500 endpoints
    requestsByIP: new LRUCache<string, number>(1000), // Limit to 1000 IPs
    responseTimes: new CircularBuffer<number>(100), // Efficient circular buffer
    peakRequestsPerMinute: 0,
    requestTimestamps: new CircularBuffer<number>(1000), // Track more efficiently
  };

  // Cache for expensive calculations
  private cachedStats: any = null;
  private lastCacheTime = 0;
  private cacheValidityMs = 1000; // Cache for 1 second

  recordRequest(req: any, blocked: boolean, responseTime?: number) {
    this.stats.totalRequests++;
    const now = Date.now();
    
    // Track timestamps for peak traffic calculation
    this.stats.requestTimestamps.push(now);
    
    // Clean old timestamps (older than 60 seconds) - more efficient approach
    const timestamps = this.stats.requestTimestamps.toArray();
    const oneMinuteAgo = now - 60000;
    const recentTimestamps = timestamps.filter(t => t > oneMinuteAgo);
    
    // Only rebuild if significant cleanup occurred
    if (recentTimestamps.length < timestamps.length * 0.8) {
      this.stats.requestTimestamps.clear();
      recentTimestamps.forEach(t => this.stats.requestTimestamps.push(t));
    }
    
    // Update peak requests per minute
    const currentRPM = this.stats.requestTimestamps.length();
    if (currentRPM > this.stats.peakRequestsPerMinute) {
      this.stats.peakRequestsPerMinute = currentRPM;
    }
    
    if (blocked) {
      this.stats.blockedRequests++;
    } else {
      this.stats.allowedRequests++;
    }
    
    // Track response time - circular buffer automatically manages size
    if (responseTime !== undefined) {
      this.stats.responseTimes.push(responseTime);
    }
    
    // Track by endpoint
    const endpoint = `${req.method} ${req.path}`;
    this.stats.requestsByEndpoint.increment(endpoint);
    
    // Track by IP
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    this.stats.requestsByIP.increment(ip);
    
    // Invalidate cache when new data comes in
    this.cachedStats = null;
  }

  getStats() {
    const now = Date.now();
    
    // Return cached stats if still valid
    if (this.cachedStats && (now - this.lastCacheTime) < this.cacheValidityMs) {
      return this.cachedStats;
    }

    const uptime = now - this.stats.startTime;
    const requestsPerMinute = uptime > 100 // Minimum 100ms for meaningful rate calculation
      ? Math.round((this.stats.totalRequests / (uptime / 1000)) * 60)
      : this.stats.totalRequests > 0 ? this.stats.totalRequests * 600 : 0; // Estimate: assume 100ms for rate calc
    
    // Calculate average response time from circular buffer
    const responseTimes = this.stats.responseTimes.toArray();
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    
    // Calculate current requests per minute (last 60 seconds)
    const currentRPM = this.stats.requestTimestamps.length();
    
    // Calculate percentiles for response times
    const sortedResponseTimes = [...responseTimes].sort((a, b) => a - b);
    const p95 = sortedResponseTimes.length > 0 
      ? sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.95)] || 0
      : 0;
    const p99 = sortedResponseTimes.length > 0
      ? sortedResponseTimes[Math.floor(sortedResponseTimes.length * 0.99)] || 0
      : 0;

    this.cachedStats = {
      totalRequests: this.stats.totalRequests,
      blockedRequests: this.stats.blockedRequests,
      allowedRequests: this.stats.allowedRequests,
      startTime: this.stats.startTime,
      uptime,
      requestsPerMinute,
      currentRequestsPerMinute: currentRPM,
      peakRequestsPerMinute: this.stats.peakRequestsPerMinute,
      averageResponseTime: avgResponseTime,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      blockRate: this.stats.totalRequests > 0 
        ? Math.round((this.stats.blockedRequests / this.stats.totalRequests) * 100) 
        : 0,
      successRate: this.stats.totalRequests > 0 
        ? Math.round((this.stats.allowedRequests / this.stats.totalRequests) * 100) 
        : 0,
      topEndpoints: this.stats.requestsByEndpoint.entries()
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      topIPs: this.stats.requestsByIP.entries()
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      memoryUsage: {
        endpointsCached: this.stats.requestsByEndpoint.entries().length,
        ipsCached: this.stats.requestsByIP.entries().length,
        responseTimesSampled: responseTimes.length,
        timestampsSampled: currentRPM,
      }
    };

    this.lastCacheTime = now;
    return this.cachedStats;
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      startTime: Date.now(),
      requestsByEndpoint: new LRUCache<string, number>(500),
      requestsByIP: new LRUCache<string, number>(1000),
      responseTimes: new CircularBuffer<number>(100),
      peakRequestsPerMinute: 0,
      requestTimestamps: new CircularBuffer<number>(1000),
    };
    
    // Clear cache
    this.cachedStats = null;
    this.lastCacheTime = 0;
  }
}
