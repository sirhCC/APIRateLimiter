# TODO: Project Action Items

**Last Updated**: December 2, 2025  
**Status**: Development Phase

This document outlines concrete action items to improve the API Rate Limiter project, organized by priority and category. Unlike IMPROVEMENTS.md which focuses on strategic roadmap, this focuses on immediate, actionable tasks.

---

## 🔴 Critical Priority (Do First)

### Testing & Quality
- [ ] **Increase test coverage from 20% to 70%+**
  - [ ] Add integration tests for all rate limiting algorithms
  - [ ] Add tests for Redis failure scenarios and circuit breaker
  - [ ] Add tests for JWT and API key middleware edge cases
  - [ ] Add multi-node distributed rate limiting tests with docker-compose
  - [ ] Add tests for all validation schemas
  - **Effort**: 3-5 days | **Impact**: High | **Blocker for production**

- [ ] **Fix or remove half-implemented API key rotation feature**
  - [ ] Either complete rotation with `previousKeyHashes` grace period logic and tests
  - [ ] Or remove the rotation code until it can be properly implemented
  - [ ] Document rotation flow in API docs if keeping
  - **Effort**: 1 day | **Impact**: Medium | **Technical debt**

- [ ] **Standardize logging throughout codebase**
  - [ ] Remove all `console.log` statements from production code
  - [ ] Replace with Winston structured logging using existing log utility
  - [ ] Files to fix: `src/utils/redis.ts`, `src/utils/secretManager.ts`
  - [ ] Add log levels configuration via environment variable
  - **Effort**: 2-3 hours | **Impact**: Medium | **Code quality**

### Performance & Reliability
- [ ] **Run load tests and establish performance baselines**
  - [ ] Run k6 load test suite with increasing load (100, 1k, 10k req/s)
  - [ ] Document P50/P95/P99 latency at each load level
  - [ ] Document maximum throughput before degradation
  - [ ] Add results to `docs/PERFORMANCE.md` (create file)
  - [ ] Identify and fix performance bottlenecks
  - **Effort**: 1-2 days | **Impact**: High | **Credibility**

- [ ] **Validate distributed rate limiting in multi-node setup**
  - [ ] Create docker-compose config with 3+ app nodes + Redis
  - [ ] Test that global rate limits are enforced across all nodes
  - [ ] Test behavior under network partitions (chaos testing)
  - [ ] Test clock skew scenarios
  - [ ] Document findings in `docs/DISTRIBUTED.md`
  - **Effort**: 2-3 days | **Impact**: High | **Feature validation**

### Security
- [ ] **Complete API key hashing implementation**
  - [ ] Verify all API keys are hashed before storage
  - [ ] Add migration script for any plaintext keys
  - [ ] Add key prefix patterns for easy identification
  - [ ] Add audit logging for key operations
  - [ ] Document security model in README
  - **Effort**: 1 day | **Impact**: High | **Security hardening**

- [ ] **Security audit checklist**
  - [ ] Review all authentication/authorization paths
  - [ ] Validate input sanitization on all endpoints
  - [ ] Check for timing attack vulnerabilities in key comparison
  - [ ] Review CORS configuration for production scenarios
  - [ ] Check for information leakage in error messages
  - [ ] Review rate limit bypass scenarios
  - **Effort**: 1-2 days | **Impact**: High | **Security hardening**

---

## 🟡 High Priority (Do Soon)

### Code Quality
- [ ] **Fix the TODO in production code**
  - [ ] `src/index.ts:771` - Fix endpoint-specific performance stats route
  - [ ] Either implement properly or remove the commented code
  - **Effort**: 1 hour | **Impact**: Low | **Code cleanliness**

- [ ] **Add comprehensive error handling**
  - [ ] Audit all async functions for proper try-catch
  - [ ] Add error boundaries for all middleware
  - [ ] Standardize error response format across all endpoints
  - [ ] Add error code taxonomy (RL001, AK002, etc.)
  - [ ] Document error codes in API reference
  - **Effort**: 1-2 days | **Impact**: Medium | **Reliability**

