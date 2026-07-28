## Why

The Evaluations module (src/convex/evaluations.ts, 895 lines) contains the same enrichment logic — fetching Students, Categories, and Classes into Maps — copy-pasted across 9 query paths, totaling ~270 duplicated lines. It also appears in a second form at src/lib/evaluations/utils.ts (a thin client-side copy of matchesMultiSearch from the server) and in a third, subtly different, inline form at the evaluation creation page. A bug fix to matching logic or an enrichment data source change requires 3 independent edits, and they can drift apart. This is a shallow module: the interface is nearly as complex as the implementation because the implementation has not absorbed the repetition into a deep helper.

## What Changes

- Extract the duplicated enrichment logic into a single helper with a small interface: one function that takes raw evaluation rows and returns enriched rows with student, category, and class data pre-resolved
- Have all 9 query paths in the Evaluations module call this helper instead of duplicating the enrichment block
- Remove the client-side copy of matchesMultiSearch from src/lib/evaluations/utils.ts; have the client page import directly from the server shared module
- Remove the inline matchesMultiSearch implementation from the evaluation creation page; import from the shared seam instead
- The helper module becomes the seam: one adapter on the server side (calls Convex DB), one adapter on the client side (imports from the shared module per ADR-0002)

## Capabilities

### New Capabilities

- `enrichment-helper`: A deep module that encapsulates the enrichment logic behind a small interface — one method that returns fully enriched evaluation data

### Modified Capabilities

- `evaluations`: Replace 9 duplicated enrichment blocks with calls to the enrichment helper
- `lib/evaluations/utils`: Remove the triplicated matchesMultiSearch copy
- `evaluations/new/+page.svelte`: Remove inline matching logic; import from shared seam
- `evaluations.ts` line count: reduce from 895 to ~600 lines, improving navigability and depth

## Impact

**Affected Code:**

- `src/convex/evaluations.ts` — 9 enriched blocks replaced with single helper call
- `src/convex/shared/evaluation_utils.ts` — receives the enrichment helper; matchesMultiSearch stays here as canonical
- `src/lib/evaluations/utils.ts` — matchesMultiSearch removed; other helpers remain
- `src/routes/evaluations/new/+page.svelte` — inline matching logic replaced with shared import
- `src/lib/evaluations/stores.svelte.ts` — may need filter adjustment if enrichment shape changes
- `src/lib/components/timeline/EvaluationsTimeline.svelte` — may need prop adjustment

**APIs:**

- New query in the enrichment module: `enrich(evaluations, ctx)` — returns fully enriched evaluation array

**Dependencies:**

- Convex for the server-side enrichment
- Existing matchesMultiSearch logic (must remain behavioral-compatible)

**Systems:**

- The enrichment helper must produce identical output to the current inline blocks for all 9 query paths
- The client-side matching logic must produce identical results to server-side matchesMultiSearch (current inline variant has a bug: it skips lowercasing before trimming)
- ADR-0002 (Convex single source of truth) is honored: no duplicate business logic in the client
- ADR-0001 (evaluation locking) is unaffected: enrichment changes do not touch the locking logic

## Design

The enrichment helper is the seam. It has one interface method `enrich(evaluations, ctx)` that takes an array of raw evaluation documents and returns an array with student, category, and class data resolved. All 9 query paths in evaluations.ts call this one function. The seam has two adapters: the production adapter (calls Convex database queries) and the test adapter (uses in-memory data). Clients — both server-side queries and the client page — import from the same seam.

The seam is placed at the server shared module level (src/convex/shared/) so that the server adapter owns the database access, and the client adapter imports a read-only version that operates on already-fetched data. This follows the existing pattern of src/convex/shared/evaluation_utils.ts and src/convex/shared/houses.ts.

## Testing

- Unit test the enrichment helper in isolation with mock student/category/class data
- Verify each of the 9 query paths produces identical enrichment output to current behavior (regression test)
- Verify matchesMultiSearch produces identical results across server, client lib, and page — the inline page variant currently skips lowercasing, creating a behavioral discrepancy that the consolidation will fix

## Out of Scope

- Fixing the misnamed getFridayOfWeek function (that is a separate seam and covered by ADR-0001)
- Refactoring the 895-line evaluations.ts file beyond the enrichment consolidation
- Changing the evaluation locking logic
- Modifying the StudentCard or MoveDialog components
- Consolidating House constants (separate candidate)
- Auth testToken plumbing (separate candidate)

## Further Notes

This is the first of the four architecture candidates surfaced in the review. Consolidating the enrichment pattern immediately reduces evaluations.ts from 895 to ~600 lines, establishes the helper-as-seam pattern for the other three candidates, and eliminates the most damaging form of duplication (enrichment logic that silently diverges across 9 call sites). The deletion test confirms value: deleting the enrichment helper causes all 9 query paths to need their own enrichment logic again, concentrating complexity back where it was.
