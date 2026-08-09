# ADR-0007: Testing Layer Boundaries

## Status

Accepted

## Context

HWIS has Convex tests, browser component tests, and Playwright E2E tests. As the application grew, some simple page structure and CRUD behavior was verified at multiple layers, increasing runtime and maintenance without adding distinct confidence.

## Decision

Use each testing layer for the contract it can verify most directly:

- Convex tests cover business rules, authorization, persistence, cascades, backups, and migrations.
- Component and route tests cover meaningful client-side state, filtering, dialogs, loading/error states, and accessibility behavior that does not require the real backend.
- E2E tests cover representative user journeys and high-risk integration behavior across the real UI and Convex backend.

Keep both lower-level and E2E tests only when they prove different contracts. Avoid duplicating simple page-structure assertions and complete CRUD cycles across layers.

The first cleanup pass is conservative: prototype E2E specs are removed from active discovery, while uncertain behavior coverage is retained for later review. Pre-commit runs a blocking lint/format gate; the full E2E suite remains an explicit or CI check rather than a default commit hook.

## Consequences

- Business-rule regressions remain covered by fast, deterministic tests.
- Critical integration paths remain covered without making every UI assertion an E2E test.
- Test count and maintenance cost should decrease gradually through measured, reviewable consolidation.
- Future test additions should state which layer-specific contract they protect.