- [ ] **Improve TypeScript strictness**
  - [ ] Enable `strictNullChecks` in tsconfig.json
  - [ ] Enable `noImplicitAny` everywhere
  - [ ] Fix all resulting type errors
  - [ ] Enable `exactOptionalPropertyTypes`
  - **Effort**: 2-3 days | **Impact**: Medium | **Code quality**

### Features
- [ ] **Complete API key usage analytics**
  - [ ] Add endpoint to view key usage over time
  - [ ] Add quota warning notifications
  - [ ] Add usage graphs to dashboard
  - [ ] Track usage by endpoint/method
  - **Effort**: 2 days | **Impact**: Medium | **Feature completion**

- [ ] **Add proper health check dependencies**
  - [ ] Health check should verify Redis connectivity (already done)
  - [ ] Add database health checks if/when DB is added
  - [ ] Add downstream service checks (configurable)
  - [ ] Return degraded status when non-critical deps fail
  - **Effort**: 1 day | **Impact**: Medium | **Observability**

### Documentation
- [ ] **Create performance benchmarks document**
  - [ ] Create `docs/PERFORMANCE.md`
  - [ ] Document hardware/environment used for testing
  - [ ] Include latency distributions (P50/P95/P99)
  - [ ] Include throughput measurements
  - [ ] Include resource utilization (CPU, memory, Redis)
  - **Effort**: 1 day (after load testing) | **Impact**: High | **Documentation**

- [ ] **Create distributed deployment guide**
  - [ ] Create `docs/DISTRIBUTED.md`
  - [ ] Document multi-node setup and configuration
  - [ ] Document Redis cluster/sentinel setup
  - [ ] Document known limitations and edge cases
  - [ ] Add troubleshooting section
  - **Effort**: 1 day | **Impact**: Medium | **Documentation**

- [ ] **Add API endpoint documentation**
  - [ ] Create OpenAPI/Swagger spec
  - [ ] Document all request/response schemas
  - [ ] Document all error codes and responses
  - [ ] Add example requests/responses
  - [ ] Host Swagger UI at `/api-docs`
  - **Effort**: 2-3 days | **Impact**: High | **Developer experience**

---

## 🟢 Medium Priority (Nice to Have)

### Performance
- [ ] **Optimize Redis Lua scripts**
  - [ ] Add SHA versioning for scripts
  - [ ] Pre-load scripts on startup
  - [ ] Add micro-benchmarks for script performance
  - [ ] Consider batching for multi-key operations
  - **Effort**: 2 days | **Impact**: Medium | **Performance**

- [ ] **Implement adaptive algorithm selection**
  - [ ] Add heuristics to auto-switch between algorithms
  - [ ] Use fixed window for stable traffic
  - [ ] Use token bucket for bursty traffic
  - [ ] Use sliding window near threshold
  - [ ] Make configurable per rule
  - **Effort**: 3 days | **Impact**: Low | **Advanced feature**

- [ ] **Add connection pooling optimizations**
  - [ ] Review IORedis connection pool settings
  - [ ] Add metrics for pool utilization
  - [ ] Tune pool size based on load testing
  - **Effort**: 1 day | **Impact**: Low | **Performance**

### Features
- [ ] **Add rate limit rule priority engine**
  - [ ] Implement rule priority graph
  - [ ] Add conflict detection for overlapping rules
  - [ ] Add dry-run mode for testing rules
  - [ ] Add rule validation on startup
  - [ ] Support dynamic rule reload without restart
  - **Effort**: 3-4 days | **Impact**: Medium | **Feature enhancement**

- [ ] **Add JWT key rotation support**
  - [ ] Support JWKS URL polling
  - [ ] Add caching with ETag support
  - [ ] Enforce `kid` rotation window
  - [ ] Add rotation documentation
  - **Effort**: 2-3 days | **Impact**: Medium | **Security feature**

- [ ] **Add rate limit evasion detection**
  - [ ] Track User-Agent/IP churn patterns
  - [ ] Add optional fingerprinting (header hashing)
  - [ ] Add anomaly detection (burst ratio thresholds)
  - [ ] Add webhook/event notifications
  - **Effort**: 3-4 days | **Impact**: Low | **Advanced security**

