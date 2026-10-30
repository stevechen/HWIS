SPEC REFERENCE LINES (repo spec = `docs/spec/homework-due-events.md`; sub-tickets 289/290/291 per prompt description, not in that file):

- Spec file line 3 / 7 (Step 4 due events): block gates / `schoolWeekDates` / highlight split. Not directly relevant to ESL changes, but confirms changed file `Step5Panel.svelte` is Step 5, not Step 4.
- Prompt sub-ticket 289: `eslTeachingPeriods()` reads `classPeriods` or infers from legacy `startPeriod`/`endPeriod`; updates `isEslActiveDay`/`resolveEslDayStatus`.
- Prompt sub-ticket 290: checkbox grid P1-P8 + Morning/Afternoon quick buttons in custom modal and edit popover; saves via `buildSavePayload`.
- Prompt sub-ticket 291: calendar renders partial correctly through `partial` status.

CHANGED FILES (diff `bf2da5c6...feat/implement-spec-288 -- src/ tests/`):
`src/convex/shared/esl.ts`, `Step5Panel.svelte`, `wizard-save.ts`, `wizard-state.ts`, `tests/lib/components/esl/wizard-save.test.ts`.

---

(a) MISSING / PARTIAL

1. 289 `eslTeachingPeriods` ignores `classPeriods` (spec: “reads `classPeriods` or infers from legacy `startPeriod`/`endPeriod`”). Function (esl.ts 2045) takes only `meetings`, `events`, `classId`, `type`, `cohortGrade` — no `classPeriods`. It infers teaching from `meetingPeriods` (line 2069) and applies `start`/`partial` exclusions (2075-2084), but never intersects with event `classPeriods`. Thus checkbox-selected periods (`customEvents` with `classPeriods: [2,3,4]`) are not respected; all weekday meeting periods survive.
2. 291 calendar partial display is data-layer only (spec: “calendar renders partial correctly through `partial` status”). `CalendarPreview.svelte` untouched; only `resolveEslDayStatus` (2230-2260) changed to return `outOfWindow: true` + `no_class` when outside partial window. No e2e or component test verifies calendar color / chip behavior for partial days.
3. No unit tests cover new `eslTeachingPeriods` or `resolveEslDayStatus` combos (`start_school` + `partial`, or `partial` + `classPeriods`). Only payload tests added (`wizard-save.test.ts`, +2 cases).

(b) SCOPE CREEP (little)

- `wizard-save.ts` banner guard (line 619-623): if edit is on banner (`custom.type === 'banner'`), `override.classPeriods !== undefined` forces `next.classPeriods = undefined`. Defensive, not asked, harmless.
- Checker grid duplicated in both custom modal (line 1035) and edit popover (line 1244) — exactly what 290 asks (“in custom modal and edit popover”). Morning/Afternoon/Clear buttons present in both. No extra fields.
- Note: the repo spec file describes Step 4 due events (line 3; line 7 `schoolWeekDates` / `straddleViolation`), not ESL. The ESL work maps to sub-tickets 289-291 per prompt; no Step-4 code appears in diff (file is `Step5Panel.svelte`). No scope creep across wizard steps.

(c) IMPLEMENTED BUT WRONG

1. `eslTeachingPeriods` partial logic may invert intended semantics for `classPeriods`. If `classPeriods` defines the allowed teaching periods (not exclusions), intersection should happen before `start`/`partial` exclusions, or `classPeriods` should replace `meetingPeriods`. Currently it never reads the array, so custom events with period selections will always teach all meeting periods.
2. `resolveEslDayStatus` (line 2246) now sets `outOfWindow: true` for `no_class` returned when `!inTeachingWindow`. Previous code always returned `outOfWindow: false`. If calendar uses that flag for partial-day “outside window” styling, the change is likely correct, but without a spec line defining `outOfWindow` for partial, this is an unverified behavioral change.
3. `Step5Panel.svelte`: `editClassPeriods` / `customClassPeriods` states (line 126/138, 348, 433) work with checkbox array; `buildSavePayload` preserves them (line 601, 619). However `wizard-state.ts` only parses `classPeriods` into custom event objects (line 515); no validation that values are within P1-P8 range beyond `assertValidEslEvent` (line 1507) which is pre-existing. UI allows any number but button grid only selects 1-8 — OK.

WORD COUNT: ~270 words.
