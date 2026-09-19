# ADR-0020: Precomputed leaderboard snapshots via cron

## Status

Accepted

## Context

The public TV boards (`/leaderboard/houses`, `/leaderboard/classes`) called
`getPublicHouseStats`/`getPublicClassStats` on every page load. Each call
full-scanned the `evaluations` table (`ctx.db.query('evaluations').collect()`,
~thousands of document reads) to aggregate per-student/house/class totals.
Boards stay open all day on classroom displays, so this was the dominant
consumer of the free-tier database I/O budget (see
`docs/leaderboard-quota-audit.md`, finding 2).

The stats update in real time via Convex reactivity, but they don't need to:
a leaderboard that lags a few minutes behind is acceptable.

## Decision

- Store precomputed board stats in a new `leaderboard_snapshots` table, one
  row per board (`houses` | `classes`), as a JSON payload with exactly the
  shape the old live queries returned.
- A cron (`board_snapshots.refreshAll`) runs every 30 minutes as a safety net.
  Freshness comes from **event-driven refreshes**: every evaluation mutation
  (`create`/`remove`/`update`/`updateMany`/`removeMany`) schedules
  `board_snapshots.scheduleRefresh`, which runs `refreshAll` after a 45s
  debounce, so boards update within roughly a minute of a write. Overlapping
  schedules from write bursts are harmless — the watermark check turns
  redundant runs into two indexed reads and no writes.
- Each refresh first computes an O(1) watermark (max of the latest
  `evaluations.timestamp` and latest `audit_logs.timestamp`, both via
  descending index takes) and skips entirely — zero writes — when nothing
  changed. Audit logs cover every evaluation create/edit/delete, so value
  edits and deletes of older rows are caught too. A nightly forced rebuild is
  the last-resort safety net.
- `board_snapshots.getHouseStats` / `getClassStats` (public, same auth gate as
  the old queries) read the snapshot. Their payload types are derived from the
  exported `fetch*Stats` functions, so the stored JSON shape can't drift from
  the fallback computation. Until the first refresh runs after deploy, they
  fall back to the live computation, so behavior is unchanged on a fresh
  deployment.
- The old `getPublicHouseStats`/`getPublicClassStats` queries are removed;
  their duplicated 45-line auth gate is extracted into
  `students.assertBoardViewer`. Admin pages keep `getHouseStats`/
  `getClassStats` (live computation on demand, admin-only, low traffic).

## Consequences

- Board reads drop from O(all evaluations) to a single small-document read.
- Boards lag evaluations by ~45–60s (scheduled refresh debounce). The
  points-pop animation on the boards fires on the debounced refresh, not on
  every evaluation.
- The 30-minute cron and nightly rebuild are safety nets; on a normal day all
  freshness comes from the event-driven schedules, and redundant runs are
  near-free (two indexed reads, no writes).
- If a snapshot ever goes stale or wrong (e.g. an edit the watermark missed),
  the nightly forced rebuild heals it, or run
  `bunx convex run board_snapshots:refreshAll '{"force":true}'` manually for
  an immediate heal (the CLI authenticates with the deployment's admin key,
  so internal functions are runnable from a dev checkout).
- **Instant-but-cheap feel (option 3):** totals still lag ~45–60s, but both
  boards also subscribe to `board_snapshots.getRecentActivity` — the last 10
  evaluations with names/labels attached (one indexed take + a handful of
  point-gets, near-free). A shared `LeaderboardActivityFeed` component pops a
  `＋5 Alice` chip the moment a write lands, while the debounced snapshot
  catches the totals up ~45s later. The feed ignores anything older than the
  page load so a refresh never replays old evaluations.
