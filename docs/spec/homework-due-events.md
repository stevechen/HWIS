## Problem Statement

Step 4 wizard events (Passport/Recording due dates `pd1`/`pd2`/`pd3`, checks `pcheck`/`wcheck`) had broken block gates: `pd3`/`rd3` incorrectly bundled with `pcheck`/`wcheck` (using 3-class `clilQuizWindow` instead of 5-day `schoolWeekDates`); shorter 4-day holiday weeks disabled by `straddleViolation`; previous-week addition missing for `≤3` school-day windows; highlight split (`oldHighlighted` vs `highlighted`) not implemented.

## Solution

Use `schoolWeekDates` (not `collectClassDays`) for all `pd*`/`rd*`/`pcheck`/`wcheck`. Apply block gates (`blockViolation`) and order gates (`orderViolation`). Skip `straddleViolation` unconditionally for all due/check events. When selected week's school days ≤ 3, prepend previous full school week (`prevMonday` = `mondayOfWeek(snapped) - 7`). Highlight split: old/current (`armedDates`) washed out (`bg-emerald-50`/`ring-emerald-200`), new/hover (`hoverPreview`) saturated (`bg-emerald-100`/`ring-emerald-600`).

## User Stories

1. As admin setting semester events, I select `Passport Due 1`, click any school day in Block 1 week, and see the full school week highlighted.
2. As admin, when `Passport Due 3` is armed, clicking dates in Block 2 or Block 3 shows them disabled with tooltip `"belongs to Block 3 — between Exam 2 and the Final"`.
3. As admin, when a holiday removes one class (4-day week), I can still place the due window; shorter windows (`≤3`) include previous school week.
4. As admin modifying an existing due, the old selection shows washed-out highlight and the new hover shows saturated highlight.
5. As admin, `Passport Check` (`pcheck`) is selectable only in Block 3 and spans its school week regardless of holiday count.

## Implementation Decisions

- `Step4Panel.svelte`: `setRange()` uses `schoolWeekDates(snapped, skipSet)` for all `pd*`/`rd*`/`pcheck`/`wcheck`; shorter windows (`≤3`) prepend `prevMonday` week; `snapClass` excluded for these IDs.
- `Step4Panel.svelte`: `armedGate` uses same `schoolWeekDates` logic; `straddleViolation` excluded unconditionally for `pd*`/`rd*`/`pcheck`/`wcheck`.
- `CalendarPreview.svelte`: new props `oldHighlighted` (washed out) and `highlighted` (saturated); `cellTone` applies `bg-emerald-50`/`ring-emerald-200` for old, `bg-emerald-100`/`ring-emerald-600` for new.
- Schema: no DB changes; wizard `step4.ranges` holds `string[] | null` as before.

## Testing Decisions

- `tests/lib/components/esl/wizard-step-4.test.ts`: static structure (tab, row IDs, button names, disabled dates by role).
- `tests/lib/components/esl/wizard-save.test.ts`: payload structure (`ranges.pd1`, `ranges.rd3`, etc.).
- `e2e`: wizard flow (`wizard-flow.spec.ts`) covers Step 4 event selection.
- Only external behavior tested (highlight colors, disabled tooltips, save payload), not `snapClass` internals.

## Out of Scope

- Quiz (`q1`-`q6`) 3-class `clilQuizWindow` logic unchanged.
- G9 mock pair (`mock1`/`mock2`/`mock3`) order gates unchanged.
- Custom event (`custom-`) placement unchanged.

## Further Notes

Seam: `CalendarPreview.svelte` (props `highlighted`/`oldHighlighted`). `Step4Panel.svelte` owns `armedDates` (old) and `hoverPreview` (new). Block windows derived from `step3.exams` via `blockOf()` and `blockWindows` derived array.
