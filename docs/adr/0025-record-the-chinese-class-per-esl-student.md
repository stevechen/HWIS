# ADR-0025: The Chinese class is recorded per ESL student

## Status

Accepted. Supersedes rule 5 of [ADR-0023](0023-esl-cohort-shape-junior-vs-senior.md),
whose reasoning stands and whose conclusion does not.

## Context

The Communication Slip — the "Slip" tab — is not built yet. It is a slip a teacher hands
to a student to take to a member of staff, and for an ESL teacher the member of staff is
almost never another ESL teacher: it is the student's **Chinese homeroom teacher**. The
slip therefore has to carry the homeroom, or the teacher cannot act on it. Teachers and
admins also need it to talk to the right homeroom teacher about a student.

The workbooks have always carried the fact. The levelled grades have a `C Class` column
and grade 10 a `Class` column (ADR-0022), and the import read past it and discarded it —
`detectColumns` had no alias for it and `esl_students` had no field to put it in.

ADR-0023 rule 5 said not to. Its reasoning was: "Chinese-class composition is
deliberately not stored for grades 7–9. Those classes are mixed across Chinese
homerooms by design, so recording a single Chinese class for one would be a
fabrication." That reasoning is correct about a **class** and wrong about a **student**.
A cohort of `G8 Intermediate 2` genuinely draws from three or four homerooms, so no
single homeroom describes the class. But each of its twenty students is in exactly one
homeroom, and that is a fact about them, not about the group. Recording it per student
fabricates nothing; recording it per class did.

The two claims have to stay separated, because conflating them is what rule 5 did. What
this decision does **not** change: an ESL class is still not a Chinese class, and a
cohort is still not identified by a homeroom in grades 7–9.

## What the school system decides, and what the database stores

A homeroom's name is its grade's marker plus a two-digit class number:

| Grade | Marker | Example |
| ----- | ------ | ------- |
| 7     | `J1`   | `J101`  |
| 8     | `J2`   | `J201`  |
| 9     | `J3`   | `J301`  |
| 10    | `H1`   | `H101`  |

`J` is Junior; senior high uses the 高一 marker `H1`, which the code already read for
grade 10 class names (`grade10ClassName`). The marker is a **rule of the school
system**, not a shape measured from one workbook — which is what makes it derivable.

And it does not have to be stored. A student's grade is already known: it is on the
cohort they belong to. So the marker is redundant against a fact the system holds, and
only the two-digit number is kept:

```
stored        derived at read time
'01'     →    chineseClassCode(7, '01') === 'J101'
'01'     →    chineseClassCode(9, '01') === 'J301'
```

This follows ADR-0022's own premise — anything derivable is derived, so a naming
convention the school can change without notice is not baked into several hundred
stored strings. It also means the derivation doubles as a **check**: a `C Class` cell
reading `J201` in a grade 7 workbook is provably wrong, which is an error the previous
model could not detect at all.

## Decision

**Store `chineseClass` on `esl_students` as the two-digit class number, zero-padded, and
rebuild the full name on read with `chineseClassCode(grade, classNumber)`.**

1. **Only the school's own full form is accepted** — `J1nn`, `J2nn`, `J3nn`, `H1nn`. A
   bare `1`, a bare `701`, or `J1` is refused. In `701` the `7` could be the grade or the
   first digit of the class, and a silent misread files a student in a homeroom they are
   not in — the one error on this field that nothing downstream would catch, because
   every other check is about the ESL class.

2. **A marker that contradicts the file's grade refuses the file.** Named as a check
   rather than coerced into a value.

3. **A sheet with no Chinese-class column is `unreadable`**, reported once per sheet. The
   alternative is 400 identical row rejections burying the real problem.

4. **A grade 10 row whose homeroom disagrees with its own cohort refuses the file.** A
   G10 cohort _is_ one Chinese class by construction (ADR-0023), so the `Class` column
   and the `H1nn` group are the same fact said twice; a disagreement means one is a typo
   and there is no basis for choosing which.

