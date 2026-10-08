# T175 findings: Resolve roster when teacher is in class now

Research only — no code changed. All claims cite primary sources below.

## 1. Match rule: reuse `currentEslSlot` + `entries.find` as-is

- Slot resolution is pure and Taipei-localised: `currentEslSlot(now)` → `{day, period} | null`,
  start-inclusive/end-exclusive bounds, null on weekends/between periods.
  `src/routes/esl/admin/users/[userId]/teacher-now.ts:41-49`
- Taipei clock: `Intl.DateTimeFormat('en-US', {timeZone:'Asia/Taipei', …hour12:false})`,
  midnight `24` normalised via `% 24`. `teacher-now.ts:17-29`
- School-day gate: `isSchoolDay` = weekday ∈ `ESL_DAYS` (Mon–Fri). `teacher-now.ts:32-34`,
  `src/convex/shared/esl.ts:394`
- Page already resolves "in class now" as `entries.find(day===slot.day && period===slot.period)`
  over the profile's flattened class meetings; `nextMeetingToday` only when no current entry.
  `src/routes/esl/admin/users/[userId]/+page.svelte:68-80`
- **Reuse as-is.** The roster feature needs only `currentEntry.cls._id` (classId) +
  `currentEntry.cls.cohortId` — both already on the profile row
  (`staff.ts:136-146`). No new match logic; pass the matched classId to the roster query.
- Past-year guard already exists: `isPastYear = displayYear !== schoolYearOf(now)` suppresses
  live status with "applies to {realYear}". `+page.svelte:65-66,288-292`. Roster block must
  obey the same guard (live only when `displayYear === realYear`).

## 2. Roster source: `getRoster`, active-only + shared-roster flag

- Canonical roster query is `esl/classes:getRoster({classId, includeDisabled?})`:
  reads class → cohort → `esl_students by_cohortId take(500)`, filters `status==='active'`
  unless `includeDisabled`, sorts via `compareEslStudents`. `src/convex/esl/classes.ts:111-143`
- Roster is the **cohort's, not the class's**: G7/G8 CLIL+Comm resolve to same students.
  `classes.ts:103-107`
- `sharedRoster: isSharedRosterGrade(cohort.grade)` (true for grades 7/8 only; grade 10 A/B
  are separate cohorts/rosters per ADR-0023). `classes.ts:139`, `src/convex/shared/esl.ts:255-257`
- Sort: active-first, then English (fallback Chinese), then Chinese name tiebreak.
  `src/convex/shared/esl.ts:1058-1065`. `listByCohort` shares the same filter+sort.
  `src/convex/esl/students.ts:68-86`
- **Recommendation:** call `getRoster({classId: currentEntry.cls._id})` with default
  `includeDisabled=false` (teachers see current enrolment). Render `sharedRoster` as a label
  (e.g. "shared with sibling class") rather than merging anything — the query already
  returns the shared set. Do NOT use `listByCohort` directly; `getRoster` adds the
  class/cohort context and the shared flag at the same cost.

## 3. Overlap tiebreak: none needed — schedule gate forbids it

- `entries.find` returns the first class matching `(day, period)`. Two classes of the same
  teacher at one slot would both match; order is profile sort
  (grade → classNumber → type). `staff.ts:151-156`
- But that state cannot be saved: `findScheduleProblems` reports `teacher` kind
  ("same teacher at this time, in a different room") and `setSchedule` refuses the write.
  `src/convex/shared/esl.ts:725-752`, `src/convex/esl/classes.ts:820-835`
- Legacy/conflicting data could still produce it (gate added later; conflicts were advisory).
  **Tiebreak recommendation:** deterministic first-by-profile-sort (i.e. keep `find` as-is);
  optionally surface a "schedule conflict" note rather than inventing priority. No new rule
  needed for the normal case.

## 4. Live vs snapshot: live reactive query, no snapshot

- Page ticks `now` every 60s (`setInterval`, `+page.svelte:48-54`); `slot`/`currentEntry`
  are `$derived` so the block flips automatically at period boundaries.
- Convex `useQuery` is reactive: roster rows update if enrolment changes mid-lesson.
  No snapshot/copy needed — the block is a read view, not an attendance record.
- Clock skew note: `currentEslSlot` uses client clock converted to Taipei; boundary-exclusive
  rule means exactly `:00` belongs to the break. `teacher-now.ts:36-40`. A 60s tick can lag
  the flip by up to a minute — acceptable for a roster display; do not shorten the tick for
  this feature.
- `schoolYearOf` uses **local** `getMonth()/getFullYear()` (Aug+ → new year),
  NOT Taipei time — edge-case drift near the Aug 1 boundary for non-Taipei clients.
  `src/routes/esl/admin/classes/staging.ts:125-128`. Out of scope but noted.

## 5. Empty states: hide the block when not in class

- Current page states: past-year notice / "In class now — {name} · {room}" /
  "Not currently in class" + next-or-weekend-or-done. `+page.svelte:288-310`
- **Recommendation:** render the roster block ONLY when `currentEntry && !isPastYear`.
  All other states (not-in-class, past year, unscheduled/roomless class, archived filtering
  in `getProfile`) hide it — no "empty roster" placeholder inside the block.
- Roster-level empties (class with zero active students): `getRoster` returns `students: []`;
  show a one-line "No active students enrolled" inside the block (cohort freshly created /
  all transferred out). `classes.ts:135-141`
- Room may be null (`roomLabel` → "Room not set", `+page.svelte:94-96`); roster does not
  depend on room, so still show.
- `getProfile` already excludes archived classes/cohorts (`staff.ts:127`) — no extra filter.

## 6. Per-tick query cost + indexes

- `now` tick is **client-only**; it re-derives but fires no new query unless args change.
  The roster query subscribes once per `currentEntry.cls._id` change (≤ a few times/day),
  not per tick. No per-minute read cost.
- `getRoster` cost (documented in code): 2 point reads + 1 indexed take of cohort roster.
  `classes.ts:109`. Index: `esl_students.by_cohortId`. `src/convex/schema.ts:444-489`
  (also `by_cohortId_schoolStudentId` exists but unused here).
- `getProfile` cost: 1 user read + 1 `esl_classes.by_teacherId` take(200) + batched cohort
  gets + 1 `esl_class_meetings.by_classId` collect per class + 1 `esl_cohorts.by_year` take(100).
  `staff.ts:81-83`. Indexes: `by_teacherId` on `esl_classes` (`schema.ts:344-345`),
  `by_classId` + `by_year_day_period` on meetings (`schema.ts:390-391`).
- Roster size bounded: `take(500)`, real cohorts are tens of students.
  `classes.ts:125-128`, `students.ts:76-80`
- No new index needed. If a future "who is in class now across all teachers" query appears,
  `esl_class_meetings.by_year_day_period` (`schema.ts:391`) is the serving index — but that
  is not this ticket.

## Implementation pointer (for the implementing ticket)

1. In `+page.svelte`, after `currentEntry`: `const rosterQuery = useQuery(api.esl.classes.getRoster,
() => currentEntry && !isPastYear ? { classId: currentEntry.cls._id } : 'skip')`.
2. Render block gated on `currentEntry && !isPastYear && rosterQuery.data`; sort/filter already
   server-side. Show `sharedRoster` label when true.
3. No backend change required.
