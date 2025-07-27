import { SimpleStats } from '../utils/stats';

export function createRateLimitLogger(stats?: SimpleStats) {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const originalSend = res.send;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    res.send = function(data: any) {
      const responseTime = Date.now() - startTime;
      
      // Log rate limiting decisions
      const rateLimited = res.statusCode === 429;
      const remaining = res.get('X-RateLimit-Remaining');
      const rule = res.get('X-RateLimit-Rule');
      
      if (rateLimited) {
        console.log(`🚫 RATE LIMITED: ${req.method} ${req.path} - IP: ${clientIP} - Rule: ${rule || 'default'} - ${responseTime}ms`);
      } else if (remaining && parseInt(remaining) < 10) {
        console.log(`⚠️  LOW REMAINING: ${req.method} ${req.path} - IP: ${clientIP} - Remaining: ${remaining} - Rule: ${rule || 'default'} - ${responseTime}ms`);
      }
      
      // Track response time in stats if available
      if (stats && !rateLimited) {
        stats.recordRequest(req, false, responseTime);
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}
