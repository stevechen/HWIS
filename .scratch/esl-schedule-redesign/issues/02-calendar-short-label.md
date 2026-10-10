# 02: Fix `eslClassShortLabel` for G7–G10 (no trailing token duplication)

**What to build:** The `eslClassShortLabel` function in `src/convex/shared/esl.ts` renders class short labels correctly for all grades. G7–G9 render as `G<grade> <Bas./Ele./…> <n>` deduplicated (e.g., `G9 Bas. 3`, never `G9 Bas. 3 G9`). G10 renders as `H1nnA/B` verbatim (e.g., `H101A`, `H112B`, `H110A`). A before/after table for G7–G10 is provided before editing.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] G7–G9: `G<grade> <short-level> <class-number>` (e.g., `G7 Pre. 1`, `G8 Ele. 3`, `G9 Bas. 3`)
- [ ] No trailing grade token duplication (never `G9 Bas. 3 G9`)
- [ ] G10: `H1nnA/B` verbatim (e.g., `H101A`, `H112B`, `H110A`)
- [ ] Before/after table documented for G7–G10 before code change
- [ ] Calendar view and schedule list both use the corrected short labels
