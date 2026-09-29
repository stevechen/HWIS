# ADR-0022: Workbook-driven ESL roster import and year advancement

## Status

Accepted

## Context

The ESL department keeps its rosters in one Excel workbook per grade, produced by the
school each September. The current admin workflow (issue #131) is cohort-by-cohort and
CSV/TSV-based: an admin creates each cohort by hand, then pastes a flat list of names per
cohort. That model does not match how the department actually works, and it fails in
specific, known ways against the real files.

The four workbooks (one per grade, `xlsx`) were parsed to establish the facts this
decision rests on. Measured, not assumed:

| Grade | Class sheets       | ID range | Students | English names present |
| ----- | ------------------ | -------- | -------- | --------------------- |
| G7    | 20                 | `115xxx` | 408      | all                   |
| G8    | 20                 | `114xxx` | 413      | all                   |
| G9    | 20                 | `113xxx` | 400      | all                   |
| G10   | 11 (`H101`–`H111`) | `5xxxxx` | 495      | all                   |

Each grade workbook contains one sheet per class, plus summary sheets (`Chinese class`,
`ESL class`, `G9 Chinese`, `ESL Class (2)`) that restate the whole grade. For G7–G9 every
class sheet is self-identifying: all of its rows carry a single value in the `ESL Group`
column, which names the class. **Grade 10 is the exception**: one sheet is one Chinese
class, and its rows carry that class's two ESL sections (`H101A` and `H101B`), so a G10
sheet resolves to one _base class_ rather than to one group. Column order differs per grade
— G7 is `Student ID | C Class | Seat No. | Chinese Name | English Name | ESL Group | Email`,
G10 is `ESL group | Std ID# | Class | Name | English Name`.

Six measured facts drive the decision:

1. **The first three digits of a school student ID are the ROC year the student entered
   grade 7**, not their current grade. G7 is `115xxx`, G8 `114xxx`, G9 `113xxx`. A
   student's ID is stable for life; the per-grade disjointness is just entry cohorts
   sitting at different stages. Grade 10 uses a separate scheme (`5xxxxx` this year,
   `4xxxxx` last year, `6xxxxx` next).
2. **Grade 10's A/B section split is carried in the `ESL Group` column** (`H101A` /
   `H101B`), 22 sections of ~20–26 students. The sheet holds both sections. No
   post-import splitting is needed, and the file is the roster of record.
3. **An ID cell is cast to digits whatever Excel stored it as.** Measured across the
   2026-27 files: G7/G8/G9 IDs are text strings (`t=s`), G10's are plain integers
   (`t=n`, `511355`). No float-formatted ID appears in any of them — an earlier
   year's files held `511024.0` and 40 G9 rows as `1130501.0`, so the normalisation
   stays as a defence rather than as a description of these files. A value with a
   fractional part (`511024.5`) is refused rather than truncated, because truncating
   would merge two distinct students. **A value that cannot be cast is reported and
   the import halts at apply**, naming the Excel line, the value found, and the
   form expected, so the admin can fix the cell — every abnormality at once, not the
   first one.
4. **Levels use the five official names** (`Pre-Elementary`, `Elementary`, `Basic`,
   `Intermediate`, `Advanced`). Measured across the 2026-27 files, the `ESL Group`
   column holds the official names throughout, with one exception: G7 carries a bare
   `Pre-Ele` (40 rows) because the department runs a single pre-elementary class and
   so does not number it. The short forms `Inter`, `Ele` and `Adv` appear in _sheet
   names_ (`G8 Inter 1`, `G9 Ele 1`), which are never read for grouping; the alias
   table remains, because a future file may well abbreviate the column. One malformed
   value is present: `G9 Elementary1`, missing a space.
