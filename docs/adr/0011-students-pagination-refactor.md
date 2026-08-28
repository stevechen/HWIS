# ADR 0011: Students Pagination Refactor — Index-Based Queries with Feature Flag

## Status

Accepted

## Context

The `students.listPaginated` query currently fetches all students (up to 5000) and performs filtering, sorting, and pagination in JavaScript. This works for ~300 students but doesn't scale.

Key requirements:

- Search must work across the full student body (not just first N results)
- Multiple sort fields: `studentId`, `englishName`, `chineseName`, `grade`, `house`
- Multiple filter combinations: status, grade, house, class
- Pagination with cursor stability

## Decision

1. **Add composite indexes** on `students` table for common filter combinations:
   - `by_status_grade` (status, grade)
   - `by_status_house` (status, house)
   - `by_status_class` (status, class)
   - `by_grade_class` (grade, class) — already exists on classes table

2. **Implement index-based query path** behind a `useIndex` feature flag:
   - When `useIndex: true`, use Convex indexes for filtering/sorting
   - When `useIndex: false` (default), use current JS-based path
   - Allows safe gradual rollout and instant rollback

3. **House sort order documented**: Empty house sorts first (asc) / last (desc). This matches current JS behavior and is now in CONTEXT.md.

4. **Add test coverage** for all sort/filter combinations before refactor.

## Consequences

- **Positive**: Scales to 10k+ students; search always searches full dataset; leverages Convex's reactive indexes
- **Negative**: Two code paths temporarily; feature flag adds complexity
- **Risk**: Index sort order must match JS `localeCompare` behavior exactly (especially for `chineseName`, `house` with nulls)

## Alternatives Considered

- **Versioned query** (`listPaginatedV2`): Cleaner separation but requires component migration
- **In-place without flag**: Faster but no rollback if sort order differs
- **Keep JS pagination**: Simple but doesn't scale past ~1000 students

## Addendum (2026-08-28): Scale Testing, Bugs Found, and Shadow-Canary

After acceptance, the refactor was stress-tested against an **800-student** dataset
(the projected next-year body is ~380; 800 was chosen to cross the 500-row
`scanLimit` boundary). Two real bugs were found and fixed, both caught by
automated tests before any user saw them.

### Correction to indexes (Decision §1)

The actual composite indexes added to the `students` table are:

- `by_status_classId` (status, classId)
- `by_status_house` (status, house)

The ADR text listed `by_status_grade` / `by_status_class` — those names were
aspirational and do **not** exist. `grade` is derived from `classInfo`, never
stored on the student, so it is not independently indexed.

### Bug 1 — index path truncated results at scale (FIXED)

`listPaginatedIndexed` fetched `scanLimit = max(numItems * 5, 500)` rows, then
applied the free-text/`house`/pagination steps. At >500 matching rows this
silently dropped both later matches and later pages. Example: `search "a"` at
800 students returned **439** (indexed) vs **730** (legacy).

**Fix:** collect the _full_ candidate set narrowed by the index (no `take`/`slice`
cap), then filter + paginate. Preserves the index-narrowing optimization while
restoring correctness. (Regression test: `returns every search match at scale`

- the scale/status/grade/`__unassigned` tests in `students.test.ts`.)

### Bug 2 — `canUseIndexOrder` returned wrong sort order (FIXED)

`listPaginatedIndexed` had a shortcut that returned the raw index order and
claimed it was already sorted. With `sortBy=house` + a `status` filter, the
`by_status` index orders by **status**, not **house**, so the page came back in
the wrong order (legacy JS-sorted correctly). Masked in small tests because
insertion order happened to match sort order.

**Fix:** removed the shortcut. The index now only _narrows the candidate set_;
final ordering always comes from the explicit JS sort, guaranteeing
`indexed ≡ legacy`.

### Test coverage added

- `students.test.ts`: scale regression (600 rows) + scale tests for
  `status`+`search`, `grade`, and `house: '__unassigned'`.
- Exhaustive parity matrix: `sortBy` (5) × `sortDirection` (2) × 13 filter
  scenarios = 130 combos, asserting exact ordered `_id` equality between
  legacy and indexed. This is what caught Bug 2.

### Shadow-canary (production divergence alarm)

Non-technical users will not report subtle divergence, so safety is enforced by
automated detection, not user feedback:

- `listPaginatedIndexed` recomputes the result via `listPaginatedLegacy` on
  **~10% sampled** calls when the env var `CONVEX_SHADOW_COMPARE=1` is set, and
  `console.warn`s `[shadow-compare] listPaginated divergence` (with args + both
  id lists) on any mismatch. Disabled automatically in the test runtime
  (`isTestRuntime`), so CI is unaffected.
- **Cost:** ~10% extra Convex compute on sampled admin queries during the
  bake-in window; **$0 Vercel** (data flows browser→Convex; SSR is off).
- **Enable in prod:** `npx convex env set CONVEX_SHADOW_COMPARE 1`, then watch
  Convex function logs.

### Removal criteria for the legacy path

Keep `listPaginatedLegacy` + the `useIndex` flag until **all** hold:

1. The CI parity matrix stays green (proves equivalence across every combo).
2. The shadow-canary runs clean over a **2–4 week** bake-in window in prod
   (zero `[shadow-compare]` divergences).

Then delete `listPaginatedLegacy`, the `useIndex` arg/flag, and
`shouldShadowCompare`.

### Durable monitoring: `/admin/diagnostics` (super-only)

Relying on dashboard **log retention** for divergences is fragile — old
`[shadow-compare]` warnings roll off and a non-technical user may miss them.
A super-admin-only page (`src/routes/admin/diagnostics`) loads `getSystemStatus`
(student counts + environment flags + canary flag) instantly, and runs the
parity self-test on demand via `runParitySelfTest` (both paths exercised over a
representative matrix of args, ordered id sequences compared). Because path
disagreements are deterministic, triggering the check reproduces any regression
on demand — no log retention needed. The shadow-canary stays as passive
detection during real traffic; the page is the durable, glanceable source of
truth.

The canary is toggled from that page (a switch calling `setShadowCompare`),
which persists the flag in the `settings` table (`shadowCompare` key) — no
redeploy or env change needed. `CONVEX_SHADOW_COMPARE=1` remains a hard env
override. In the test runtime the canary is always off so it costs nothing.

## Related

- CONTEXT.md: House Sort Order definition
- students.test.ts: scale regression + exhaustive legacy↔indexed parity matrix
- src/convex/students.ts: `listPaginatedIndexed` (incl. `shadowCompareEnabled`), `getSystemStatus`, `runParitySelfTest`, `setShadowCompare`
- src/routes/admin/diagnostics: super-only heartbeat page
