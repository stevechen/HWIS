# T179 findings: Spike semester + event data model (derived end, partial bounds)

Research only — no code changed. All claims cite primary sources below.

## 0. Baseline: no semester/event tables exist today

- A repo-wide search for `esl_semester|esl_event|school_event|semester_|calendar_event`
  returns nothing. `src/convex/schema.ts:1-493` has no semester or calendar-event
  table; the ticket's two tables are genuinely new.
- The closest in-repo event precedent is `house_events`
  (`startDate`/`endDate` as ms numbers, `by_startDate` index).
  `src/convex/schema.ts:238-253`
- The scheduler's assignment-reminder ranges live in the adjacent
  `HWIS-Class_Scheduler` repo (map #178 notes it as behaviour reference only);
  no reminder/range-event code exists in this repo, so range semantics have no
  in-repo precedent to conform to.

## 1. Semester rows: new table keyed by school year + term, `startDate` only

- **Key.** New table (e.g. `esl_semesters`) keyed by `(year, term)` with
  `year` in the existing `YYYY-YYYY` school-year form and `term ∈ {S1, S2}`.
  The `YYYY-YYYY` form is the established convention: cohorts store it
  (`src/convex/schema.ts:277-278`), validate it with `isValidSchoolYear`
  (`src/convex/shared/esl.ts:982-985`), and serve it through `by_year` /
  `by_year_grade` (`src/convex/schema.ts:305-309`).
- **Explicit `startDate` only — confirm no end-date field.** End is derived as
  the max date of exam-type events in the semester, computed at read time, never
  stored. This follows the codebase's derived-not-stored precedent (cohort
  `code`/`label` are derived on read precisely so no stored column can drift:
  `src/convex/esl/cohorts.ts:146-155`). The one sanctioned exception —
  meetings denormalizing `year` — is named and justified in
  `src/convex/schema.ts:361-371` (ADR-0027); a stored semester end would need
  the same level of justification and has none, since exams move.
- **How S2 start floats until exams are entered.** Before any exam event exists
  the derived end is null, so the teacher join clamps the visible window to
  `startDate..today` (or shows "finals TBD") rather than inventing a bound.
  Entering the first final-exam event pins the end; moving it shifts the end
  with no migration. The S1-then-S2 workflow stays expressible: the S2 row is
  created after S1 ends with its own explicit `startDate`, and the boundary
  invariant is `S1.derivedEnd < S2.startDate` (warn, don't refuse, when exams
  move across it — same advisory-then-gate shape as `findScheduleProblems`).
- **Relation to `schoolYearOf`.** `schoolYearOf` (Aug+ → new year, local
  `getMonth()/getFullYear()`, NOT Taipei time) remains the function that maps a
  wall date to a `YYYY-YYYY` year key.
  `src/routes/esl/admin/classes/staging.ts:125-128`. Semester rows reuse it as
  their year key; the local-vs-Taipei edge-case drift near Aug 1 (already noted
  in `.wayfinder/t175-findings.md` §4) applies unchanged. Date args should be
  passed in as strings (per Convex query guidelines: never read the wall clock
  inside a query), so prefer `YYYY-MM-DD` date strings over ms numbers for the
  new tables — unlike `house_events`' ms `startDate`/`endDate`.
- **Relation to `esl_cohorts.by_year` and meetings' denormalized `year`.**
  `by_year` stays the cohort serving index (`list` takes 100 under it:
  `src/convex/esl/cohorts.ts:93-99`); meetings keep their stored `year` as the
  join key (`meeting.year == semester.schoolYear`), which is also what makes
  the conflict index `by_year_day_period` (`src/convex/schema.ts:391`) usable
  for the teacher join without a two-hop lookup. No change to either.

## 2. Event rows: typed single-date rows, ranges only for reminders, one partial per date

- **Type enum.** A `v.union` of literals, following the `esl_classes.type`
  precedent (`CLIL|Comm|G9|H10A|H10B`, `src/convex/schema.ts:317-325`):
  `{task_due, homework_due, off, no_class, partial, exam, start_school}` plus an
  optional `note` (precedent: availability's optional free-text `note`
  "for the human reading the picker", `src/convex/schema.ts:423-428`).
- **Single date vs inclusive range — confirm.** Date-specific types (`exam`,
  `partial`, `off`, `no_class`, `start_school`) carry one `date` (`YYYY-MM-DD`).
  Only reminder types (`task_due`, `homework_due`) may carry an inclusive
  `[startDate, endDate]` range, mirroring the scheduler's assignment-reminder
  ranges — but that behaviour lives outside this repo (§0), so the range form
  must be specified fresh here: recommend optional `endDate` defaulting to
  `date` (single-day), keeping one row shape for all types.
- **Partial bounds — confirm one row per date max.** A partial carries optional
  `startPeriod`/`endPeriod` (period numbers 1–8 validated by `isEslPeriod`,
  `src/convex/shared/esl.ts:446-451`, against the bell schedule
  `ESL_PERIODS`, `esl.ts:428-437`). Uniqueness is enforced the way
  `cohorts.create` does it — Convex has no unique constraints, so the mutation
  does an indexed lookup on `by_semester_date` first and refuses a second
  partial for the date (precedent: "1 indexed uniqueness lookup + inserts",
  `src/convex/esl/cohorts.ts:189-198` and cost comment at `:186-187`).
  Absent `startPeriod`/`endPeriod` means the whole day is partial (bounds
  unknown yet), which is also the state that lets S2 float (§1).

