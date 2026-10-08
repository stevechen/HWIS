# T180 findings: Survey scheduler list-view logic to re-express as a Convex join

Research only — no code changed. All claims cite primary sources below.
Scheduler paths are in the adjacent `HWIS-Class_Scheduler` repo; HWIS paths are in this repo.

## 1. Pipeline map: which stages survive as join logic

Scheduler pipeline today (`HWIS-Class_Scheduler/src/lib/schedule/index.ts:56-86`):

1. **TSV parse + calendar expansion — stays behind.** `getDates` splits TSV lines,
   drops empty/invalid-date lines, then fills every date from min to max, skipping
   Sundays and skipping Saturdays unless the note carries a make-up date
   (`getAllClassDays.ts:58-122`). The join replaces all of this: meeting weekdays
   come from `esl_class_meetings` rows (ADR-0027), and the date range comes from the
   semester row (explicit `startDate`, end derived from the last final-exam event —
   interface assumed from sibling #179, not depended on here).
2. **Weekday slicing — survives, re-sourced.** `GENERIC_CLASS_DAYS` keeps only days
   whose `weekday` is in the checked set (`getClassDaysByType.ts:108`). In HWIS the
   weekday set is not hand-picked: it is the union of the teacher's meeting days
   from `getProfile` (`src/convex/esl/staff.ts:128-135`). The checked-days UI (if
   kept) becomes a client-side filter over meeting weekdays, not an input to the
   query.
3. **Type slicing — survives in reduced form (see §3).** `visibleEvents` keeps
   untyped events plus events matching the selected type, with `G9` also seeing
   `Comm` (`getClassDaysByType.ts:119-131`). The per-type filter is replaced by the
   teacher assignment (their classes only); the untyped-events-are-global rule
   should survive as "untyped/global events show for every teacher".
4. **Reminder-range collapsing — survives, retargeted (see §2).**
   `applyReminderRanges` runs before slicing (`getClassDaysByType.ts:107`).
5. **Oral-exam auto-marking — stays behind.** The two class days before each term's
   first exam are rewritten to `Oral Exam` (skipped for `CLIL`; `H` skips the first
   two terms) (`getClassDaysByType.ts:147-194`). This is derived display data with
   no counterpart in the meetings/event model; if teachers need it, the sibling
   event model should carry explicit `exam` rows, not a positional rewrite. Flagged
   for the per-type effects ticket, not decided here.
6. **G9 graduation cutoff — stays behind as logic, survives as semester end.**
   Days after the first `Graduation` description are dropped for `G9`
   (`getClassDaysByType.ts:112-116,132-137`). Description-scanning goes away; the
   equivalent is the derived semester end (max exam-event date) from #179.
7. **Countdown rendering — survives, re-based on exam events.** Per-term class
   totals are counted between exam-day boundaries, then assigned descending with
   `Off`/`Exam` days getting `null` (`getClassDaysByType.ts:196-264`). The counting
   rule transfers; the term boundaries transfer to semester + exam events instead
   of positional `examDays[0..4]` indexes.
8. **Row styling — survives as display rules.** Off rows greyed, exam rows red
   (`+page.svelte:262-275`). No data logic, just CSS classes keyed off the same
   predicates.

## 2. Reminder ranges: transfer to task-due/homework-due, not to exams

- **Current rule.** Events matching `REMINDER_PATTERN`
  (`passport|recording|wb|workbook|unit N test`, `getAllClassDays.ts:20`) are grouped
  by normalized `type|description|note` key (`getAllClassDays.ts:30-34`); groups with
  > 1 occurrence collapse to a single display on the **latest** day inside
  > `[start, end]` that matches the class weekdays and is not Off
  > (`getClassDaysByType.ts:32-70`). All other occurrences are stripped
  > (`getClassDaysByType.ts:72-96`).
- **Transfers to `task due` / `homework due`.** The collapsing pattern (repeated
  reminders for one deliverable → show once on the latest eligible class day) is
  exactly the semantics those two event types need. The key should become an
  explicit event identity (e.g. same title/note or a shared id from the sibling
  model) rather than a normalized-text match, and eligibility should be
  "a day this teacher meets that class and the day is not off/no-class" instead of
  "weekday in the checked set".
- **Does NOT transfer to exams.** Scheduler exams are date-specific: `examDays` are
  positional anchors (`examDays[0], [2], [4]` start each term's countdown window and
  oral-exam search, `getClassDaysByType.ts:140-166,204-222`) and every exam day keeps
  its own row with `countdown: null`. Collapsing exams into a range would destroy
  the term-boundary logic. Sibling assumption: `exam` events stay one row per date.
- **Untyped-event nuance.** Ranged repeats are stripped except when
  `event.type === ''` — untyped (global) reminders survive on _every_ day _and_ the
  collapsed copy appears on the target (dedupe by description+note on the target
  day only, `getClassDaysByType.ts:73-88`). If the join keeps a notion of
  global/untyped events, this "show everywhere" behavior (not the collapse) is what
  transfers for them.

## 3. Class-type toggle: does not survive

- Today the page offers `CLIL / Comm / G9 / H` radios (`+page.svelte:153-162`,
  `classTypes.ts:10-15`) with a grade map (`CLIL/Comm → G7/8`, `G9 → G9`, `H →
Senior`, `classTypes.ts:17-25`) feeding `getGradeForClassType` in `deriveSchedule`
  (`schedule/index.ts:70`) and the download-name builder (`schedule/index.ts:25-35`).
- HWIS counterpart: a teacher's assignment is already scoped — `getProfile` reads
  `esl_classes.by_teacherId`, filters to active classes in active cohorts for the
  year, and attaches each class's meetings (`src/convex/esl/staff.ts:115-156`).
  Class `type` (`CLIL/Comm/G9/H10A/H10B`) and cohort grade ride each row
  (`staff.ts:136-146`); meetings-per-week per type is enforced in ADR-0027's table
  (`docs/adr/0027-esl-class-day-period-and-room.md:39-53`).
- **Recommendation:** no toggle in the teacher list view — it shows only that
  teacher's meetings. The toggle existed because one TSV file serves every class;
  the join is already per-teacher. Type/grade remain useful only as row labels (and
  the `G9`-sees-`Comm` rule in §1.3 as an event-visibility rule), never as a view
  switcher.

## 4. Off semantics: `off` + `no class` both map, suppression without removal

- **Current predicate.** `isOffDay(desc)` = trimmed-lowercased description is exactly
  `'off'` or _contains_ `'no class'` (`getClassDaysByType.ts:11-15`). Reminder
  eligibility re-checks per-event with the same predicate plus a `no class`
  substring test (`getClassDaysByType.ts:27-30`).
- **Suppression effects today (display, not deletion):**
  - Off days are never reminder-range targets (`isEligibleReminderDay`).
  - Off days are never oral-exam marks (`getClassDaysByType.ts:173`).
  - Off days are excluded from per-term class totals and get `countdown: null`
    (`getClassDaysByType.ts:224-230,253-258`).
  - Off rows are still listed, greyed out (`+page.svelte:262,267`).
- **Mapping to the sibling enum** (`off` vs `no class` as distinct types, per #179 —
  low-resolution reference only): both map to `isOffDay == true`. The scheduler
  itself treats them identically (one predicate covers both), so the join should
  treat `off` and `no class` events identically for suppression purposes. Any
  semantic difference between the two (school-closed vs class-cancelled) is the
  sibling ticket's decision; this survey assumes only that both suppress.
- **What must not be lost:** suppression-without-removal. Off rows stay visible
  (greyed) so the countdown visibly skips them; deleting them would renumber the
  countdown silently.

## 5. Drop list: what stays behind with the TSV files

- **TSV files + dynamic import.** `$lib/data/<prefix>-schoolEvents.ts` modules
  loaded via `loadSchoolEventsText` with missing-module detection
  (`schedule/index.ts:95-139`). No port — the join is the data source (settled).
- **School-year prefix machinery.** `getSchoolYearAndSemesterPrefix` (Jan–Jul → S2
  of prior–current; Aug–Dec → S1, `schoolYear.ts:1-21`) and `buildScheduleName`
  (`"26-27 S1 Junior CLIL schedule"`, `schedule/index.ts:25-35`). The prefix picked
  the TSV file; the derived end + `esl_cohorts.by_year` year model replace it.
- **CSV download + filename stem.** Tab→comma blob download named
  `${schedule.name}.csv` (`+page.svelte:110-138`) and the `#\tDate\tDescription\tNote`
  TSV output envelope (`schedule/index.ts:75-81`, covered by the download smoke test
  `tests/integration/schedule/download.spec.ts:3-18`). Export is out of scope for
  the teacher view; if wanted later it is a new feature, not ported logic.
- **Copy-to-clipboard** (plain + alt-key formatted, `+page.svelte:68-108`). Same
  reasoning as CSV.
- **Saturday make-up hack.** Note-field date regex rewrites a Saturday's weekday
  (`getAllClassDays.ts:95-108`). Meetings are Mon–Fri by schema
  (`src/convex/schema.ts:372-379`, ADR-0027); no Saturday concept transfers.
- **Sunday skipping.** `isSunday` exclusion (`getAllClassDays.ts:90`) is subsumed by
  the Mon–Fri meeting model.
- **Positional exam indexing.** `examDays[0]/[2]/[4]` term anchors and the
  `examDays.length === 0` early-return (`getClassDaysByType.ts:140-145`) are
  replaced by semester + typed exam events.

## 6. Join sketch (for the implementing ticket; interface assumed from #179)

1. Teacher's meetings: existing `getProfile({userId, year})` rows
   (`staff.ts:115-156`) → `(classId, type, room, day, period)`.
2. Semester events for the year/term via the sibling model's date index
   (assumed: `by year+term`, `by date`; quota-first per ADR-0021 —
   `docs/adr/0021-quota-first-convex-design.md`).
3. Client (or a new query) composes: for each meeting weekday in term order, overlay
   that date's events; apply §2 collapsing for `task due`/`homework due`; apply §4
   suppression for `off`/`no class`; count down remaining per-class meetings to the
   term's exam boundary per §1.7.
4. No new index on meetings is needed: `by_classId` (per-teacher fan-out) and
   `by_year_day_period` already exist (`src/convex/schema.ts:390-391`).
