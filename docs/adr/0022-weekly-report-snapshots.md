# ADR-0022: Materialized weekly report counts

## Status

Accepted

## Context

`evaluations.getWeeklyReportsList` derived the admin weekly report list from the
`evaluations` table: one query over the whole lookback window, grouped in
memory into per-week distinct-student counts. The page rendered roughly 30
small numbers from that scan.

Three problems:

1. **Silent truncation.** The original query scanned `by_timestamp` ascending
   with `.take(1000)`. Once a year passed 1,000 evaluations the budget was spent
   on the _oldest_ rows, so the newest weeks disappeared and the week straddling
   the cap was undercounted. Production hit this in week 43: 1,245 evaluations
   over nine weeks, and week 42 was missing. A `.collect()` fix (commit
   `032a2e3b`) removed the cap, but the read stayed O(evaluations).
2. **No headroom.** Convex caps a single function execution at roughly 32,000
   documents scanned. At the 10× target (~75k evaluations/year, ~1,000
   students) even a semester-scoped scan (~36k rows) exceeds that, and a
   `paginate()` loop is not an option because Convex allows one paginated query
   per execution.
3. **Wrong labels.** `formatDateRange`/`getWeekNumber` read host-local calendar
   fields, and Convex runs in UTC. A Taipei Monday was rendered as the previous
   Sunday — production showed `Oct 11 - Oct 15` for the week `Oct 12 - Oct 16`.

Admins check the weekly reports on Monday for the week that locked at Monday
00:00 Taipei (ADR-0001). That week's data is final before anyone reads it, so a
short refresh lag is invisible to the workflow.

## Decision

Materialize one small row per evaluation week in a new `weekly_report_weeks`
table (ADR-0020's snapshot pattern):

```ts
weekly_report_weeks: defineTable({
	weekStart: v.number(), // Monday 00:00 Asia/Taipei
	studentCount: v.number(), // distinct students with >= 1 evaluation that week
	generatedAt: v.number()
}).index('by_weekStart', ['weekStart']);
```

- **Row per week in the span, including zero counts.** "Row missing" therefore
  means "not computed yet", which lets the read path fall back to a bounded
  live count instead of guessing. Zero-count weeks are filtered out at read
  time, so the list still hides weeks with no evaluations.
- **Read path.** `getWeeklyReportsList` reads at most one small row per
  completed week in a rolling 52-week window (≤ 52 documents), hides the
  in-progress week, and renders `weekNumber`/`formattedDate` at read time.
  `sinceTimestamp` remains as an optional lower bound for tests and tools; the
  server owns the default window.
- **Bounded fallback.** A week missing from the table is counted live. With an
  empty table (first deploy, before the backfill lands) the 12 most recent
  completed weeks are counted; once anything is materialized, at most the 4
  most recent missing weeks are. A fresh deployment therefore never renders a
  blank page, and a partial backfill self-corrects.
- **Freshness** comes from three layers (ADR-0020's event-driven + cron +
  forced-rebuild shape):
  1. every evaluation mutation (`create`/`remove`/`update`/`updateMany`/
     `removeMany`) schedules `weekly_report_snapshots.scheduleRefresh`, which
     recomputes the current week and the two before it after a 45s debounce.
     Like ADR-0020's watermark, the run is skipped when the recent weeks already
     have rows and no `audit_logs` entry is newer than the oldest of them, so
     duplicate debounced runs cost two indexed reads and no writes;
  2. a 30-minute cron runs `cronRefresh` _unconditionally_ (it bypasses the
     audit-log check): it refreshes the recent three weeks — healing writes that
     leave no audit-log trail inside that window, such as cascade deletes,
     backup clears/restores and `resetDb` — and bootstraps a full chunked
     backfill when any completed week in the window is missing;
  3. a nightly rebuild (`startRebuild`, 21:45 UTC) recomputes the whole
     52-week window in chunks, which is what heals cascade-style writes for
     weeks outside the recent three.
     The event-driven check deliberately does not try to infer deletes from the
     audit trail: cascades and restores write no audit-log entry, so a watermark
     could never prove freshness for them — only the unconditional cron and
     rebuild can, and they are the backstop for exactly that case.
- **Chunked rebuild.** `rebuildChunk` recomputes at most 8 weeks per execution
  (~14.4k document reads at the 10× target) and schedules the next slice until
  the range is done. `startBackfill` uses the same machinery across all
  recorded history; `previewBackfill` is a read-only dry run that diffs live
  distinct counts against stored rows one chunk at a time.
- **Detail view caps fixed.** `getWeeklyReportDetail` now uses `.collect()` and
  an inclusive `[Monday 00:00, Sunday 23:59:59.999]` range. The old `.take(500)`
  silently truncated busy weeks and its strict `gt` dropped an evaluation at
  exactly Monday 00:00.
- **Labels fixed.** `formatDateRange` formats with `timeZone: 'Asia/Taipei'` and
  `getWeekNumber` derives the ordinal week from the UTC+8-shifted date, so both
  are host-timezone independent.

A week's roster changes only on insert or delete: no code path edits an
evaluation's `timestamp` or `studentId` (edits touch `value`, `categoryId`,
`details` only). The count is therefore a plain distinct-student count, with no
move-between-weeks transition to reconcile.

## Consequences

- The steady-state list read drops from O(evaluations in window) to ≤ 52 small
  documents, and the cost no longer grows with the number of evaluations. The
  page shows one number per completed week with at most ~45s of lag; the
  Monday-morning review reads a week that was already final.
- The in-progress week is hidden. It appears the Monday after it ends, which
  matches the lock boundary and avoids "the count is still climbing" surprise.
- Cascades, restores and resets are not instrumented. A stale count can persist
  until the next cron or nightly rebuild (at most ~24h); run
  `bunx convex run weekly_report_snapshots:startBackfill` for an immediate heal.
- Refresh and rebuild executions stay under the document-read ceiling at the
  10× target because both operate per week (or eight weeks per chunk).
- Rollback is safe: reverting `getWeeklyReportsList` to the `.collect()`
  version returns behavior to master's, leaving the table unused.

## Operations

```bash
# Dry-run diff (read-only, one 8-week chunk per call; defaults to all recorded
# history, pass nextCursor back in as startWeekStart to continue)
bunx convex run weekly_report_snapshots:previewBackfill '{}'

# Backfill all recorded history (chunked, idempotent)
bunx convex run weekly_report_snapshots:startBackfill '{}'

# Rebuild the rolling 52-week window now
bunx convex run weekly_report_snapshots:startRebuild '{}'

# Recompute a single week
bunx convex run weekly_report_snapshots:refreshWeek '{"weekStart":<ms>}'
```
