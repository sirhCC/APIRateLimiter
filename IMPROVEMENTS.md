# API Rate Limiter Improvement Roadmap

Ordered from highest impact (architecture/security/stability) to lower impact (polish/documentation). Each item includes a brief rationale and proposed approach.

## 1. Critical / High Impact

1. **Redis Dependency Robustness & Health Probing**  
   - Issue: Logs show frequent fallback to in-memory when Redis not connected.  
   - Impact: Inconsistent rate limiting across distributed nodes; potential abuse window.  
   - Actions: Add readiness/liveness probes (HTTP + optional Redis PING); configurable circuit breaker retry/backoff; metrics for fallback activations.
2. **Deterministic Test Isolation for Redis & Time**  
   - Issue: Tests rely on real timing / implicit fallbacks; potential flakiness under load.  
   - Actions: Introduce a time abstraction (e.g., `NowProvider`) injectable; mock Redis with an interface to ensure algorithm determinism; add high‑load fuzz test in CI (tagged, optional).
3. **Security Hardening (Secrets & API Keys)**  
   - Issue: API key storage/validation relies on Redis only; no hashing + rotation policy docs.  
   - Actions: Hash API keys at rest (HMAC or bcrypt/argon2id); introduce key prefix + short ID pattern; add rotation endpoint & soft‑revoke (grace period).  
4. **Rate Limit Rule Engine Extensibility**  
   - Issue: Static tier configs + limited pattern matching.  
   - Actions: Implement rule priority graph + dynamic reload validation schema; support conditions (method, region, user attributes, JWT claims). Provide dry‑run mode.
5. **Observability & Metrics Export (Prometheus/OpenTelemetry)**  
   - Issue: Only internal JSON stats endpoints.  
   - Actions: Add `/metrics` Prometheus exposition OR OTLP exporter; counters for allowed/blocked per algorithm, latency histograms, Redis ops, fallback counts, API key validation failures.
6. **Backpressure & Burst Protection**  
   - Issue: Current algorithms decide allow/deny but no queueing or shed policy advisory.  
   - Actions: Optional token wait (bounded) or immediate shed with `Retry-After`; add adaptive tightening under high rejection ratio.
7. **Distributed Consistency Validation**  
   - Issue: Multi‑node correctness not automatically tested.  
   - Actions: Add integration tests with docker-compose spinning multiple app + Redis nodes; assert global limit invariants.
8. **Chaos & Failure Scenario Expansion**  
   - Issue: Basic chaos test present but narrow.  
   - Actions: Simulate partial Redis latency spikes, network partitions, clock skew; ensure graceful degradation + alert counters.

## 2. Performance & Scalability

1. **Lua Script Optimization & Versioning**  
   - Action: Bundle scripts with SHA256 version id; pre-load & warm on startup; add micro-bench harness; consider batching pipeline for multi-key queries.
2. **High Cardinality Key Strategy**  
    - Issue: Per-IP+path keys may explode for dynamic paths.  
    - Actions: Introduce path normalization (parameter tokenization) and a max key cardinality eviction policy with metrics.
3. **Adaptive Algorithm Selection**  
    - Action: Switch from sliding to token bucket automatically when traffic pattern stable; escalate to sliding when near threshold (reduce Redis writes).
4. **Prefetch / Token Refill Optimization**  
    - Action: Allow client-hinted future usage (pre-allocation) with safety caps; reduce server round trips.
5. **Batch Telemetry Flush**  
    - Action: Buffer per-request stats and flush every N ms; reduce hotspot contention.
6. **IPC / Shared Memory for Single Host Scaling**  
    - Action: For clustered Node processes, share counters via worker threads or `Atomics` + fallback to Redis only when crossing process boundary.

## 3. Reliability & Quality

1. **Stricter Type Safety & API Contracts**  
    - Action: Enable TS `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`; add zod schemas for inbound configuration and responses.
2. **Comprehensive E2E Test Suite**  
    - Action: Add tests for headers (`Retry-After`, `X-RateLimit-Policy`), rule precedence, key rotation flows, JWT + rate limit interaction.
3. **Load & Soak Testing Automation**  
    - Action: k6 scenarios for sustained (soak) + spike; produce latency SLO report; integrate into CI optional stage.
4. **Error Taxonomy & Structured Logging**  
    - Action: Standardize error codes (e.g., RL001 RedisUnavailable, AK002 KeyRevoked); machine-parsable logs (JSON lines) + sampling for high-frequency events.
5. **Configuration Validation on Startup**  
    - Action: Fail-fast with aggregated zod validation errors; expose `/config/hash` endpoint to verify runtime config drift.

## 4. Security Enhancements

1. **JWT Key Rotation & JWKS Support**  
    - Action: Support JWKS URL polling with caching & ETag; enforce `kid` rotation window.
2. **Rate Limit Evasion Detection**  
    - Action: Heuristics for User-Agent/ip churn; optional fingerprinting (hash of headers) to cluster clients.
