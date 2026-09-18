# Leaderboard Quota Audit

Free-tier budget for reference (Convex pricing): **1 GB/month database I/O**,
1M function calls, 0.5 GB storage. Database I/O is charged per byte read or
written, so what matters is a query's **read set**, not the size of what it
returns.

The two TV boards (`/leaderboard/houses`, `/leaderboard/classes`) are always-on
kiosks driven by live Convex subscriptions, which makes them unusual: every
write anywhere in the school can re-execute their queries, and each
re-execution re-reads the whole read set.

## Ranked findings

### 1. [Fixed in ADR-0019] Board config rows carried every theme screenshot

`leaderboards.getPublicConfig` read `settings['leaderboard.<board>']` — a row
that also held every theme screenshot as a base64 data URL. Measured on the dev
deployment:

| Row                   | Stored bytes | `themes` | legacy `thumbnailUrl` |
| --------------------- | ------------ | -------- | --------------------- |
| `leaderboard.classes` | 709,354      | 588,746  | 120,442               |
| `leaderboard.houses`  | 185,647      | 49,763   | 135,718               |

Each board load (and each `update` write, which invalidated the subscription)
cost ~700 KB / ~186 KB to learn `enabled` + `theme`. Worse, the admin page's
ten-capture sweep patched that row ten times, re-reading all screenshots in both
the `list` subscription and both boards: roughly **17 MB of I/O per screenshot
sweep**. Fixed by moving screenshots to `leaderboard_thumbnails` (see ADR-0019);
the config row is now ~60 B.

### 2. [Fixed in ADR-0020] The house/class stats queries scan the whole `evaluations` table

`src/convex/students.ts`:

- `fetchHouseStats` (line ~1087) — `ctx.db.query('evaluations').collect()`
- `fetchClassStats` (line ~1421) — `ctx.db.query('evaluations').collect()`

Both are subscribed by the always-on boards. Consequences:

- The read set is **every evaluation ever recorded** (the year-end migration
  clears evaluations, so effectively one school year).
- Any evaluation insert, edit, or delete anywhere invalidates both
  subscriptions; each re-execution re-reads the entire table.
- Rough cost: `table_bytes × re-executions`. At a plausible 20k evaluations
  (~4 MB) and 50 writes/day, that is ~200 MB/day — 6 GB/month from this alone,
  before thumbnails or config reads.

The code comments already flag the full scan; note that filtering after
`collect()` does not reduce the read set — Convex bills every document the query
touched, not every document the handler kept.

Options, cheapest-to-strongest:

| Option                                              | Read set after change                      | Liveness                 | Risk                       |
| --------------------------------------------------- | ------------------------------------------ | ------------------------ | -------------------------- |
| (a) Materialized board snapshot refreshed by a cron | one small row per board                    | stale up to the interval | low (no write-path change) |
| (b) Denormalized per-student / per-entity totals    | ~500 small student rows or ~20 entity rows | instant (recommended)    | high (integrity)           |
| (c) Scope the board to the current semester         | one semester of evaluations                | instant                  | product decision           |

(a) was chosen (see ADR-0020): boards now read a precomputed snapshot row
(`leaderboard_snapshots`) that a cron refreshes only when the evaluations
watermark (max `timestamp` via `by_timestamp`) has moved, with a nightly forced
rebuild as the safety net. (b) remains the follow-up if the 5-minute staleness
turns out to matter.

### 3. [Open — cheap] The 30-day "recent" dimension is computed and never rendered

`fetchHouseStats` builds `recentTotalPoints`, `recentRank`,
`recentPointsByCategory`, `topContributorsRecent`, `growthOpportunitiesRecent`
and the matching `recentRanking`. Nothing consumes any of them: the boards
render `totalPoints`, `pointsByCategory`, `rank`, `topContributors`,
`growthOpportunities`, `studentCount`, and `displayName`. Deleting the recent
dimension removes a second pass over every evaluation, halves the payload pushed
to each subscription, and drops ~80 lines — but it is a product call (it may be
the seed of a future "last 30 days" board).

### 4. [Open — cheap] The admin screenshot sweep runs the full aggregation 10×

`src/routes/admin/leaderboards/+page.svelte` captures 2 boards × 5 themes by
loading the real board in a hidden iframe. Each iframe now subscribes to the
snapshot query (ADR-0020), so a sweep's aggregation cost is gone; what remains
is the iframe render + screenshot payload itself. A sweep that finds missing
previews still runs ten iframe loads — gate it behind an explicit button or
capture only the currently selected theme if it needs trimming further.

### 5. [Open — minor] House board reads non-enrolled students

`fetchHouseStats` uses `by_house` for all four houses, so `Not Enrolled`
students who still have a house contribute to house totals, while
`fetchClassStats` filters to `Enrolled` (the in-code comment claims they match).
The schema already has `by_status_house`. This is a correctness question first
and a tiny read saving second — flagged, not changed, since it would move board
numbers.

### 6. [Minor — noted] Payload size per re-execution

`getPublicHouseStats` returns contributors, growth lists, and both all-time and
recent variants for four houses on every subscription update. Smaller payloads
mean less client work and less websocket traffic per update; this follows from
finding 3 rather than being an independent win.

## What changed in this pass

- `settings['leaderboard.<board>']` now stores only `{ enabled, theme, updatedAt }`;
  `getPublicConfig` returns that shape (typed `PublicLeaderboardConfig`).
- New `leaderboard_thumbnails` table + per-theme upsert in `leaderboards.update`;
  `list` assembles the same `themes` map for the admin page.
- Legacy `thumbnailUrl` argument removed; `update` rewrites the compact row.
- `leaderboards.migrateThumbnails` internal mutation (idempotent) moves existing
  screenshots out of the legacy rows — **run once per deployment**:

  ```bash
  bunx convex run leaderboards:migrateThumbnails
  ```

- `src/convex/leaderboards.test.ts` gained quota guards: the config row stays
  under 200 bytes when a 50 KB screenshot is stored, `getPublicConfig` exposes
  exactly four keys, and the migration is verified to compact legacy rows.

## What changed in the snapshot pass (ADR-0020)

- New `leaderboard_snapshots` table; `board_snapshots.getHouseStats` /
  `getClassStats` (public) serve the boards from a precomputed row with a
  live-compute fallback until the first cron refresh.
- `board_snapshots.refresh` / `refreshAll` (internal, cron-driven every
  5 minutes): O(1) watermark check via `by_timestamp`, full recompute only when
  evaluations changed, `force` flag for the nightly rebuild and manual healing:

  ```bash
  bunx convex run board_snapshots:refreshAll '{"force":true}'
  ```

- `getPublicHouseStats`/`getPublicClassStats` removed; their duplicated auth
  gate extracted into `students.assertBoardViewer`. Admin queries
  (`getHouseStats`/`getClassStats`) still compute live on demand.
- Board read set per subscription update: one small row (was: every evaluation
  ever recorded). Board staleness: up to ~5 minutes.