5. **Exactly one row in each of the two levelled workbooks that have one is
   misfiled** — a row whose `ESL Group` names a different class from the
   sheet it sits in. Measured across the 2026-27 files there are **two** such
   rows: `G7 Basic 5` holds a `G7 Elementary 4` (a student moved down a level and
   the column was not updated), and `G8 Inter 1` holds a `G8 Intermediate 2` (the
   same kind of level change). Both are filed by their **column**, which is the
   class of record — the sheet only identifies which sheet it is.

   Grade 9 and grade 10 have none. G9's malformed `G9 Elementary1` is a
   _typo_, not a misfiling: it parses to the same class as `G9 Elementary 1`, so
   the sheet is simply that class and every row in it is already filed correctly.
   G10 is unlevelled, so its groups name base classes rather than levels and the
   question does not arise.

   The fixture unit tests assert these counts by flagging sheets that carry the
   "class of record" reason; G9 and G10 are absent from that list for the reasons
   above, which is the check that this paragraph is still true.

   The workbooks the tests drive are **synthetic** — built by
   `src/lib/esl-roster-fixtures.ts` from the shapes measured here, with invented
   names, IDs and rosters. The measurement is what carries over; no student data
   does. They are generated in memory rather than committed, so there is no file in
   the repository that could hold a real name, and a fixture that cannot change
   underneath its own assertions.

6. **One student appears on two class sheets in the grade 7 workbook** — the
   same ID, C Class and seat on both `G7 Elementary 2` and `G7 Pre-Elementary`. The
   file is otherwise clean, but this makes it unappliable: the importer refuses a file
   in which one student ID appears twice, because applying it would enrol the student
   in one cohort and disable them in the other. The plan blocks and names the ID.
7. **Every sheet is padded to a 1000-row range** while holding fewer than 50
   students. Blank rows are kept rather than dropped, so that a rejected row still
   points at the line Excel shows; reading the padding through as data reported
   10,485 unreadable rows for a clean grade 10 file. Reading therefore stops at two
   consecutive wholly empty rows — not one, so a spacer inside a real class list
   cannot truncate it.

Two live defects in the existing code were surfaced by this measurement and are fixed by
this ADR:

- `ESL_CLASS_NUMBERS` is `['1', '2']`, but the school runs up to **7** classes per level
  (G8 has Intermediate 1–7 and Basic 1–7; G9 has Basic 1–7). The current validator would
  reject most real cohorts.
- `ESL_LEVELS` uses short codes rather than the official level names, and there is no
  alias handling for the workbook spellings.

## Decision

Roster data enters the system by importing the department's own workbook. The workbook is
the class of record; the admin UI is for reviewing and correcting, not for bulk entry.

### Identity

A student is identified by `schoolStudentId`, which is stable for life. Reconciliation is
**scoped to a school year**, because the same ID legitimately has one `esl_students` row
per year (`115xxx` in 2026-27 G8 and again in 2027-28 G8). The existing
`by_schoolStudentId` index already returns many rows, which is what a history-preserving
model requires.

### Deriving the school year from a file

For grade `G` with ID prefix `P`, the entry year is `P + (7 - G)`. For 2026-27 this
yields G7→`115`, G8→`114`, G9→`113`. The year a file belongs to is therefore **derived
from the data, not guessed**.

This replaces the obvious heuristic of "all G7 IDs are new means a new year". That
heuristic carries no information: grade 7 has an entirely new intake every year, so the
signal is true on every September import and on every mid-year re-import alike. It fires
precisely when it must not.

Derivation also fails loudly rather than silently. A file whose rows carry two different
prefixes has had two years merged into one spreadsheet; importing it would scatter
students across cohorts in a way nothing could later reconcile, so it is refused.

