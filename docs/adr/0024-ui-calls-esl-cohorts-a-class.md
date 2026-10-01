# ADR-0024: The UI calls `esl_cohorts` a Class

## Status

Accepted

## Context

The ESL model in ADR-0023 has two entities and calls the roster-owning one a **cohort**:
`esl_cohorts` owns a roster, and `esl_classes` holds the CLIL/Comm/G9/H10A/H10B lessons
taught to it. The word "cohort" is accurate and it is what the code says, but it is not
what the department says. Its users are ESL administrators and teachers, and they do not
use the word; asking them to learn a database term in order to use an admin screen is a
cost paid on every screen, forever, for no modelling benefit.

The vocabulary is also inconsistent with itself. The grade 10 form already asked for a
**Base class**, the import page already said "N classes this file fills", and a class row
inside a cohort already had a **Class teacher** — so "cohort" sat next to three different
uses of "class" and the page was already confusing before any rename.

The constraint is that the schema is correct as it stands. `esl_cohorts` and `esl_classes`
are genuinely different things, and a G7/G8 CLIL class and its Comm partner sharing one
roster is a real modelling decision. Renaming the tables to match the UI would make the
code lie about the domain to buy a label nothing depends on.

## Decision

**The UI calls `esl_cohorts` a Class.** Everywhere a user reads the word, the cohort is a
class: the nav item, the overview card, the page title, the create form, the filter
labels, the empty and loading states, the students-page roster picker, and the error
messages a mutation throws at an admin.

The route moves to match, `/esl/admin/cohorts` → `/esl/admin/classes`. No redirect is
kept: the app has not been live, so there are no bookmarks to preserve. `data-testid`s
move with it (`esl-admin-cohorts.*` → `esl-admin-classes.*`).

**"Class" is deliberately left overloaded inside a class card.** A card is titled for its
cohort, and inside it is a table of `esl_classes` rows under a **Class** header with a
**Class teacher** each. Those rows _are_ classes in the ordinary school sense —
`G7 Basic 1 CLIL` is a class on a timetable with a teacher — and a G7 card's two rows
routinely have two different teachers. Renaming them "lessons" or "sections" was
considered and rejected: "sections" collides with the grade 10 A/B ability bands, which
ADR-0023 explicitly rejects as sections, and "lessons" is less accurate than what the
rows are. The cost is a page titled "Classes" containing a "Class" column; the benefit is
that no word means two different things in the same sentence. **This is a decision, not an
oversight**, and it is recorded here so the next reader does not "fix" it.

### What was removed rather than renamed

Two explanations of the shared roster were deleted rather than reworded: the paragraph on
the classes page describing how a cohort relates to the classes that teach it, and the
students-page note that a G7/G8 CLIL and its Comm partner share a roster. The
`Shared roster` badge went with them. The department knows this; a paragraph that has to
be read to understand the screen is a paragraph the screen should not need.

The "Repair classes" button and the `pairClasses` mutation behind it were removed. The
button re-created missing lesson rows, which nothing can now do from the UI — acceptable
because `esl/cohorts:create` composes a cohort's classes on the way in, so a class is
well-formed from birth, and because the app has never been live and so has no damaged rows
to repair. `repairLegacyGrade10`, `repairLegacyLevels` and `purgeOrphanedClasses` are
unaffected: they are `internalMutation`s run from the CLI, not UI actions.

`Archive` and `Restore` are unchanged, including the fact that archiving a cohort does not
archive its classes, does not touch the roster, and does not hide the cohort from
`esl/cohorts:list` — there is no status filter, so an archived cohort still appears with an
`archived` badge. That is a behaviour question, not a naming one, and belongs in its own
change.

## Consequences

- Code, schema, and Convex identifiers still say `cohort`. The mapping is UI **Class** →
  `esl_cohorts` → card contents → `esl_classes`. `classTypesForCohort`,
  `cohortLabel` and friends are unchanged.
- The route directory is `src/routes/esl/admin/classes/`, so a file search for "cohort" no
  longer finds the page a user is looking at. Searching for a test id finds it.
- `esl/cohorts:pairClasses` no longer exists. A class whose lesson rows are damaged
  out-of-band can only be repaired from the CLI, by re-inserting the rows — and the CLI
  repairs that do exist do not do this.
- Grade 10's class-number field is labelled **Chinese class**, not _Base class_. _Base
  class_ was ADR-0022's term and ADR-0023 overturned it: grade 10 is keyed by Chinese
  class, and the school writes it `H101`. Grades 7–9 keep **Class number**, which names a
  real numbered class within a level.
- Any future rename of the schema has to reckon with this ADR, which has already spent the
  word "class" in the UI.
