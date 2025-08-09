import client from 'prom-client';

// Create a global Registry
export const metricsRegistry = new client.Registry();

// Default metrics (Node.js process metrics)
if (process.env.METRICS_DEFAULTS !== 'false') {
  client.collectDefaultMetrics({ register: metricsRegistry, prefix: 'api_rl_' });
}

// Rate limit decision counter
export const rateLimitRequestsTotal = new client.Counter({
  name: 'api_rl_requests_total',
  help: 'Total rate limited requests (allowed + blocked)',
  labelNames: ['algorithm', 'outcome', 'source'] as const,
  registers: [metricsRegistry]
});

// Decision duration histogram
export const rateLimitDecisionDuration = new client.Histogram({
  name: 'api_rl_decision_duration_ms',
  help: 'Duration of rate limit decision in milliseconds',
  labelNames: ['algorithm'] as const,
  buckets: [1, 5, 10, 25, 50, 75, 100, 250, 500],
  registers: [metricsRegistry]
});

// Redis fallback counter
export const redisFallbackTotal = new client.Counter({
  name: 'api_rl_redis_fallback_total',
  help: 'Total occurrences of Redis fallback usage',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry]
});

// Redis health gauge
export const redisUp = new client.Gauge({
  name: 'api_rl_redis_up',
  help: 'Redis availability (1 = up, 0 = down)',
  registers: [metricsRegistry]
});

// Circuit breaker state gauge
export const redisCircuitBreakerOpen = new client.Gauge({
  name: 'api_rl_redis_circuit_breaker_open',
  help: 'Whether redis circuit breaker is open (1 open, 0 closed)',
  registers: [metricsRegistry]
});

export function setRedisUp(up: boolean) {
  redisUp.set(up ? 1 : 0);
}

export function setCircuitBreaker(open: boolean) {
  redisCircuitBreakerOpen.set(open ? 1 : 0);
}

export async function renderMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}
