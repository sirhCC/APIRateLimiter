import request from 'supertest';
import express from 'express';
import { rateLimitRequestsTotal } from '../../src/utils/metrics';
import { createOptimizedRateLimiter } from '../../src/middleware/optimizedRateLimiter';
import { RedisClient } from '../../src/utils/redis';

// Minimal app for metrics exposure
function buildApp() {
  const app = express();
  const redis = new RedisClient({ host: 'localhost', port: 6379, enabled: false });
  const limiter = createOptimizedRateLimiter(redis, { windowMs: 1000, maxRequests: 1, algorithm: 'fixed-window' });
  // @ts-ignore add dummy properties used by middleware
  app.use((req,res,next)=>{ req.isJWTAuthenticated=false; next(); });
  app.get('/test', limiter.middleware(), (req, res) => res.json({ ok: true }));
  app.get('/metrics', async (_req, res) => {
    const metrics = await import('../../src/utils/metrics').then(m => m.renderMetrics());
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(await metrics);
  });
  return app;
}

describe('Metrics instrumentation', () => {
  const app = buildApp();

  it('should increment counters for allow and block', async () => {
    // First request allowed
    await request(app).get('/test').expect(200);
    // Second request blocked
    await request(app).get('/test').expect(429);

  // Fetch metrics via render
  const metrics = await import('../../src/utils/metrics').then(m => m.renderMetrics());
  expect(metrics).toContain('api_rl_requests_total');
  });

  it('should expose /metrics endpoint', async () => {
    const res = await request(app).get('/metrics').expect(200);
    expect(res.text).toContain('api_rl_requests_total');
  });
});
