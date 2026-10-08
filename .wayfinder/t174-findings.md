# T174 findings — ESL evaluation data-model spike (attitude scores)

Research-only. No code changed. All claims cite primary sources in-repo.

## 1. Table shape: new `esl_evaluations` (do not reuse `evaluations`)

- International `evaluations.studentId` is `v.id('students')` (`src/convex/schema.ts:141`) — it cannot point at `esl_students`. Separate ESL graph confirmed by schema comment (`src/convex/schema.ts:258-260`: "ESL students have no houses, no CAS tags and no point evaluations").
- Proposed row (mirrors `evaluations`, `src/convex/schema.ts:140-158`):
  - `eslStudentId: v.id('esl_students')` — required. Points at the student, not the cohort.
  - `teacherId: v.id('users')` — required (owner for edit/delete gating; same as `src/convex/evaluations.ts:87`).
  - `cohortId: v.id('esl_cohorts')` — **required snapshot** (see §2).
  - `value: v.number()` — required, app-validated to ±1/±2 (see §3).
  - `categoryId: v.id('esl_eval_categories')` — required (see §3).
  - `details: v.optional(v.string())` — optional (one-tap award; International requires it at `schema.ts:145`, ESL relaxes per ticket).
  - `timestamp: v.number()` — required (`Date.now()` at write, `src/convex/evaluations.ts:78`).
  - `year: v.string()` — required denormalized `YYYY-YYYY` (see §4).
  - `semesterId/termId: v.optional(v.string())` — optional free-form hook for future admin-defined terms (see §4).
  - `batchId: v.optional(v.string())` — one `crypto.randomUUID()` per create call (`src/convex/evaluations.ts:81`); powers batch undo.
  - `e2eTag: v.optional(v.string())` — every ESL table carries it for teardown (`src/convex/schema.ts:299`, `:388`, `:486`).

## 2. Cohort snapshot: snapshot `cohortId`, never `(day, period, room)`

- ADR-0025 mandates it: "when an ESL performance record is built, it **must snapshot its own `cohortId`**" because level transfer patches `esl_students.cohortId` in place (`docs/adr/0025-record-the-chinese-class-per-esl-student.md:129-135`).
- ADR-0027 explicitly excludes the slot: "An evaluation does not snapshot its `(day, period, room)`… a record frozen against the old slot would be wrong rather than historical" (`docs/adr/0027-esl-class-day-period-and-room.md:244-251`).
- Note: ADR-0025 predates `level` on grade-10 cohorts; the transfer mechanics it assumes still hold (patch-in-place), and ADR-0023 keeps one-roster-per-cohort (`docs/adr/0023-esl-cohort-shape-junior-vs-senior.md:65-66`).

## 3. Categories: new ESL-only table, ±1/±2 with negatives allowed

- Reuse of `point_categories` (`src/convex/schema.ts:130-138`: `name, meritCriteria?, demeritCriteria?, casAlignment?`) is blocked on two grounds: (a) ticket constraint "no changes to International `point_categories`", (b) ESL has no CAS/houses (`src/convex/schema.ts:258-260`; map out-of-scope: "Houses, CAS alignment, leaderboards — ESL has none").
- Proposed `esl_eval_categories { name, meritCriteria?, demeritCriteria?, e2eTag? }` — same shape minus `casAlignment`. Seed set (which behaviors) is explicitly out of scope here (map "Not yet specified": ESL category set).
- Value range: domain vocabulary fixes Evaluation value at "-2, -1, +1, +2" (`UBIQUITOUS_LANGUAGE.md:43`); `evaluations.create` takes free `v.number()` (`src/convex/evaluations.ts:62`) with range enforced at app layer. Recommend same: `v.number()` + validator for ±1/±2, **negatives allowed** (demerit side of attitude; seed behaviors decide the labels, not the range).

## 4. Year/semester: denormalized `year` + optional term hook

- Precedent for stored `year`: `esl_class_meetings.year` is "the one deliberate exception" to derive-don't-store, because conflict queries need `(year, day, period)` indexed (`docs/adr/0027-esl-class-day-period-and-room.md:110-118`; `src/convex/schema.ts:359-392`). Same logic: term-end aggregation needs `by_year` without a meeting→class→cohort join.
- International uses free-form `semesterId: v.string()` (`src/convex/schema.ts:147`). Recommend `year: v.string()` required (validated by `isValidSchoolYear`, `src/convex/shared/esl.ts:983-985`) + `termId: v.optional(v.string())` free-form; a future admin-defined term table maps onto these rows by backfilling `termId`, never by rewriting `year` (map: "no history rewrite").

## 5. Audit + indexes + quota cost (ADR-0021)

- Audit: mirror `evaluations.create/update/remove` — one `audit_logs` row per evaluation row with `targetTable: 'esl_evaluations'` (`src/convex/evaluations.ts:99-114`, `:144-157`, `:573-581`). Follow `audit_logs` schema (`src/convex/schema.ts:115-128`) + its `by_target` index.
- No snapshot refresh: `scheduleSnapshotRefresh` exists only because TV boards full-scanned `evaluations` (`src/convex/evaluations.ts:32-40`; ADR-0020). ESL has no boards, so no refresh/snapshot table.
- Indexes (mirror `evaluations` at `src/convex/schema.ts:153-158` plus ESL needs): `by_eslStudentId`, `by_teacherId`, `by_cohortId`, `by_year`, `by_categoryId`, `by_e2eTag`. Aggregation reads `by_eslStudentId` or `by_year` with `.take(N)`; roster fan-in batches via `Promise.all(ctx.db.get)` per ADR-0021 rule 2 (`docs/adr/0021-quota-first-convex-design.md:32-33`; example `src/convex/esl/classes.ts:48-64`).
- Cost per write: 1 category get + N inserts + N audit inserts (same as `evaluations.create` loop, `src/convex/evaluations.ts:84-115`); reads stay O(roster), never O(table) — checklist at `docs/adr/0021-quota-first-convex-design.md:62-75`.

## 6. Permissions: owner-teacher + ESL-admin, no locking

- Gate: `requireEslStaff` / `requireEslAdmin` (`src/convex/auth.ts:383-397`) — active users with `departmentRoles.esl`, super passes all. Every ESL read/write already uses these (`src/convex/esl/students.ts:74`, `:139`; `cohorts.ts:91`, `:200`).
- Ownership shape mirrors International: create = active staff (`requireEvaluationCreate`, `src/convex/shared/authorization.ts:301-305`); edit/delete = authoring teacher, admin/super override (`requireEvaluationEdit/Delete`, `src/convex/shared/authorization.ts:268-293`). ESL version: create `requireEslStaff`; edit/delete owner-teacher **or** ESL-admin/super.
- No locking: explicitly out of scope (ticket constraints; map "Evaluation-week locking — explicitly ruled out"). Do NOT import `isEditable`/`lockCutoffFor` (`src/convex/shared/evaluation_week.ts:48-50`; ADR-0001). Records are append-only with owner/admin correction only.