- [ ] **Add backpressure handling**
  - [ ] Implement optional token wait (bounded)
  - [ ] Add immediate shed with `Retry-After` header
  - [ ] Add adaptive tightening under high rejection
  - [ ] Document queuing strategies
  - **Effort**: 2-3 days | **Impact**: Low | **Advanced feature**

### Code Quality
- [ ] **Extract configuration to separate module**
  - [ ] Already started with `utils/config.ts`
  - [ ] Move all remaining env parsing to config module
  - [ ] Add comprehensive Zod schemas for all config
  - [ ] Add config validation on startup with detailed errors
  - **Effort**: 1-2 days | **Impact**: Medium | **Code organization**

- [ ] **Add request ID tracing**
  - [ ] Generate unique request ID for each request
  - [ ] Include in all log messages
  - [ ] Return in response headers
  - [ ] Support X-Request-ID passthrough
  - **Effort**: 1 day | **Impact**: Medium | **Observability**

### Testing
- [ ] **Add chaos engineering tests**
  - [ ] Expand existing chaos tests in `tests/chaos-engineering.test.ts`
  - [ ] Add Redis latency spike simulation
  - [ ] Add network partition simulation
  - [ ] Add clock skew simulation
  - [ ] Add memory pressure tests
  - **Effort**: 2-3 days | **Impact**: Low | **Advanced testing**

- [ ] **Add E2E test suite**
  - [ ] Test complete user flows (API key creation → usage → expiry)
  - [ ] Test JWT authentication flows
  - [ ] Test rate limit enforcement across algorithms
  - [ ] Test header validation (`Retry-After`, `X-RateLimit-*`)
  - **Effort**: 2-3 days | **Impact**: Medium | **Quality assurance**

### Documentation
- [ ] **Add architecture diagrams**
  - [ ] Create system architecture diagram
  - [ ] Create data flow diagram
  - [ ] Create rate limiting algorithm flowcharts
  - [ ] Create deployment architecture diagrams
  - [ ] Add to `docs/ARCHITECTURE.md`
  - **Effort**: 1-2 days | **Impact**: Medium | **Documentation**

- [ ] **Create troubleshooting guide**
  - [ ] Create `docs/TROUBLESHOOTING.md`
  - [ ] Common Redis connection issues
  - [ ] Rate limit not working scenarios
  - [ ] Performance degradation debugging
  - [ ] Memory leak investigation
  - **Effort**: 1 day | **Impact**: Low | **Support**

---

## 🔵 Low Priority (Future Enhancements)

### Features
- [ ] **Add GraphQL support**
  - [ ] GraphQL endpoint with schema
  - [ ] Query-based rate limiting
  - [ ] Complexity-based rate limiting
  - **Effort**: 5-7 days | **Impact**: Low | **New feature**

- [ ] **Add WebSocket support**
  - [ ] WebSocket connection limiting
  - [ ] Message rate limiting
  - [ ] Real-time stats streaming
  - **Effort**: 3-4 days | **Impact**: Low | **New feature**

- [ ] **Add geographic filtering**
  - [ ] IP geolocation integration
  - [ ] Country-based allow/deny lists
  - [ ] Regional rate limit tiers
  - **Effort**: 2-3 days | **Impact**: Low | **Feature enhancement**

- [ ] **Add secret management integration**
  - [ ] AWS Secrets Manager integration
  - [ ] HashiCorp Vault integration
  - [ ] Azure Key Vault integration
  - [ ] Pluggable backend system
  - **Effort**: 3-5 days | **Impact**: Low | **Enterprise feature**

### Performance
- [ ] **Add IPC/shared memory for single host scaling**
  - [ ] Worker thread shared counters
  - [ ] SharedArrayBuffer with Atomics
  - [ ] Fallback to Redis for cross-host
  - **Effort**: 5-7 days | **Impact**: Low | **Advanced optimization**

- [ ] **Add telemetry batching**
  - [ ] Buffer per-request stats
  - [ ] Flush every N milliseconds
  - [ ] Reduce hotspot contention
  - **Effort**: 2-3 days | **Impact**: Low | **Performance**

### Developer Experience
- [ ] **Add CLI tool**
  - [ ] Key generation and management
  - [ ] Rule management
  - [ ] Stats querying
  - [ ] Health checking
  - **Effort**: 3-4 days | **Impact**: Low | **Developer tool**

