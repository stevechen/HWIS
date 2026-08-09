# ADR-0004: E2E Test Data Tagging

## Status

Accepted

## Context

Playwright E2E tests run against a live Convex dev server. Tests create real data (students, evaluations, categories, etc.) that persist between test runs. Without a cleanup strategy, test data accumulates and interferes with later runs — duplicate key collisions, wrong result counts, flaky assertions.

Additionally, tests run in parallel across multiple Playwright workers, so cleanup must be deterministic and per-test, not global.

## Decision

Every test run creates data with a unique `e2eTag` string and cleans up by that tag after the test. The
tag is the ownership key: ordinary teardown may remove tagged rows, plus untagged dependents that
reference a tagged parent, but it must not perform global deletion.

- Every data table includes an `e2eTag: v.optional(v.string())` field.
- Indexes on `e2eTag` exist on `students`, `point_categories`, `evaluations`, and `audit_logs`.
- A `testLifecycle` module provides the per-tag teardown interface and owns cascade ordering, retry, and
  verification behavior. The underlying mutation is `teardownByTag`.
- A `dataFactory.ts` module provides helper mutations (`createStudent`, `createCategory`, `createEvaluationForStudent`) that accept and propagate `e2eTag`.
- Each test calls the per-tag lifecycle operation in `test.afterEach` using boolean flags to track what was created.
- Tags are unique per test per worker using timestamp + random fragment.
- Test-created classes carry an optional `e2eTag`; production and baseline classes remain untagged.
- Global tagged sweeps, global house-event deletion, and test-user cleanup are recovery-only operations
  exposed through a separate recovery entry point for setup and explicit cleanup jobs.
- Teardown failures are re-thrown and fail the test or cleanup job; they are not silently swallowed.

## Consequences

- Test data is fully isolated between parallel workers and test runs.
- Deterministic teardown prevents accumulation.
- **Complex overhead**: The lifecycle module centralizes cascade logic, retry, and verification, while tests retain explicit per-tag ownership.
- **Recovery tradeoff**: Global recovery operations remain intentionally destructive, so they are isolated from ordinary test helpers and must not run during parallel test execution.