## 3. Evaluations link: stay separate — do not key or rename

- `evaluations.semesterId` is a free-form `v.string()` with no FK, no index,
  and no server-side validation (`src/convex/schema.ts:147`;
  `src/convex/evaluations.ts:59-95` takes `semesterId: v.string()` and stores
  it verbatim). It is derived **client-side** in
  `src/routes/evaluations/new/+page.svelte:16-23` as `` `${year}-H1|H2` `` with
  a Feb/Sep cut (`month < 2 || month > 8 → H1`) — a _third_ year convention
  alongside `schoolYearOf` (Aug cut) and the ESL `S1/S2` terms.
- **Recommendation: stay separate.** Three reasons: (a) evaluations belong to
  the International bounded context — "ESL students have … no point
  evaluations … isolated from International" (`src/convex/schema.ts:255-260`,
  ADR-0012) — so an ESL semester entity must not become their key; (b) the
  vocabularies already differ (`H1/H2` vs `S1/S2`), so keying would force a
  rename of every historical International row; (c) history flows through
  restores verbatim (`semesterId: evaluation.semesterId`,
  `src/convex/shared/restore_plan.ts:287`), so a rename would break
  restore-compat. If a link is ever needed, add an _optional_ semester
  reference later; this map needs none.

## 4. Permissions: `requireEslAdmin` writes, `requireEslStaff` reads, super passes all

- Admin setup mutations (semester/event create/edit/delete) go behind
  `requireEslAdmin`, matching every existing ESL setup write:
  `cohorts.create` (`src/convex/esl/cohorts.ts:200`),
  `classes.setSchedule` (`src/convex/esl/classes.ts:783`),
  `classes.setStatus` (`classes.ts:700`). Teacher views (the meeting+event
  join) go behind `requireEslStaff`, matching every existing ESL read:
  `getRoster` (`classes.ts:117`), `cohorts.list` (`cohorts.ts:91`).
- `requireEslAdmin` = `isEslAdmin(user) && status === 'active'`
  (`src/convex/auth.ts:391-397`); `isEslAdmin` = super OR
  `departmentRoles.esl === 'admin'`
  (`src/convex/shared/authorization.ts:155-158`). So the owner (super) passes
  every gate by construction, an ESL-admin edits, an ESL-teacher reads but
  cannot set up, and an International-only admin gets neither (explicit
  `departmentRoles` always wins over the legacy global role,
  `authorization.ts:126-138`). No new role needed.

## 5. Cost (ADR-0021 quota-first): two indexes, bounded teacher join

- **Indexes.** `by_year_and_term` on `(year, term)` (uniqueness + single-row
  semester fetch) and `by_semester_date` on `(semesterId|year+term, date)` for
  the range take. Both follow the naming rule (all index fields in the name;
  Convex guidelines) and the `by_year*` family precedent
  (`src/convex/schema.ts:305-309`).
- **Teacher join cost (per subscription change, not per tick).** 1 indexed
  meetings read (`by_year_day_period` or `by_classId`,
  `src/convex/schema.ts:390-391`) + 1 indexed events take under
  `by_semester_date` + the existing roster cost (2 point reads + 1 indexed
  take, `src/convex/esl/classes.ts:109`). Meetings are "three rows per CLIL,
  two per everything else, across a few hundred classes a year"
  (`schema.ts:356-358`); events are tens per semester. All `.take(N)` under
  indexes, no `.collect()` on a public path — passes the ADR-0021 checklist
  (`docs/adr/0021-quota-first-convex-design.md:62-75`). Per t175 §6, the
  client clock tick re-derives without refiring queries, so the join
  re-subscribes only when the derived semester window actually changes.
- **Write cost.** Semester/event writes mirror `cohorts.create`: 1 indexed
  uniqueness lookup + N inserts (`cohorts.ts:186-187`); partial-per-date
  refusal adds one lookup. Event-driven (mutation on admin write, reactive
  subscription on read) per ADR-0021 heuristic 3 — no polling, no counter row
  needed at this read volume.

## Implementation pointer (for the implementing ticket)

1. New tables `esl_semesters { year, term: S1|S2, startDate: YYYY-MM-DD }`
   (no `endDate`) + `esl_events { semesterYear, semesterTerm, date, endDate?,
type: 7-literal union, note?, startPeriod?, endPeriod? }`; indexes
   `by_year_and_term`, `by_semester_date`.
2. Read helper `semesterEnd(semester, examEvents): date | null` = max exam
   date, null when no exams — the only place the derived end is computed.
3. Teacher join query (`requireEslStaff`): meetings via `by_year_day_period`
   - events via `by_semester_date` range take within
     `[startDate, derivedEnd ?? today]`; partial-uniqueness enforced in the
     event-write mutation via a `by_semester_date` lookup.
4. Leave `evaluations.semesterId`, `schoolYearOf`, `by_year`, and meetings'
   denormalized `year` untouched.