- **G7, G8 and G9** may detect a year and prompt on mismatch.
- **G10 never prompts** — its prefix scheme carries no grade arithmetic.
- A mismatch shows the arithmetic to the admin ("these IDs indicate 2027-2028, you are
  on 2026-2027") rather than asserting a conclusion.

### Import pipeline

`parse → normalise → classify sheets → reconcile → dry-run report → atomic apply`

**Parse** identifies columns by header name, never by position, because column order
differs between G7 and G10 and G10 uses different header spellings (`Std ID#`, `Name`).

**Normalise** runs on read, before validation:

- _IDs_ — parse as a number; if integral, store the integer string, so `511024.0`
  becomes `511024`. A value like `511024.50` is rejected rather than truncated, because
  truncating it would merge two distinct students.
- _Levels_ — an alias table maps `Pre-Ele`, `Ele`, `Int`, `Adv` and malformed spellings
  onto the five official names. An unrecognised level is reported, never guessed.
- _English name_ — blank is allowed. Students may arrive without one.

**Classify sheets** — a sheet is a class sheet when its `ESL Group` values resolve to a
single group. **For grade 10 the unit is the base class, not the group**: a G10 sheet holds
both of one base class's sections, so it is a class sheet when its rows resolve to a single
base class (`H101A` and `H101B` are one class; `H101A` and `H102A` are not). Summary sheets
hold many groups — and, for G10, many base classes — so they fail this test naturally, no
maintained exclusion list is needed, and a class sheet the school adds later still works.
A genuinely multi-class sheet is surfaced for review.

**The `ESL Group` column is the class of record, not the sheet name.** Sheet names are
abbreviated and do not round-trip (`G9 Adv 1` holds `G9 Advanced 1`; `G9 Ele 1` holds
`G9 Elementary 1`). The sheet name identifies _which_ sheet; the column identifies _which
class_. This also corrects the three misfiled rows and the `G9 Elementary1` typo
automatically. Disagreements are reported as warnings.

### Reconciliation by grade

|                  | G7           | G8 / G9                       | G10     |
| ---------------- | ------------ | ----------------------------- | ------- |
| Source           | fresh intake | promoted from prior grade     | all-new |
| Matched on       | —            | `schoolStudentId`             | —       |
| Group change     | n/a          | applied, reported             | n/a     |
| Absent from file | n/a          | → `disabled`, reason recorded | n/a     |

**Grade 10 is never matched across years.** Its ID space moves `4xxxxx` → `5xxxxx` →
`6xxxxx`, so a graduating G9 student cannot be linked to a G10 record even in principle.
Treating it as all-new is forced by the data, not chosen as a simplification.

### Reportable changes

The dry-run report is the safety mechanism, and every difference is a distinct category
so the admin can see what they are agreeing to:

- **New** — ID not present in this year's cohort.
- **Disabled** — present in the cohort, absent from the file. Never deleted; the reason is
  recorded so transfer history survives.
- **Level/class change** — the file places the student in a different group.
- **English name change** — the file carries a non-blank name differing from the stored
  one, shown as `old → new`.

English name changes are reported rather than applied silently, because a differing name
may be either a student's genuine mid-year request (which the school does receive, and
which may reach the system through the workbook) or a typo in the spreadsheet. The admin
decides.

This is deliberately asymmetric: the file owns grouping, but a blank name in the file
never erases a name an admin or teacher entered, and a non-blank difference is surfaced
for confirmation rather than applied on sight.

Mid-semester manual level changes are recorded in the audit log and **never** appear in
an import report. Mixing the two sources would leave the admin unable to tell which
action they had just taken.

### Staging, not batch

The four files need not arrive together, because they need not be applied together.

1. The admin uploads whichever files they have. Each is parsed and held staged; nothing
   is written.
2. The school year is derived from any one of G7/G8/G9, checked, and confirmed once.
3. A combined dry-run covers all four grades — staged ones in full detail, absent ones
   marked "not yet provided" with what is still missing.
4. Each file is applied in its own transaction, with its own summary confirmation.

Atomicity _across_ grades is deliberately rejected. One malformed G9 sheet must not block
a valid G7, and a cross-grade transaction would otherwise leave a half-applied year in
which some grades are new and some are old — the ambiguity that per-cohort commits would
also create. All-or-nothing **per file** is free, because Convex mutations are
transactional.

The four-grade picture is a persistent year-status view showing every grade as pending,
staged or imported with counts and timestamps, so the combined summary exists whether or
not the uploads coincide.

### Year advancement

Triggered by derived-year mismatch and confirmed by the admin; there is no separate
manual step.

- **G7 → G8 → G9** — cohorts are copied forward one grade carrying level and class
  number. Students are then reconciled by ID against the arriving file, so the copied
  grouping is a proposal the file corrects.
- **G10** — cohorts are emptied and held ready for the new import.
- **Pre-Elementary** — created only if the intake placement test puts students there.
  The file is the sole source of truth, and its absence means the cohort does not exist
  for that year. Pre-Elementary is decided at G7 intake and carried forward as the
  cohort advances; it is never newly created in G8 or G9.

### Where the parsing happens

**In the browser**, per ADR-0021. A workbook is uploaded a few times a year, so the server
should never see the bytes: parsing 495 rows across four files is bandwidth and execution
time billed against a free-tier quota, and in the browser it is free and instant.

