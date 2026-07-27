# ADR-0004: E2E Test Data Tagging

## Status

Accepted

## Context

Playwright E2E tests run against a live Convex dev server. Tests create real data (students, evaluations, categories, etc.) that persist between test runs. Without a cleanup strategy, test data accumulates and interferes with later runs — duplicate key collisions, wrong result counts, flaky assertions.

Additionally, tests run in parallel across multiple Playwright workers, so cleanup must be deterministic and per-test, not global.

## Decision

Every test run creates data with a unique `e2eTag` string and cleans up by that tag after the test.

- Every data table includes an `e2eTag: v.optional(v.string())` field.
- Indexes on `e2eTag` exist on `students`, `point_categories`, `evaluations`, and `audit_logs`.
- A `cleanupByTag` Convex mutation deletes all rows matching a given tag, with cascade logic for UI-created data.
- A `dataFactory.ts` module provides helper mutations (`createStudent`, `createCategory`, `createEvaluationForStudent`) that accept and propagate `e2eTag`.
- Each test calls `cleanupByTag` in `test.afterEach` using boolean flags to track what was created.
- Tags are unique per test per worker using timestamp + random fragment.

## Consequences

- Test data is fully isolated between parallel workers and test runs.
- Deterministic teardown prevents accumulation.
- **Complex overhead**: The tagging system adds significant surface — 3 cleanup mutations with overlapping semantics, cascade logic for untagged UI-created data, boolean flags in every test, and a separate data factory module.
- **Gaps**: `house_events` lacks a `by_e2eTag` index (full table scan on cleanup). `users` has the field but no index and is unused. Three cleanup variants (`cleanupByTag`, `cleanupAllTestData`, `cleanupAllE2eTaggedData`) increase cognitive load.
