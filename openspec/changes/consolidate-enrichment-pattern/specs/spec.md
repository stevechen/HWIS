## Problem Statement

The Evaluations module is shallow — its interface (11 exported queries and mutations) is nearly as complex as the implementation because the enrichment logic (fetching Students, Categories, and Classes into Maps) is copy-pasted across 9 query paths, producing ~270 duplicated lines in a single 895-line Convex file. This means any change to enrichment requires 9-way edits, and the duplication creates a drift risk where enrichment behavior silently diverges across callers. Additionally, the matching function `matchesMultiSearch` is triplicated across the server shared module, the client lib, and an inline page variant with a subtle bug (missing lowercasing), creating three interfaces where one seam should suffice.

## Solution

Extract the duplicated enrichment logic into a single deep helper module with a small interface — one method that takes raw evaluation rows and returns enriched rows. All 9 query paths call this helper instead of duplicating the enrichment block. The matching function is consolidated to a single source of truth, with client pages importing from the shared seam rather than reimplementing. This concentrates complexity, eliminates drift, and makes tests hit one interface.

## User Stories

1. As a developer maintaining the Evaluations module, I want enrichment logic to live in one place so that a bug fix or data source change requires only a single edit instead of nine
2. As a developer, I want the `matchesMultiSearch` function to exist in one canonical location so that the student filter and teacher filter produce consistent results
3. As a developer, I want the evaluation creation page to import matching logic from the shared seam rather than reimplementing it inline, so that the missing-lowercase bug (where the inline variant does not lowercase before trimming) is fixed automatically
4. As a maintainer, I want the Evaluations module to be deep enough that its seam is small (one enrichment call per query) so that new query paths are easy to add and hard to get wrong
5. As a test author, I want to test enrichment through a single interface rather than testing each of the 9 duplicated blocks independently, so that regression coverage is efficient and complete
6. As a developer, I want the consolidation to honor ADR-0002 (Convex as single source of truth) so that no business logic is duplicated between server and client
7. As a developer, I want the enrichment helper to be deep behind its interface so that callers learn one method signature but get full enrichment behavior (student resolution, category resolution, class resolution, sort order)
8. As a maintainer, I want the seam to have exactly two adapters (production server adapter, client import adapter) so that the seam is justified by real variation rather than hypothetical
9. As a developer working on the houses module, I want the enrichment pattern to serve as a template for consolidating the duplicated house constants between the server and client modules
10. As a developer working on the auth layer, I want the helper pattern to serve as a template for extracting the testToken plumbing into its own adapter-seam
11. As a test author, I want to write one unit test that verifies the enrichment helper produces the correct Maps for student, category, and class lookups, rather than writing the same enrichment assertion 9 times
12. As a developer doing refactoring, I want the helper module to pass the deletion test (deleting it would cause enrichment logic to reappear across all 9 callers) confirming it earns its keep

## Implementation Decisions

- **New module**: An enrichment helper module is created as part of the `src/convex/shared/` directory, making it accessible to both the Evaluations Convex module and (via import) the client page. The seam is placed at the shared module level — the highest seam that avoids duplicating business logic across server and client.
- **Interface**: The helper exposes a single method `enrich(evaluations, ctx)` that accepts an array of raw evaluation documents and a Convex context, and returns a fully enriched array with student, category, and class data resolved. The interface is small (one method) but the implementation is deep (Map-building, 3 lookups per evaluation, sort).
- **Adapter discipline**: The production adapter calls Convex database queries to resolve students, categories, and classes. The client adapter imports the same function but receives already-fetched data where the database reads are no-ops, satisfying ADR-0002's single-source-of-truth principle.
- **matchesMultiSearch consolidation**: The canonical version stays in `src/convex/shared/evaluation_utils.ts`. The client lib version (`src/lib/evaluations/utils.ts`) is deleted. The inline variant in the evaluation creation page is removed and replaced with a direct import from the shared module. This eliminates the subtle bug where the inline variant skips lowercasing.
- **evaluations.ts size reduction**: After extraction, the Evaluations module shrinks from 895 lines to approximately 600 lines, which improves AI-navigability and reduces the module's cognitive load without splitting it.
- **No schema changes**: This refactoring does not modify any Convex schema tables, indices, or types. It is a pure code-organization change within existing interfaces.
- **ADR-0002 respected**: The consolidation ensures zero duplicate business logic between server and client — the matching function and enrichment logic each have exactly one source of truth.
- **ADR-0001 respected**: The enrichment consolidation does not touch the evaluation locking logic or the `getFridayOfWeek` function. Those remain as-is.

## Testing Decisions

- **Test strategy**: The enrichment helper is tested through its interface — one seam for all callers. The test verifies that the returned enriched array contains correctly resolved student names, category names, and class display names for each evaluation row.
- **Test scope**: A single unit test suite for the enrichment helper, plus regression assertions that each of the 9 query paths in evaluations.ts still returns enriched results with the same shape as before.
- **Prior art**: The existing test file `src/convex/evaluations.test.ts` (1127 lines) provides the pattern for Convex function testing using `convexTest`, `modules`, and `t.run()`. New tests for the enrichment helper follow the same setup pattern used in `src/convex/shared/evaluation_utils.ts` tests.
- **Behavioral equivalence test**: An additional test verifies that the consolidated `matchesMultiSearch` produces identical results to the previous inline variant, specifically confirming that lowercased matching works for the page variant that previously skipped this step.
- **Tests do not test implementation details**: Tests do not verify how Maps are built internally or how the enrichment logic iterates over arrays. They only verify the enriched outputs — student name resolved, category name resolved, class display name resolved, sort order correct.

## Out of Scope

- Refactoring the misnamed `getFridayOfWeek` function or the lock-date duplication to client pages
- Splitting evaluations.ts into multiple modules beyond the enrichment extraction
- Modifying the StudentCard, MoveDialog, or BulkActionBar components
- Consolidating House constants (separate architecture candidate)
- Extracting the Auth testToken plumbing into its own seam (separate architecture candidate)
- Modifying the `getWeekNumber` function or fixing ISO 8601 compliance
- Changing evaluation locking behavior, criteria, or lock-date calculations
- Any changes to the student record system, houses, or categories modules beyond the enrichment consolidation

## Further Notes

This spec covers the top recommendation from the architecture review (consolidate the duplicated enrichment pattern). The consolidation serves as a template for the remaining three candidates: matchesMultiSearch triplication, House constants duplication, and getFridayOfWeek misnaming/doubling. Completing this first establishes the helper-as-seam pattern that makes the other consolidations straightforward — each becomes a matter of importing the canonical shared module rather than reimplementing. The deletion test confirms the helper's value: removing it causes enrichment logic to reappear across all 9 callers, concentrating complexity back where it was.
