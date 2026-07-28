## Why
The `matchesMultiSearch` function exists in three places: `src/convex/shared/evaluation_utils.ts` (server), `src/lib/evaluations/utils.ts` (client lib), and inline in `src/routes/evaluations/new/+page.svelte` (page variant). The page variant has a subtle bug — it splits on commas but skips lowercasing before trimming. A bug fix or enhancement requires three independent edits, and the copies can drift apart.

## What Changes
- Keep the canonical `matchesMultiSearch` in the server shared module
- Remove the client lib copy from `src/lib/evaluations/utils.ts`
- Remove the inline variant from the creation page; replace with a direct import from the shared seam
- Fix the missing-lowercase bug as part of the consolidation
