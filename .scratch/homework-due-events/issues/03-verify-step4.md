# 03: Verify wizard Step 4 event selection

**What to build:** `tests/lib/components/esl/wizard-step-4.test.ts` verifies static structure; `e2e/wizard-flow.spec.ts` covers Step 4 event selection with block gates; `tests/lib/components/esl/wizard-save.test.ts` verifies `ranges.pd1`/`ranges.rd3` payload.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] Browser unit tests pass (`wizard-step-4.test.ts`)
- [ ] E2E wizard flow verifies due/check placement within correct block
- [ ] Save payload includes `ranges.pd1`/`rd3` with correct window dates
