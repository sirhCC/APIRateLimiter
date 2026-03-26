# Next Phase Priorities for API Rate Limiter

This is the blunt version of what should happen next.

The project is in a much better place than when the first improvement list was written. The biggest problems are no longer basic structure or inconsistent errors. The next problems are about **credibility**, **proof**, and **keeping the repo honest**.

## What is still true right now

- The codebase is cleaner and safer than before.
- The app-level test story is much better.
- Config, error handling, demo isolation, and API key governance are all materially improved.

But:

- distributed mode is still not truly proven
- docs are drifting from reality
- some core files still do too much
- performance tooling exists, but baseline evidence is still not checked in
- the repo still looks more production-ready than it has actually been proven to be

That is the next gap to close.

---

## 1. Prove distributed mode or stop selling it so hard

**Priority:** Critical  
**Blunt take:** The project advertises distributed capability more confidently than it has earned.

### Why this matters

The hardest problem in this project is not single-node rate limiting anymore. It is whether limits stay correct across nodes, failures, and timing edge cases. Until that is tested properly, distributed mode is still partly a claim.

### What to do next

- add multi-node automated tests using the distributed docker setup
- test cross-node enforcement with 2-3 app instances
- test Redis outages and reconnects during live traffic
- test clock skew assumptions explicitly
- publish a short distributed readiness document with known guarantees and non-guarantees

### If this is not done

Then distributed mode should be treated as experimental in the docs.

---

## 2. Fix documentation drift before it becomes a trust problem

**Priority:** Critical  
**Blunt take:** Parts of the README and TODOs are stale enough to mislead people.

### What is drifting

- README still describes old project state and old limitations
- README test counts and coverage claims are stale
- TODO.md still contains items that are already done and misses new reality
- the docs still undersell some completed hardening and oversell some unfinished areas

### What to do next

- rewrite the project status section in [README.md](README.md)
- update test counts, coverage numbers, and current capabilities
- mark distributed mode as validated or experimental based on real results
- either refresh [TODO.md](TODO.md) or replace it with a tighter execution tracker
- add a short “what is production-ready vs what is still reference/demo quality” section

### Why this matters

Bad docs are not cosmetic. They make the repo less trustworthy.

---

## 3. Split app construction from process startup

**Priority:** High  
**Blunt take:** [src/index.ts](src/index.ts) is better, but it is still doing too much.

### What still lives there

- app construction
- middleware wiring
- route registration
- server startup
- signal handling
- performance cleanup startup

### What to do next

- create a `createApp()` path that only builds the Express app
- move `listen()` and signal wiring to a thin runtime bootstrap
- make tests import the app factory instead of full startup behavior
- make background startup tasks opt-in and explicit

### Payoff

- cleaner architecture
- easier testing
- less startup side effect risk
- clearer separation between library behavior and runtime behavior

---

## 4. Stop relying on “looks production-ready” and add proof-level integration coverage

**Priority:** High  
**Blunt take:** The unit story is solid. The proof story is still incomplete.

### Missing proof areas

- end-to-end API key lifecycle through HTTP
- distributed coordination behavior
- Redis-backed algorithm behavior under real concurrency
- production-like startup validation paths
- auth + rate-limit precedence under more realistic scenarios

### What to do next

- add route-level integration tests for API key create/list/get/rotate/revoke/usage flows
- add Redis-backed integration runs for token bucket, sliding window, and fixed window
- add at least one full-path E2E flow covering login → key create → usage → rotation → revocation
- separate pure unit, app unit, integration, and distributed test lanes clearly

---

## 5. Update TypeScript/compiler hygiene before it becomes annoying debt

**Priority:** High  
**Blunt take:** There is at least one compiler config problem already warning about future breakage.

### Known issue

- [tsconfig.json](tsconfig.json) still uses deprecated `moduleResolution: node`

### What to do next

- update deprecated TypeScript config options
- tighten strictness where practical
- remove unnecessary `any` edges from route/service boundaries
- make compiler config future-safe instead of waiting for TS upgrades to break things

### Why this matters

This is cheap to fix now and annoying to fix later.

---

## 6. Finish the route-to-service extraction instead of stopping halfway

**Priority:** Medium-High  
**Blunt take:** The extraction work is good, but it is incomplete.

### Current state

- auth and API key routes are cleaner
- business logic has started moving into services
- system and rule paths still mix transport concerns with behavior in places

### What to do next

- extract more handler/service logic from route modules
- reduce response shaping duplication
- standardize serialization helpers for route responses
- keep route files boring and predictable

### Goal

Routes should read like HTTP wiring, not mini applications.

---

## 7. Capture real benchmark artifacts, not just tooling

**Priority:** Medium-High  
**Blunt take:** The load testing workflow is now decent. The actual baseline evidence still needs to be captured.

### What to do next

- run smoke, baseline, and stress profiles against the current branch
- save and review the generated summaries
- publish actual measured numbers in [docs/PERFORMANCE.md](docs/PERFORMANCE.md)
- compare in-memory versus Redis-enabled results
- record expected degradation thresholds

### Why this matters

Until real numbers are committed or archived, the benchmark workflow is infrastructure, not proof.

---

## 8. Clean up security narrative and remaining rough edges

**Priority:** Medium  
**Blunt take:** Security is much improved, but the messaging and edge handling should be tighter.

### What to do next

- document the actual API key security model clearly
- document rotation, expiry, and revocation behavior clearly
- audit remaining information leakage in error messages and headers
- review whether all admin-only routes are protected the same way
- make sure demo-only behavior is clearly labeled in docs and UI

---

## 9. Decide what this repo is: reference app, production starter, or product core

**Priority:** Medium  
**Blunt take:** The repo is straddling multiple identities.

### Current tension

- it has demo endpoints
- it has production hardening
- it has learning-oriented examples
- it has claims that sound product-grade

### What to do next

Choose one of these and write the repo around it:

1. **Reference implementation**
2. **Production starter template**
3. **Internal platform service base**

If it stays all three at once, it will keep confusing users.

---

## 10. Prune stale execution docs and replace them with one truthful tracker

**Priority:** Medium  
**Blunt take:** There are too many planning/status surfaces drifting at different speeds.

### What to do next

- consolidate roadmap/status docs
- remove or rewrite stale sections in [TODO.md](TODO.md), [README.md](README.md), and other improvement docs
- keep one current “now / next / later” tracker
- stop accumulating historical plans that no longer match the codebase

---

## Recommended order from here

1. Prove distributed mode
2. Fix README/TODO/doc drift
3. Split app factory from startup
4. Add deeper integration/E2E proof
5. Fix TypeScript config debt
6. Finish service extraction
7. Capture real benchmark artifacts

---

## Short version

The project no longer mainly needs cleanup.

It needs **evidence, clarity, and honesty**.

If the next phase does not prove distributed behavior and fix documentation drift, the repo will start looking better than it really is. That is the real risk now.