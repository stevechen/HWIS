## Free-Quota Impact Check

Changes to `src/convex/` (Convex backend functions) must declare their free-tier
quota cost. Fill this out for any query/mutation you add or modify.

- [ ] **Query or mutation?** (pick one)
- [ ] **No full-table scans.** No `.collect()` / `.scan()` unless the function is
      admin-only (`requireAdminForSensitiveOperation`) or a cron job with a stated
      reason. If you need all rows, batch them with an index or `.take(N)`.
- [ ] **Public/TV path?** If this query is called from a leaderboard, display,
      or long-lived page (see `src/routes/leaderboard/` and `src/routes/display/`),
      it must read ≤ O(1) to O(10) documents per call — not O(table size).
- [ ] **Mutation amplification.** If this mutation writes in a loop, use
      `ctx.db.batch` / array inserts instead of per-row writes.
- [ ] **Write-side amplification note.** If this mutation patches multiple small
      rows to maintain an aggregate (counter/snapshot), state the read+write unit
      cost (e.g. "1 read + 3 writes per row, only under index").
- [ ] **Freshness model.** If this powers live data, prefer event-driven refresh
      (mutate on write) over polling a compute-heavy query on an interval.

> See `docs/adr/0021-quota-first-convex-design.md` for the full rationale and
> the heuristics that produced the fixes in ADRs 0019 & 0020.

---

## Description

<!-- What did you change and why? -->

## Checklist

- [ ] `bun run check` — svelte-check / typecheck clean
- [ ] `bun run lint` — eslint + prettier clean
- [ ] `bun run test:unit:convex` — Convex unit tests pass
- [ ] `bun run test:component` — component tests pass
- [ ] `bun run convex:gen` — generated API is up to date
