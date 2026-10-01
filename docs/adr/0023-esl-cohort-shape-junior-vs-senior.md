# ADR-0023: ESL cohort shape differs between junior and senior high

## Status

Accepted. Rule 5 is superseded in part by
[ADR-0025](0025-record-the-chinese-class-per-esl-student.md); the rest stands.

## Context

The ESL department runs one program across four grades, and it is tempting to model a
"cohort" as the same thing in each. It is not. Junior high and senior high build
rosters by opposite rules, and a model that treats them alike produces rosters that
are wrong in a way nothing downstream can detect — the counts still add up, the
classes still exist, and the students are simply filed against the wrong peers.

This has been got wrong once already. The first model made a grade 10 base class one
cohort holding both its `A` and `B` students, on the reasoning that they are taught
together. They are not taught together in any meaningful sense — `A` and `B` are
ability bands, and merging them discards the sorting that produced them. That error
is corrected here.

The facts below are how the department actually runs the program.

### Junior high (grades 7, 8, 9)

- Five days a week for grades 7 and 8, in two kinds of class: **CLIL** (three
  periods) and **Communication** (two periods). Grade 9 runs two days a week,
  communication only, with no CLIL.
- Students are divided into **ability levels** after a sorting test.
- There are many students, so each level is then split into several numbered
  classes — `1`, `2`, `3`, and so on. A cohort is one such class: a level plus a
  class number.
- **A class draws students from three or four different Chinese classes.** The ESL
  class is deliberately mixed across Chinese homerooms, so a Chinese class is not
  a grouping the ESL roster can be cut along.
- Grade 9 is levelled and split into many classes in exactly the same way as grades
  7 and 8. It differs only in contact time and in having no CLIL.

### Senior high (grade 10)

- Twice a week, focused on spoken communication.
- `A` and `B` are the **levels** — `A` is higher in capability, `B` lower. They are
  ability bands, not sections of one class, and they hold different students.
- **Each ESL class contains students from exactly one Chinese class.** This is the
  opposite of the junior high rule, and it is why a grade 10 cohort is keyed by
  Chinese class as well as level.
- The school names these classes `H101A` through `H111B`: `H1` for grade 10, a
  zero-padded Chinese-class number, and the level letter.

## The model

A **cohort** is the unit that owns a roster. It is built differently by stage:

|                       | Grades 7–9                              | Grade 10              |
| --------------------- | --------------------------------------- | --------------------- |
| Cohort identity       | level + class number                    | Chinese class + level |
| Example               | `G7 Basic 1`                            | `H101A`               |
| Chinese classes mixed | yes — 3 or 4 per class                  | no — exactly one      |
| Classes per cohort    | `CLIL` and `Comm` for G7/G8; one for G9 | one                   |
| Contact               | 5 days (G7/G8), 2 days (G9)             | 2 days                |

Concretely, and these are the rules the code has to satisfy:

1. **A cohort owns exactly one roster**, and a student appears in exactly one cohort
   per grade. Nothing is shared between cohorts.
2. **Grade 10's `A` and `B` are separate cohorts.** `H101A` is Chinese class 01 at
   level A; `H101B` is Chinese class 01 at level B. They share a Chinese class, and
   nothing else.
3. **Grades 7–9 have no per-level section split.** A cohort is one numbered class,
   and its `CLIL` and `Comm` classes (G7/G8) draw the _same_ roster because they are
   two kinds of lesson taught to one group, not two groups.
4. **A grade 10 workbook sheet is one Chinese class carrying both levels**, so one
   sheet yields two cohorts. That is a property of the file, not of the cohort.
5. **Chinese-class composition is deliberately not stored for grades 7–9.** Those
   classes are mixed across Chinese homerooms by design, so recording a single
   Chinese class for one would be a fabrication. For grade 10 it is implied by the
   cohort key and so is not stored separately either.
   **Superseded in part by [ADR-0025](0025-record-the-chinese-class-per-esl-student.md).**
   The reasoning above still holds for a _class_ — an ESL class is still not a Chinese
   class, and a grade 7–9 cohort is still not identified by a homeroom. What was wrong
   was extending it to the _students_: each student is in exactly one homeroom, which is
   a fact about them rather than about the group, so the homeroom is now recorded per
   student and not per cohort.
6. **Contact time is not modelled yet.** The periods per week above are recorded
   here because the class scheduler needs them, and because they are the reason G9
   and G10 are not simply "grades 7 and 8 with fewer classes".

## How things are named

The school names each grade its own way, and the names are not variations on one
scheme. These are the formats, in full:

| Thing                | Format                                            | Examples                                     |
| -------------------- | ------------------------------------------------- | -------------------------------------------- |
| G7/G8 class          | `G[#] [level] [#] [CLIL/Comm]`                    | `G7 Elementary 1 CLIL`, `G8 Advanced 3 Comm` |
| G9 class and cohort  | `G9 [level] [#]`                                  | `G9 Advanced 1`                              |
| G10 class and cohort | `H1[cc][level]`                                   | `H101A`, `H101B`                             |
| Levelled cohort      | grade, level and number, year-prefixed when shown | `2025-2026 G7 Basic 1`                       |

Two points that are easy to get wrong:

- **The lesson goes last, and only for grades 7 and 8.** It is the only part that
  distinguishes the two classes a cohort is taught by; the rest names the cohort
  they share. Grade 9 runs a single class, so it carries no lesson token — its
  class and its cohort are named identically.
- **Grades 7 and 8 are never written as one `G7/8`.** Each class names its own
  grade, so `G7 Basic 1 CLIL` and `G8 Basic 1 CLIL` are two classes in two grades. A
  merged label would name neither, and would not match the cohort label above it.

Grade 10 is the exception throughout: the school writes it as a single token, with
the level letter as its only mark of ability. That is why grade 10 class names carry
no level _word_ while the levelled grades' do — and, per ADR-0022, why the level has
to be spelled out separately in the grade 10 cohort key.

## Consequences

- `esl_cohorts.level` is no longer absent for grade 10: it holds `A` or `B`. The
  field is now "the ability band within the grade" for every grade, which is what
  the sorting test produces and what `A`/`B` are.
- A grade 10 cohort has **one** class, not two. `H10A` and `H10B` remain class types
  because a class still has to be told which band it teaches, but they are never
  two classes on one cohort.
- `classTypesForCohort` cannot be keyed on grade alone for grade 10: which type a
  cohort gets depends on the cohort's own level. It takes the cohort.
- Grade 10 cohort identity is `(grade 10, level A|B, Chinese-class number)`, and
  `classNumber` continues to hold the zero-padded Chinese-class number, keeping
  lexical ordering numeric.

## What this corrects

ADR-0022 states, for grade 10, that "the unit is the base class, not the group", on
the grounds that a base class is one Chinese class and `A`/`B` are sections of it.
The sheet-level half of that is right — one sheet is one Chinese class — but the
cohort-level conclusion follows from calling `A`/`B` sections, and that is the error.
They are levels. ADR-0022's other grade 10 claims, that the file is never matched
across years and that the ID space identifies the grade, are unaffected.