5. **A misfiled `ESL Group` row now refuses the file, where ADR-0022 imported it with a
   warning.** This reverses that decision. The two rows measured across the 2026-27
   workbooks (`G7 Basic 5` holding a `G7 Elementary 4`, `G8 Inter 1` holding a
   `G8 Intermediate 2`) are typos the department will fix. A wrong ability band is
   silent — every count still adds up and the roster is quietly wrong — so the workbook
   is fixed at source rather than adjudicated by a rule that guesses which of two
   disagreeing columns is right. There is no override: an escape hatch that imports 407
   of 408 rows becomes the normal path within a season, and the whole-file refusal
   design rests on there being one way through.

6. **A homeroom change is its own reportable change-kind**, `classChange`, applied without
   the approval gate a name change needs. A student who moved homeroom mid-year is a
   fact that arrived late, not a question of intent — but it is still counted and shown,
   because the import summary is the only place the department will ever learn a transfer
   happened.

7. **The field is optional on the row, and required everywhere a value is known.** The
   import refuses a file that lacks the column; manual entry (`create`, `bulkImport`,
   `update`) requires it. The only rows that may lack it are those `advanceGrade`
   creates: next year's homeroom number is the Chinese department's September decision
   and is unknowable in June, and Taiwan auto-advances students so advancement is the
   normal June flow rather than an edge case. A slip for such a student reads as unknown;
   it does not print last year's `01` as though it were this year's. Grade 10 has no
   such path — `advancementTargetGrade` returns null for grades 9 and 10 — so presence
   is structurally guaranteed there.

## Consequences

- **The roster page gains a Chinese-class column and a text filter.** A filter rather
  than a dropdown, because grades 7–9 draw each class from three or four homerooms by
  design, so the distinct values in one roster are most of the grade.
- **A September import now blocks on a misfiled row.** That is a real operational cost
  and it is deliberate: one typo'd cell is a corrupt ability band, and the alternative
  is a roster that looks fine and is not.
- **Stored values are stable under a rename.** If the school changes `J1` to something
  else, one function changes and no data is migrated.

## A constraint on a table that does not exist yet

ESL has no performance data today: `schema.ts` records that ESL students have no houses,
no CAS tags and no point evaluations, and there is no `esl_evaluations` table. The
Communication Slip is unbuilt. Nothing is created for either here.

But when an ESL performance record is built, it **must snapshot its own `cohortId`**. A
level transfer patches the student's `esl_students.cohortId` in place, so a record keyed
on the student's _current_ cohort would silently re-attribute a Term 1 assessment to the
class they moved into. A fact earned in a context is a property of the record, not of the
student's current pointer — the same reason only the derivable part of a homeroom is
stored. This is written down so the constraint is met when the table is written rather
than rediscovered as a bug against three years of corrupted history.

## Not decided here

- **The homeroom teacher.** A Chinese class's homeroom teacher is school data HWIS has
  no other source for — the ESL department does not staff homerooms. The International
  side has it through `classes.homeroomTeacherId`, but that graph is a different bounded
  context (ADR-0012). If the Slip needs a teacher's name rather than a class, that is its
  own change with its own decision.
- **Year changes are read from `esl_cohorts.year`, never inferred from a class code.**
  A class number changes when a student transfers, for reasons unrelated to the calendar,
  so it is not a year signal. The stored number _is_ a sound year signal — it rides the
  cohort's grade, which rides the year — but `year` is already explicit and authoritative,
  and inferring it from a student's attribute would be a step backwards.
- **The unreachable CJK column aliases.** `COLUMN_ALIASES` lists `學號`, `中文姓名`,
  `班級` and others, and `headerKey` strips every non-alphanumeric character, so a CJK
  header reduces to `''` and can never match any alias. Those aliases are dead code
  today, and the `Chinese class` aliases for them were deliberately left out rather than
  added dead. Tracked separately: the fix is not "preserve CJK" but "preserve CJK **and**
  re-audit every sheet that becomes readable", because a `班級`-led summary sheet is
  currently `unreadable` and reviving it could change which sheets are imported.