The browser can send anything, so **the apply mutation re-validates server-side** — ID
format, level names, cohort existence and year arithmetic. The rules are pure functions
in `src/convex/shared/esl.ts`, imported by both sides, so validation has one definition
and the parse running twice costs no divergence. This re-validation is a few hundred
indexed reads inside a transaction that was being paid for anyway.

### Staged data storage

**In `localStorage`**, not in Convex. A table would mean writing ~2,000 parsed student
rows to the database to hold data that is either applied moments later or discarded —
real quota spend to store a draft, against ADR-0021. The project already persists
client-side state this way (`src/lib/stores/theme.ts`).

- Store parsed rows only, never the raw file bytes; a base64 `.xlsx` is large and is
  waste once parsed. ~2,000 students is roughly 200 KB against a ~5 MB budget.
- Namespace by school year (`esl-import:2027-2028`) and clear on successful apply, so a
  stale draft is neither clutter nor a small privacy exposure on a shared machine.
- Accepted limitation: staging is per-browser, so drafts do not follow the admin to
  another machine. At this frequency, re-uploading is cheaper than server-side drafts.

### Schema changes

- `esl_students.englishName` becomes **optional** — students may arrive without a name.
- `ESL_CLASS_NUMBERS` widens to **1–7**, matching the classes the school actually runs.
- `ESL_LEVELS` becomes the **five official names**, with an import alias table.
- A `Pre-Ele` group with no number is treated as class number `1`; a number is read from
  the group string when present. This keeps `classNumber` required for every levelled
  grade, so no special case leaks into the indexes and queries that read cohorts. If a
  future year runs two Pre-Elementary classes, `G7 Pre-Ele 1` and `G7 Pre-Ele 2` parse
  naturally.
- `email` is **derived** on read as `s{id}@std.hwhs.tc.edu.tw`. It is a pure function of
  the ID in all four workbooks, so storing it would be a denormalisation that can only
  ever disagree with itself.
- No stored `code` column — it stays derived on reads, so no existing row is invalidated.

## Consequences

- The workbook is the class of record. Manual cohort-by-cohort bulk entry is no longer
  the primary path, which removes the transcription step that made the old workflow
  error-prone.
- The admin cannot import a wrong-year or merged-year file by accident; both are refused
  with an explanation.
- Grade 10 students have no G9-linked history, permanently, because the ID spaces are
  disjoint. This is a real limitation of the school's numbering, not a modelling choice.
- A mid-semester English name correction reaches the system through the next import, and
  is reported rather than applied unseen.
- Staged imports are lost if the admin switches browsers before applying. Deliberate.
- The parse runs in two places and must stay in the shared pure module. Splitting the
  rules between client and server would reintroduce exactly the silent-mismatch class of
  bug this design exists to prevent.
- ESL year advancement is separate from the International `advanceGradesAndClearEvaluations`
  migration in ADR-0006, which handles grade 12 and evaluation clearing. They operate on
  disjoint tables and are not unified.

## Implementation notes

- Workbook reading uses SheetJS (`xlsx`), added as a dependency and imported only in
  browser-side code so it never reaches a server bundle.
- Column detection, ID normalisation, level aliasing, group parsing and the
  year-derivation arithmetic are pure functions in `src/convex/shared/esl_import.ts`
  (the level vocabulary itself stays in `shared/esl.ts`), exercised by unit tests against
  the real workbook shapes (per-grade column order, float IDs, abbreviations, the
  `G9 Elementary1` typo, bare `Pre-Ele`).
- The apply mutation re-validates using those same functions rather than trusting the
  staged payload, and documents its read/write unit cost per ADR-0021.
- `esl_students.englishName` is optional, because a G7 intake arrives before the names
  are filled in. Manual entry still requires one.

## Implementation tickets

Tracked under #120, in dependency order:

- #136 — the apply mutation and the snapshot query it plans against (levelled grades)
- #135 — grade 10, whose sections map to classes rather than cohorts
- #137 — the staging and dry-run UI at `/esl/admin/import`
- #138 — year advancement
- #139 — e2e coverage driven by real workbook fixtures
- #140 — retiring the cohort-by-cohort paste path from #131
