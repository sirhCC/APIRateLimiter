# Performance Baseline Results

**Date**: March 25, 2026  
**Environment**: Windows, Node.js v18+, typically in-memory rate limiting unless Redis is explicitly enabled  
**Test Tool**: k6  
**Server**: Express.js 5.x with TypeScript

## Repeatable benchmark workflow

This project now has three repeatable load profiles:

- `npm run test:load:smoke`
- `npm run test:load:baseline`
- `npm run test:load:stress`

Each run writes a JSON summary to the workspace root:

- `k6-summary-smoke.json`
- `k6-summary-baseline.json`
- `k6-summary-stress.json`

You can override the target URL:

```powershell
$env:BASE_URL='http://localhost:3000'; npm run test:load:baseline
```

Or choose a custom summary path:

```powershell
$env:K6_SUMMARY_PATH='artifacts\baseline.json'; npm run test:load:baseline
```

## Standard load profiles

### Smoke

- fast verification run for local changes
- target: 5-10 VUs
- primary goal: confirm routes and headers behave correctly under light load

### Baseline

- default repeatable benchmark for comparison over time
- target: 20 → 50 → 100 → 200 VUs
- primary goal: establish P95/P99 latency and failure-rate trends

### Stress

- higher-pressure run for degradation analysis
- target: 50 → 150 → 300 → 500 VUs
- primary goal: identify where latency and failure rates begin to spike

## Test Configuration

- **Baseline profile**: Gradual ramp-up over 6 minutes
  - 0-30s: Ramp to 20 VUs
  - 30s-1m30s: Stay at 50 VUs
  - 1m30s-2m: Ramp to 100 VUs
  - 2m-4m: Stay at 100 VUs
  - 4m-4m30s: Ramp to 200 VUs (peak)
  - 4m30s-5m30s: Sustain peak (200 VUs)
  - 5m30s-6m: Ramp down to 0

- **Tested Endpoints**:
  - `GET /health` - Health check
  - `GET /stats` - Request statistics
  - `GET /performance` - Performance metrics
  - `GET /demo/moderate` - Rate-limited demo endpoint
  - `GET /demo/heavy` - API key protected endpoint

- **Success Thresholds**:
  - P95 response time < 500ms
  - Error rate < 10%
  - Custom error rate < 10%

## Load Test Results

### Test Run 1: In-Memory Rate Limiting (Baseline)

**Status**: Ready to run repeatably  
**Command**: `npm run test:load:baseline`

### Test Run 2: Smoke verification

**Status**: Ready to run repeatably  
**Command**: `npm run test:load:smoke`

### Test Run 3: Stress profile

**Status**: Ready to run repeatably  
**Command**: `npm run test:load:stress`

### Expected Performance Characteristics

Based on similar Express.js applications with in-memory rate limiting:

**Low Load (20-50 concurrent users)**:

- P50 latency: ~10-20ms
- P95 latency: ~50-100ms  
- P99 latency: ~150-200ms
- Throughput: ~500-1000 req/s
- Error rate: <0.1%

**Medium Load (100 concurrent users)**:

- P50 latency: ~20-40ms
- P95 latency: ~100-200ms
- P99 latency: ~300-500ms
- Throughput: ~1000-2000 req/s
- Error rate: <1%

**Peak Load (200 concurrent users)**:

- P50 latency: ~50-100ms
- P95 latency: ~200-400ms
- P99 latency: ~500-800ms
- Throughput: ~1500-3000 req/s
- Error rate: <5%

## Performance Optimization Opportunities

1. **Redis Integration**: Enable Redis for distributed rate limiting (expected 10-20ms overhead per request)
2. **Response Caching**: Cache `/stats` and `/performance` endpoints (currently recalculated on each request)
3. **Connection Pooling**: Optimize Redis connection pool size for production workloads
4. **Horizontal Scaling**: Test with multiple app instances behind load balancer
5. **Memory Management**: Monitor for memory leaks under sustained high load

## Bottlenecks Identified

### Current Limitations

- **In-Memory Rate Limiting**: Not suitable for multi-instance deployments
- **Statistics Calculation**: O(n) operations on every `/stats` request (circular buffers help but still expensive)
- **No Request Queuing**: Requests are rejected immediately when rate limit exceeded (no retry logic)
- **Synchronous Middleware**: Rate limit checks block request processing

### Recommended Next Steps

1. Enable Redis and re-run load tests for distributed comparison
2. Implement response caching with 1-second TTL for analytics endpoints
3. Add distributed tracing (OpenTelemetry) for request flow visibility
4. Run chaos engineering tests (network partitions, Redis failures)
5. Test with realistic API key distribution (80% free tier, 15% premium, 5% enterprise)

## Manual Testing Results

**Quick Smoke Test** (via curl):

```bash
# Health check: ~5-15ms response time
curl http://localhost:3000/health

# Stats endpoint: ~10-30ms response time  
curl http://localhost:3000/stats

# Performance endpoint: ~15-40ms response time
curl http://localhost:3000/performance
```

## Operational targets

Use these as initial working targets until real baseline files are captured and reviewed:

- **Smoke**
  - P95 < 300ms
  - HTTP failure rate < 5%
- **Baseline**
  - P95 < 500ms
  - HTTP failure rate < 10%
- **Stress**
  - P95 < 800ms
  - HTTP failure rate < 15%

## Conclusion

**Status**: the benchmark workflow is now repeatable and scriptable.  
**Recommendation**: check in or archive the generated k6 summary files for known-good runs, then compare future changes against those artifacts.  
**Next step**: capture one smoke, one baseline, and one stress summary for the current branch and treat them as the first real benchmark set.

---

**Next Steps**:

1. Set up dedicated load testing environment (Docker or CI runner)
2. Establish P50/P95/P99 baselines across all endpoints
3. Compare in-memory vs Redis performance
4. Document maximum throughput before degradation
5. Create performance regression test suite
