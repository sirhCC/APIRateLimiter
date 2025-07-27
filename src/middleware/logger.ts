export function createRateLimitLogger() {
  return (req: any, res: any, next: any) => {
    const originalSend = res.send;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    res.send = function(data: any) {
      // Log rate limiting decisions
      const rateLimited = res.statusCode === 429;
      const remaining = res.get('X-RateLimit-Remaining');
      const rule = res.get('X-RateLimit-Rule');
      
      if (rateLimited) {
        console.log(`🚫 RATE LIMITED: ${req.method} ${req.path} - IP: ${clientIP} - Rule: ${rule || 'default'}`);
      } else if (remaining && parseInt(remaining) < 10) {
        console.log(`⚠️  LOW REMAINING: ${req.method} ${req.path} - IP: ${clientIP} - Remaining: ${remaining} - Rule: ${rule || 'default'}`);
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}
