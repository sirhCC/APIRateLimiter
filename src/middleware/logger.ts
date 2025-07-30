import { SimpleStats } from '../utils/stats';
import { log } from '../utils/logger';

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
        log.performance('Request rate limited', {
          method: req.method,
          endpoint: req.path,
          ip: clientIP,
          responseTime,
          remaining: remaining ? parseInt(remaining) : 0,
          metadata: { rule: rule || 'default' }
        });
      } else if (remaining && parseInt(remaining) < 10) {
        log.performance('Low rate limit remaining', {
          method: req.method,
          endpoint: req.path,
          ip: clientIP,
          responseTime,
          remaining: parseInt(remaining),
          metadata: { rule: rule || 'default' }
        });
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
