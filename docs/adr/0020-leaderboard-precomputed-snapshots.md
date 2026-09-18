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
- A cron (`board_snapshots.refreshAll`) runs every 5 minutes. Each refresh
  first computes an O(1) watermark (max `evaluations.timestamp` via the
  `by_timestamp` index) and skips entirely — zero writes — when evaluations
  haven't changed. A nightly forced rebuild is the safety net for changes the
  watermark can't see (value-only edits, deletes of older rows).
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
- Boards lag evaluations by up to 5 minutes (plus cron delay). The points-pop
  animation on the boards no longer fires on every evaluation; it fires when
  the cron publishes a new snapshot.
- The cron runs 288×/day but does real work only on days when points are
  actually awarded; on idle days it performs two indexed reads per board.
- If a snapshot ever goes stale or wrong (e.g. an edit the watermark missed),
  the nightly forced rebuild heals it, or run
  `bunx convex run board_snapshots:refreshAll '{"force":true}'` manually for
  an immediate heal (the CLI authenticates with the deployment's admin key,
  so internal functions are runnable from a dev checkout).