- [ ] **Add client SDKs**
  - [ ] Node.js client SDK
  - [ ] Python client SDK
  - [ ] Go client SDK
  - [ ] HTTP client examples
  - **Effort**: 1-2 weeks | **Impact**: Low | **Ecosystem**

### Infrastructure
- [ ] **Add Grafana dashboards**
  - [ ] Pre-built dashboard JSON
  - [ ] Prometheus data source config
  - [ ] Key metrics visualization
  - [ ] Alert rule templates
  - **Effort**: 2-3 days | **Impact**: Low | **Observability**

- [ ] **Add Terraform modules**
  - [ ] AWS deployment module
  - [ ] GCP deployment module
  - [ ] Azure deployment module
  - **Effort**: 5-7 days | **Impact**: Low | **IaC**

---

## 📋 Quick Wins (< 2 hours each)

These are small tasks that provide immediate value:

- [ ] Add `.editorconfig` for consistent formatting
- [ ] Add GitHub issue templates
- [ ] Add pull request template
- [ ] Add `CHANGELOG.md`
- [ ] Add code of conduct
- [ ] Improve error messages with actionable suggestions
- [ ] Add environment variable validation error messages
- [ ] Add health check endpoint documentation
- [ ] Add metrics endpoint documentation to README
- [ ] Create `docs/` README index
- [ ] Add FAQ section to main README
- [ ] Add "Why this project?" section to README
- [ ] Add comparison with alternatives (express-rate-limit, etc.)
- [ ] Add badges for Node.js version, License, etc.
- [ ] Create GitHub Actions workflow for CI
- [ ] Add dependency update automation (Dependabot)
- [ ] Add security vulnerability scanning

---

## 🎯 Milestone-Based Roadmap

### Milestone 1: Production-Ready Foundation (2-3 weeks)
**Goal**: Make the project genuinely production-ready
- All Critical Priority items
- Core High Priority testing and documentation items
- Load testing and performance baselines
- Security audit completion

### Milestone 2: Feature Complete (3-4 weeks)
**Goal**: Complete all partially implemented features
- All High Priority items
- API key analytics completion
- OpenAPI documentation
- Distributed deployment validation

### Milestone 3: Polish & Optimization (2-3 weeks)
**Goal**: Production hardening and optimization
- Medium Priority performance items
- Advanced features (adaptive algorithms, evasion detection)
- Comprehensive E2E testing
- Architecture documentation

### Milestone 4: Ecosystem & DX (Ongoing)
**Goal**: Build developer ecosystem
- Low Priority features as needed
- Client SDKs
- CLI tooling
- Community building

---

## 📊 Progress Tracking

**Overall Completion**: 0/150+ tasks

### By Category:
- **Testing & Quality**: 0/15 tasks
- **Performance**: 0/10 tasks
- **Security**: 0/5 tasks
- **Features**: 0/12 tasks
- **Documentation**: 0/8 tasks
- **Code Quality**: 0/8 tasks
- **Infrastructure**: 0/5 tasks
- **Quick Wins**: 0/17 tasks

### By Priority:
- **🔴 Critical**: 0/8 tasks
- **🟡 High**: 0/12 tasks
- **🟢 Medium**: 0/20 tasks
- **🔵 Low**: 0/15 tasks
- **⚡ Quick Wins**: 0/17 tasks

---

## 💡 How to Use This Document

1. **Start with Critical Priority** - These are blockers for production use
2. **Track progress** - Check off items as you complete them
3. **Update estimates** - Adjust effort estimates based on actual time
4. **Add new items** - As issues are discovered, add them in appropriate priority
5. **Review regularly** - Update this document weekly during active development
6. **Link to issues** - Create GitHub issues for major tasks and link them here

---

## 🔗 Related Documents

- [IMPROVEMENTS.md](./IMPROVEMENTS.md) - Strategic improvement roadmap
- [README.md](./README.md) - Project overview and documentation
- [docs/TEST_RESULTS.md](./docs/TEST_RESULTS.md) - Current test status
- [STRUCTURE.md](./STRUCTURE.md) - Project structure overview
