export interface IPFilterConfig {
  whitelist: string[]; // IPs that bypass rate limiting
  blacklist: string[]; // IPs that are blocked completely
}

export function createIPFilterMiddleware(config: IPFilterConfig) {
  return (req: any, res: any, next: any) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check blacklist first
    if (config.blacklist.includes(clientIP)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Your IP address is blocked',
        ip: clientIP
      });
    }
    
    // Add whitelist flag for rate limiter to check
    if (config.whitelist.includes(clientIP)) {
      req.isWhitelisted = true;
    }
    
    next();
  };
}
