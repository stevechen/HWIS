# ADR-0021: Quota-first Convex function design

## Status

Accepted

## Context

This project runs on the Convex free tier (2,000 GB-hours / 100 GB of database
storage / 25,000 read units / 10,000 write units per month). The leaderboard
boards stay open all day on classroom displays, so any query they touch is
invoked on every page load _and_ re-runs on every reactive dependency change.
ADR-0019 and ADR-0020 fixed a class of regressions (full-table scans on every
board load) after the free quota was exceeded.

A project-wide, durable rule is needed so quota cost is considered at design
time for every new Convex function or modification, not after a bill spike.

## Decision

Every new or modified Convex **query** or **mutation** must pass a
**Free-Quota Impact Check** before merge (template in `docs/adr/0021` §Review
checklist). The checklist lives in the PR template (`.github/PULL_REQUEST_TEMPLATE.md`)
so the review gate is automatic.

Design heuristics for the common cases:

1. **Full-table scans are banned from public or frequently-subscribed queries.**
   `ctx.db.query(X).collect()` is allowed only in admin-only paths or cron jobs
   with a documented reason. Prefer `.take(N)` under an index.
2. **Batch fan-in.** N per-row lookups in a loop → 1 batch read via
   `ctx.db.batch` (or `Promise.all` on `ctx.db.get`), then in-memory join.
3. **Event-driven over polling.** A UI that needs fresh data on write
   subscribes to an aggregated value (snapshot/counter row) refreshed by an
   evaluation-triggered mutation, not by polling a compute-heavy query on an
   interval. Use `ctx.scheduler` to debounce overlapping triggers.
4. **Read only what you show.** If the UI shows 10 items, `.take(10)` under an
   index, never the whole table. If you need a count, maintain a counter row.
5. **Write-side amplification is free to pay once.** A mutation that patches
   3 tiny rows by delta (a counter aggregate) is cheaper than a query that
   re-scans thousands of rows on every subscribe/refetch. Prefer writes to
   reads when the read is repeated.

## Conventions

- New functions that touch high-volume tables (`evaluations`, `audit_logs`,
  `users`) must document, in a leading comment, their read/write unit cost
  formula (e.g. `// cost: 1 indexed take + 1 batch get of N docs`).
- Public queries subscribed to by a long-lived page must have a
  `Free-Quota Impact` line in their JSDoc-style comment.
- Admin-only paths (`requireAdminForSensitiveOperation`) get a free pass on
  scans — admins tolerate slower loads and rarely refresh.

## Enforcement

- The PR template (`.github/PULL_REQUEST_TEMPLATE.md`) embeds the checklist;
  PR authors must fill it for any change to `src/convex/`.
- Reviewers gate merges on a "Free-Quota Impact Check" pass/fail. (A follow-up
  ADR can codify the `.collect()`-in-public-path anti-pattern as a custom
  eslint rule if it recurs.)

## Review checklist (enforced at PR time)

```
### Free-Quota Impact Check
- [ ] Query: no full-table `.collect()/.scan()` (`.first()`/`.take(N)` OK).
      Mutation: no loop of individual writes (`.batch`/`.insert` array OK).
- [ ] Query called from a TV/leaderboard/public page? → must read ≤ O(1)–O(10)
      docs, not O(table size).
- [ ] Mutation touches a high-volume table? → describe read+write unit cost.
- [ ] If this needs to be fresh on a schedule, prefer event-driven refresh
      (mutation on write) over a recurring query.
- [ ] New `leaderboard_*`/`settings` doc writes stay small (move large blobs —
      screenshots, generated images — to a dedicated table, not a subscribed row).
```

## Consequences

- Every PR touching `src/convex/` must fill the checklist; CI blocks merge on
  missing checklists. Linters (`eslint`) enforce the `.collect()`-in-public-path
  pattern mechanically where feasible.
- Engineers default to the event-driven + counter-row pattern instead of
  reaching for a scan-on-load query.
- The boards' quota burn (ADR-0020 finding) is structurally prevented from
  regressing: `.collect()` on `evaluations`/`audit_logs` in any non-admin
  function will trip the review gate and the eslint rule.