3. **Abuse Signaling & Alert Hooks**  
    - Action: Webhook / Kafka event on threshold breach or anomaly detection (sudden burst ratio > X).
4. **Secret Management Abstraction**  
    - Action: Pluggable backends (AWS Secrets Manager, Vault) with caching + refresh TTL; already a `secretManager.ts` placeholder—finish implementation.

## 5. Developer Experience

1. **CLI Tooling**  
    - Action: Provide `bin/rlctl` for: list rules, test evaluate, generate key, simulate traffic scenario.
2. **Configuration as Code**  
    - Action: Support YAML rule bundles + hot reload diff preview; GitOps alignment.
3. **Pluggable Algorithm Interface**  
    - Action: Publish interface + example custom algorithm template; dynamic require via config.
4. **Local Dev Orchestration**  
    - Action: Single command script starting Redis (docker) + app + watch metrics dashboard.
5. **API Docs & OpenAPI Spec**  
    - Action: Generate OpenAPI for management endpoints; host Swagger UI with auth.
29. **Sample Client Libraries**  
    - Action: Publish minimal JS/Go clients demonstrating headers parsing and backoff.

## 6. Observability Polish

30. **Histogram + Percentile Export**  
    - Action: Replace custom percentile calc with HDR Histogram or native prom client for accuracy at high quantiles.
31. **Tracing**  
    - Action: OpenTelemetry spans for redis ops, algorithm decision, rule evaluation; traceparent propagation.
32. **SLO & Error Budget Tracking**  
    - Action: Define SLOs (e.g., <1% false negatives, <50ms p95 decision latency); export error budget burn.

## 7. Data & Analytics

33. **Long-Term Usage Aggregation**  
    - Action: Periodic rollups (minute->hour->day) to lower Redis memory; maybe move cold stats to time-series DB.
34. **Anomaly Detection (Baseline)**  
    - Action: Simple EWMA / z-score anomalies on request rate per key; flag suspicious surges.

## 8. Operational Concerns

35. **Graceful Shutdown & Draining**  
    - Action: Implement SIGTERM handler waiting for in-flight requests + final stats flush.
36. **Configurable Clock Skew Handling**  
    - Action: For distributed sliding window, adjust for skew via median RTT or NTP offset.
37. **Disaster Recovery Playbook**  
    - Action: Document fallback modes, manual override commands, recovery steps for Redis cluster failover.

## 9. Documentation & Examples

38. **Expanded README Scenarios**  
    - Action: Add scenario matrix (public API, partner API, internal microservice).  
39. **Performance Benchmarks Section**  
    - Action: Publish baseline QPS / latency across algorithms and hardware profile.
40. **Threat Model Document**  
    - Action: STRIDE analysis, abuse cases (credential stuffing, token spray).  
41. **Architecture Diagram Update**  
    - Action: Add data flow with Redis + optional queue/event hooks.

## 10. Minor Polish

42. **Consistent Header Casing & New Headers**  
    - Action: Provide `RateLimit-Policy` (IETF draft), ensure case consistency.
43. **ESM Build Output Option**  
    - Action: Dual build (CJS + ESM) for broader ecosystem compatibility.
44. **Package Metadata**  
    - Action: Fill `author`, add `repository`, `bugs`, `homepage` fields.
45. **Linting & Formatting**  
    - Action: Add ESLint + Prettier with pre-commit hook; CI check.
46. **Typed Logger Wrapper**  
    - Action: Add log method overloads & structured context merging.
47. **Safer Environment Variable Parsing**  
    - Action: Centralized config module with strict parsing & defaults (partly present; expand).
48. **Improve Test Naming Consistency**  
    - Action: Use Given/When/Then or descriptive scenario names.

---
## Suggested Sequencing (First 5 Sprints)

Sprint 1: Redis health probes, metrics export (basic), hashed API keys, config validation.  
Sprint 2: Rule engine upgrade, JWKS support, structured error taxonomy, OpenAPI spec.  
Sprint 3: Prometheus histograms, adaptive algorithm selection, integration multi-node tests.  
Sprint 4: Key rotation + CLI, anomaly detection baseline, chaos expansion.  
Sprint 5: Tracing, SLO/error budget, rollups + long-term aggregation.

## Key Metrics to Track Post-Implementation
- Decision latency (avg, p95, p99)
- Allow vs deny ratio per algorithm & per key tier
- Redis round trips per request (target <2) 
- Fallback activations per minute
- Unique key cardinality (ip:path, apiKey:path)
- Error rate by taxonomy code
- Token refill drift (ms)

## Acceptance Criteria Examples
- Fallback mode emits structured event within 1s and increments counter.  
- Integration test ensures 2 concurrent nodes never exceed global limit by >1 request over threshold in 10k run.  
- Key rotation endpoint returns old key valid for configurable grace window then hard revokes.

## Risks & Mitigations
- Added complexity → Mitigate via modular interfaces & contracts.  
- Performance regressions → Add micro-bench CI gate comparing baseline JSON file.  
- Over-alerting on anomalies → Progressive rollout with shadow metrics first.

---
Generated: 2025-08-08
