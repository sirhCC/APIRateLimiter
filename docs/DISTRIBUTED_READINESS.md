# Distributed Readiness

This document is the honest state of distributed mode today.

## Current verdict

- Single-backend distributed coordination is now covered by automated tests.
- The middleware wiring and health initialization bugs that previously made distributed setup misleading have been fixed.
- Redis cluster deployment assets exist.

But:

- Redis cluster failover has not been proven with automated end-to-end runs.
- Multi-instance behavior under node loss, partitions, or clock skew is still not validated.
- The repository should still treat distributed mode as experimental beyond the shared-Redis test path.

## What is actually validated now

The automated test coverage now demonstrates:

- two separate Express app instances can share a single Redis-backed limit budget
- alternating requests across instances still exhaust one shared limit
- distributed middleware is mounted as a real Express handler
- distributed health state is initialized immediately instead of waiting for the first polling interval
- Redis connection failures trigger degraded behavior instead of silently pretending the system is healthy

## What is not validated yet

The project does not yet have proof for:

- Redis cluster failover correctness during live traffic
- behavior during network partitions between app instances and Redis nodes
- clock skew tolerance across instances
- load-balancer-driven multi-node verification against the distributed Docker stack
- benchmark evidence comparing single-node and distributed modes

## Operational position

Use the current distributed mode as:

- a reference implementation for shared Redis coordination patterns
- a development or lab feature for multi-instance experiments

Do not present it as production-proven cluster-grade distributed rate limiting yet.

## Minimum bar to upgrade this status

To move from experimental to validated, the repo still needs:

1. automated multi-instance tests that run against [docker/docker-compose.distributed.yml](docker/docker-compose.distributed.yml)
2. failure testing for Redis node loss and reconnect behavior during active traffic
3. explicit clock-skew tests and documented assumptions
4. checked-in benchmark artifacts for distributed-mode runs
5. README language updated only after those tests are green and repeatable