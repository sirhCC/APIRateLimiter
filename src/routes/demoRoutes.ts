import { Express, Request, Response } from 'express';
import { RedisClient } from '../utils/redis';
import { SimpleStats } from '../utils/stats';
import { createOptimizedRateLimiter, RateLimitPresets } from '../middleware/optimizedRateLimiter';

export interface RegisterDemoRoutesOptions {
  redis: RedisClient;
  stats: SimpleStats;
}

export function registerDemoRoutes(app: Express, options: RegisterDemoRoutesOptions): void {
  const { redis, stats } = options;

  app.get('/test', (req: Request, res: Response) => {
    res.json({
      message: 'Test endpoint with JWT-aware rate limiting',
      timestamp: new Date().toISOString(),
      user: req.user || null,
      rateLimitInfo: {
        hasApiKey: !!req.apiKey,
        hasJWT: !!req.user,
        rateLimitApplied: req.apiKey ? 'API Key' : req.user ? 'JWT Role' : 'IP-based',
      },
    });
  });

  app.get('/demo/strict', createOptimizedRateLimiter(redis, RateLimitPresets.strict).middleware(), (req, res) => {
    res.json({ message: 'Strict rate limiting (10 req/min) - sliding window', timestamp: new Date().toISOString() });
  });

  app.get('/demo/moderate', createOptimizedRateLimiter(redis, RateLimitPresets.moderate).middleware(), (req, res) => {
    res.json({ message: 'Moderate rate limiting (100 req/min) - token bucket with burst', timestamp: new Date().toISOString() });
  });

  app.get('/demo/heavy', createOptimizedRateLimiter(redis, RateLimitPresets.heavy).middleware(), (req, res) => {
    res.json({ message: 'Heavy operation rate limiting (5 req/min) - fixed window', timestamp: new Date().toISOString() });
  });

  app.get('/demo/interactive', createOptimizedRateLimiter(redis, RateLimitPresets.interactive).middleware(), (req, res) => {
    res.json({ message: 'Interactive rate limiting (200 req/min) - token bucket with large burst', timestamp: new Date().toISOString() });
  });

  app.post('/stats/reset', (req, res) => {
    stats.reset();
    res.json({ message: 'Statistics reset successfully' });
  });
}
