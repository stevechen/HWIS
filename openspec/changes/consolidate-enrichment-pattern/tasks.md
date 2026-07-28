# Implementation Tasks: Consolidate Duplicated Enrichment Pattern

## Enrichment Module

- [ ] ENRICH-1: Create enrichment helper module in `src/convex/shared/` with `enrich(evaluations, ctx)` function
- [ ] ENRICH-2: Implement Map-building for students, categories, and classes inside the helper
- [ ] ENRICH-3: Implement enrichment mapping logic (resolve student name, category name, class display for each evaluation)

## Queries — Replace Duplicated Blocks

- [ ] ENRICH-4: Replace enrichment block in `listRecent` (lines 186-205) with helper call
- [ ] ENRICH-5: Replace enrichment block in `getWeeklyReportDetail` (lines 310-336) with helper call
- [ ] ENRICH-6: Replace enrichment block in `getStudentEvaluationsByTeacher` (lines 401-412) with helper call
- [ ] ENRICH-7: Replace enrichment block in `getStudentEvaluationsByTeacherByStudentIdCode` (lines 461-472) with helper call
- [ ] ENRICH-8: Replace enrichment block in `getStudentEvaluationsAll` (lines 514-527) with helper call
- [ ] ENRICH-9: Replace enrichment block in `getStudentEvaluationsAllByStudentIdCode` (lines 579-592) with helper call
- [ ] ENRICH-10: Replace enrichment block in `listAllEvaluations` (lines 641-662) with helper call
- [ ] ENRICH-11: Replace enrichment block in `listAllEvaluationsPaginated` (lines 736-757) with helper call
- [ ] ENRICH-12: Replace enrichment block in `getEvaluation` (lines 843-855) with helper call

## Remove Duplicated Code

- [ ] DUP-1: Delete `matchesMultiSearch` from `src/lib/evaluations/utils.ts`
- [ ] DUP-2: Remove inline `matchesMultiSearch` from `src/routes/evaluations/new/+page.svelte` and replace with shared import
- [ ] DUP-3: Verify the page variant now uses the canonical lowercasing before trimming

## Tests

- [ ] TEST-1: Write unit test for enrichment helper — verify student/category/class resolution
- [ ] TEST-2: Write unit test for enrichment helper — verify sort order is preserved
- [ ] TEST-3: Write regression test for `matchesMultiSearch` — verify lowercased matching works
- [ ] TEST-4: Run existing evaluations test suite to confirm no regressions

## Cleanup

- [ ] CLEANUP-1: Remove unused imports in queries that relied on inline enrichment helpers
- [ ] CLEANUP-2: Verify `evaluations.ts` compiles without errors after refactoring
- [ ] CLEANUP-3: Run `bun run lint` and `bun run typecheck` to verify no regressions
