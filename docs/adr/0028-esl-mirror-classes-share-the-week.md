# ADR-0028: A grade 7–9 save mirrors its week onto the band's same-type classes

## Status

Accepted. Extends the atomic-pair idea of [ADR-0023](0023-esl-cohort-shape-junior-vs-senior.md)
rule 7 and [ADR-0027](0027-esl-class-day-period-and-room.md), whose gate it reuses.

## Context

An ESL cohort is one level of one Chinese-homeroom band — `G7 Advance 1 CLIL` and
`G7 Elementary 1 CLIL` teach different ability levels drawn from the same Chinese
homerooms, and the school re-levels students between those cohorts freely during
the year. A student can move from Elementary to Basic mid-week.

That movement only works if the timetable already agrees: every `CLIL` class in a
levelled grade must run at the same three slots, so a student who changes level
gains or loses nothing, and a coordinator who moves ten students does not
schedule ten lessons. If `G7 Advance 1 CLIL` meets Monday P1 and `G7 Basic 1 CLIL`
meets Monday P4, every re-level costs the school a lesson — or is simply not
timetable-able.

Until now, `setSchedule` wrote one class (or, for grade 10, its `A`/`B` pair),
and each of the band's other classes had to be saved by hand, one card at a
time. A band of seven `CLIL` classes meant the department's actual unit of
scheduling — the week — was entered as seven separate writes, and there was
nothing that kept them from disagreeing.

### Why the shared-homeroom match

Not every cohort of a grade belongs to the band. The community of classes that
must share a week is the one **whose students come from the same Chinese
classes**: if a cohort's roster draws from homerooms that no class in the band
touches, its week is an independent decision and mirroring onto it would be
wrong. The composition is fully derivable — the roster's `chineseClass` values
(ADR-0025) — so the group is a fact about the data, not something an admin
maintains.

Exact composition is too strict. A real `跑班` band can contain cohorts drawn
from overlapping but different subsets of the same homerooms: G7 Advanced 3
draws J101/J106/J110 while G7 Elementary 4 draws only J101/J106, yet the school
moves students between them and both must meet at the same slots. Equality
would split that band and leave half of it behind. Two cohorts are therefore
siblings when their rosters **share at least one** Chinese homeroom, and the
band is the transitive connected component of that relation: overlapping
subsets join the larger band, and a chain of overlaps links every cohort in it.

## Decision

`setSchedule` on a grade 7–9 class resolves a **mirror group** and writes the
proposed week to every member, in one transaction. Resolution is **derived,
never stored**: a sibling is another class that is

- the **same class type** (`CLIL` with `CLIL`, `Comm` with `Comm`, `G9` with
  `G9`) — the rule is symmetric across types;
- in the **same grade and school year**;
- **active**, as is its cohort;
- and belongs to a cohort in the source cohort's **sibling band** — the
  transitive component of "active rosters share at least one Chinese homeroom",
  homerooms derived per ADR-0025.

Three edges were decided deliberately:

- **Empty rosters match nothing.** A cohort with no active students (or no
  parseable homerooms yet) has no shared homeroom to match on, so it neither
  joins a group nor blocks one; the write degrades to an ordinary single-class
  save.
- **Archived rows are history.** An archived class or cohort neither blocks the
  write nor is dragged back onto the week, the same rule the neighbour set uses.
- **Grade 10 keeps its own path.** Its `A`/`B` sections are _paired_ (both of
  one Chinese class), not _mirrored_ (the same level, different rotations), and
  `writeGrade10Pair` already writes both; the levelled-grade guard excludes
  grade 10 from mirror resolution by construction.
- **The trigger is a changed week, not a save.** A save whose proposed meetings
  equal (as an order-insensitive set) the meetings the class already holds in
  the year can only be about the room — the setup flow sets rooms class by
  class through this same path, and it must not resurrect the confirm for a
  week nobody touched. Such a save skips the group entirely and commits as an
  ordinary single-class save. The preview applies the same rule, so no dialog
  is offered for one; mutation and query agree on what reradiates.

Write semantics mirror the grade 10 pair exactly:

- Each member's meetings for the year are **replaced wholesale** with the
  identical week.
- **Rooms and teachers never propagate** — each class keeps its own room and
  its own teacher; only the day/period slots are shared.
- Any member of the group can trigger it. The group is a fact about the
  cohorts, not an ordering.
- The **full department gate** runs for every member before anything is
  written, with the whole group excluded from each other's neighbour sets (they
  meet at identical slots by construction) — and the two collisions the gate
  cannot see, two members sharing a room or a teacher, get the pair's own
  explicit rules. The refusal is **all-or-nothing** with an aggregated list
  naming each failing class, because a split group is exactly the state the
  gate would then refuse to repair.

### Preview and confirm

A save that quietly touches seven classes is only acceptable if the admin has
seen the list. `listScheduleMirrors` runs the same resolution and the same gate
the write will, returning each target's name, whether its current week will be
overwritten, and every predicted problem; the classes page shows that list
behind an explicit confirm before the mutation is sent. With no mirrors the
dialog is skipped and the save commits directly, as before. The picker already
gates the _source_ class; the preview's predicted problems are the ones its
gate cannot reach — clashes inside a mirror's own cohort, or a room/teacher
shared with another group member.

## Consequences

- Re-leaving students between cohorts never gains or loses a lesson, and the
  week is entered once instead of seven times.
- A save is refused when _any_ member of the band cannot take the week — most
  often a cohort's `Comm` class already holding a proposed slot. Moving the
  whole band somewhere is therefore a single edit, but it requires the band's
  Comm classes (and rooms and teachers) to be resolvable too, not just the
  source's.
- The mirror group is re-derived on every read and write, so transfers and
  imports change the group without a migration.
- `writeGrade10Pair` now judges the calling section's _drafted_ room against
  the year as well as against the partner. The general gate used to catch this
  before arriving at the pair path; the mirror check moved ahead of it, and the
  gap it left accepted a room onto a slot another class already held.
- Setting a room or a teacher remains per-class by design: the band shares time,
  not space or staff.
- A room-only save no longer _heals_ a band member whose week has drifted from
  the group's — the read's conflict badge still flags that divergence, and
  repairing it is a week change, which is exactly the save that radiates. The
  alternative, rewriting four bands' weeks from a room edit, would surprise an
  admin who only touched one card.
