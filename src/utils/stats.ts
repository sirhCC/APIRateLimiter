export class SimpleStats {
  private stats = {
    totalRequests: 0,
    blockedRequests: 0,
    allowedRequests: 0,
    startTime: Date.now(),
    requestsByEndpoint: new Map<string, number>(),
    requestsByIP: new Map<string, number>(),
    responseTimes: [] as number[], // Track last 100 response times
    peakRequestsPerMinute: 0,
    requestTimestamps: [] as number[], // For calculating peak traffic
  };

  recordRequest(req: any, blocked: boolean, responseTime?: number) {
    this.stats.totalRequests++;
    const now = Date.now();
    
    // Track timestamps for peak traffic calculation
    this.stats.requestTimestamps.push(now);
    // Keep only last 60 seconds of timestamps
    const oneMinuteAgo = now - 60000;
    this.stats.requestTimestamps = this.stats.requestTimestamps.filter(t => t > oneMinuteAgo);
    
    // Update peak requests per minute
    const currentRPM = this.stats.requestTimestamps.length;
    if (currentRPM > this.stats.peakRequestsPerMinute) {
      this.stats.peakRequestsPerMinute = currentRPM;
    }
    
    if (blocked) {
      this.stats.blockedRequests++;
    } else {
      this.stats.allowedRequests++;
    }
    
    // Track response time
    if (responseTime !== undefined) {
      this.stats.responseTimes.push(responseTime);
      // Keep only last 100 response times for rolling average
      if (this.stats.responseTimes.length > 100) {
        this.stats.responseTimes.shift();
      }
    }
    
    // Track by endpoint
    const endpoint = `${req.method} ${req.path}`;
    this.stats.requestsByEndpoint.set(
      endpoint, 
      (this.stats.requestsByEndpoint.get(endpoint) || 0) + 1
    );
    
    // Track by IP
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    this.stats.requestsByIP.set(
      ip, 
      (this.stats.requestsByIP.get(ip) || 0) + 1
    );
  }

  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const requestsPerMinute = Math.round((this.stats.totalRequests / (uptime / 1000)) * 60);
    
    // Calculate average response time
    const avgResponseTime = this.stats.responseTimes.length > 0
      ? Math.round(this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length)
      : 0;
    
    // Calculate current requests per minute (last 60 seconds)
    const currentRPM = this.stats.requestTimestamps.length;
    
    return {
      totalRequests: this.stats.totalRequests,
      blockedRequests: this.stats.blockedRequests,
      allowedRequests: this.stats.allowedRequests,
      startTime: this.stats.startTime,
      uptime,
      requestsPerMinute,
      currentRequestsPerMinute: currentRPM,
      peakRequestsPerMinute: this.stats.peakRequestsPerMinute,
      averageResponseTime: avgResponseTime,
      blockRate: this.stats.totalRequests > 0 
        ? Math.round((this.stats.blockedRequests / this.stats.totalRequests) * 100) 
        : 0,
      successRate: this.stats.totalRequests > 0 
        ? Math.round((this.stats.allowedRequests / this.stats.totalRequests) * 100) 
        : 0,
      topEndpoints: Array.from(this.stats.requestsByEndpoint.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
      topIPs: Array.from(this.stats.requestsByIP.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),
    };
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
      startTime: Date.now(),
      requestsByEndpoint: new Map(),
      requestsByIP: new Map(),
      responseTimes: [],
      peakRequestsPerMinute: 0,
      requestTimestamps: [],
    };
  }
}
