import { RedisClient } from '../../src/utils/redis';
import { renderMetrics } from '../../src/utils/metrics';

describe('Redis circuit breaker', () => {
  it('opens after threshold failures and exposes metrics, then resets after cooldown window', async () => {
    const redis = new RedisClient({ host: '127.0.0.1', port: 6399, enabled: true }); // Intentionally unreachable
    // Force failures to trip breaker (threshold = 5)
    for (let i = 0; i < 5; i++) {
      (redis as any).registerFailure('test');
    }
    const statusOpen = (redis as any).getStatus();
    expect(statusOpen.circuitBreakerOpen).toBe(true);
    expect(statusOpen.consecutiveFailures).toBeGreaterThanOrEqual(5);

    const metricsAfterOpen = await renderMetrics();
    expect(metricsAfterOpen).toContain('api_rl_redis_circuit_breaker_open 1');
    expect(metricsAfterOpen).toContain('api_rl_redis_fallback_total{reason="circuit_open"} 1');

    // Simulate time passing beyond reset window (30s)
    (redis as any).lastFailureTime = Date.now() - 31000;
    // Trigger health check path which evaluates breaker reset logic
    (redis as any).isHealthy();
    const statusReset = (redis as any).getStatus();
    expect(statusReset.circuitBreakerOpen).toBe(false);

    const metricsAfterReset = await renderMetrics();
    expect(metricsAfterReset).toContain('api_rl_redis_circuit_breaker_open 0');
  });
});
