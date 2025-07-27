export class SimpleStats {
  private stats = {
    totalRequests: 0,
    blockedRequests: 0,
    allowedRequests: 0,
    startTime: Date.now(),
    requestsByEndpoint: new Map<string, number>(),
    requestsByIP: new Map<string, number>(),
  };

  recordRequest(req: any, blocked: boolean) {
    this.stats.totalRequests++;
    
    if (blocked) {
      this.stats.blockedRequests++;
    } else {
      this.stats.allowedRequests++;
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
    
    return {
      totalRequests: this.stats.totalRequests,
      blockedRequests: this.stats.blockedRequests,
      allowedRequests: this.stats.allowedRequests,
      startTime: this.stats.startTime,
      uptime,
      requestsPerMinute,
      blockRate: this.stats.totalRequests > 0 
        ? Math.round((this.stats.blockedRequests / this.stats.totalRequests) * 100) 
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
    };
  }
}
