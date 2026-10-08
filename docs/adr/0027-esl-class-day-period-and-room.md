# ADR-0027: Every ESL class carries its weekly day, period and room

## Status

Accepted. Supersedes rule 6 of [ADR-0023](0023-esl-cohort-shape-junior-vs-senior.md),
which parked contact time as "not modelled yet"; the periods-per-week table it
recorded stands and is now enforced in code.

## Context

An ESL class today is `{cohortId, type, name, teacherId?, status}` — a name and a
teacher, with no idea when it meets. The department plans its year around a
timetable, and the three questions a coordinator actually asks are _when does this
class meet_, _what room is it in_, and _who else is free then_. None of them can be
answered from the database today.

The facts below are how the department actually runs the week.

### Days and periods

Classes meet Monday to Friday. A day carries at most one ESL period.

| Period | Time          |
| ------ | ------------- |
| P1     | 08:10 – 09:00 |
| P2     | 09:10 – 10:00 |
| P3     | 10:10 – 11:00 |
| P4     | 11:10 – 12:00 |
| P5     | 13:05 – 13:55 |
| P6     | 14:05 – 14:55 |
| P7     | 15:10 – 16:00 |
| P8     | 16:10 – 17:00 |

There are two shapes in that table, not one: P1–P4 and P7–P8 run `:10` to `:00`
across the hour, while P5 and P6 run `:05` to `:55`. The eight entries are written
out in full rather than generated from a pattern, because the pattern is not the
rule and a rule inferred from six rows would produce a wrong P3.

### Meetings per week, by class type

Every one of those days is **exactly one period** of ESL class.

| Type   | Days per week | Notes                       |
| ------ | ------------- | --------------------------- |
| `CLIL` | 3             | grades 7 and 8              |
| `Comm` | 2             | grades 7 and 8              |
| `G9`   | 2             | communication only, no CLIL |
| `H10A` | 2             | grade 10                    |
| `H10B` | 2             | grade 10                    |

G7 and G8 therefore run five days a week between their `CLIL` and `Comm` classes,
which is what ADR-0023 recorded as "5 days (G7/G8)" and could not express. G9 and
G10 run two.

### Rooms

Rooms come from two vocabularies with **different natures**, and conflating them is
the mistake this decision avoids.

- **`J1nn` / `H1nn`** are Chinese homerooms — derivable. ADR-0025 already derives
  them from a two-digit `chineseClass` through `chineseClassCode(grade, number)`, and
  the set that actually exists in a given year is derivable too: the distinct
  `chineseClass` values on that year's `esl_students`. Nothing is stored.
- **`ESL A` … `ESL G`** are the department's own rooms. They vary year to year —
  fewer in some years — and HWIS has no other source for them. This has to be
  stored.

A class is assigned **one** room, used on all of its days. This is uniform across
every type, grade 10 included: there is no second room, and no per-day variation.
A G7/G8 cohort's `CLIL` and `Comm` classes may be in the same room or in different
rooms; that is the coordinator's choice and both are normal.

This is worth stating plainly, because "grade 10's two classes use two classrooms"
reads like an exception and is not one. `H101A` and `H101B` are **separate cohorts**
with one class each (ADR-0023 rule 2), so their rooms are two independent values on
two independent rows — the one-room-per-class rule already produces that result, and
no relationship between the two rooms is stored, because there is nothing to relate.

Two things follow, both correct without further rules:

- **The blocking cohort conflict below never fires between `H101A` and `H101B`.**
  They hold different students, so overlapping them is an ordinary room or teacher
  clash — a warning — not the "same roster in two rooms" impossibility.
- **A single class never moves rooms mid-week.** That was considered and rejected; if
  a class ever does need to, `room` becomes a field on `esl_class_meetings` and this
  ADR is amended.

## The model

**Meetings are rows in their own table, not an array on the class.**

```
esl_classes        + room?: string                 // one room, all days
esl_class_meetings + classId, year, day, period    // one row per meeting
```

The array shape was considered first and rejected once conflict detection was
agreed. Convex cannot index into an array, so an inline `meetings` array can only
be searched by a full table scan — which is acceptable inside a rarely-called
admin _mutation_, and unacceptable in the teacher-timetable _query_, which would
full-scan on every page load and re-run on every subscription push. That is the
same trap ADR-0020 and ADR-0021 already paid for. A meeting is also a genuine
fact with its own identity (it is what a conflict is _about_), not a field.

The table is small — three rows per G7/G8 `CLIL` class, two per everything else,
across roughly 150–300 classes in a year — so it costs nothing to hold.

### `year` is stored, not derived

ADR-0025's rule is that anything derivable is derived. **`year` is the one
deliberate exception, and this ADR names it so the next reader does not "fix" it.**

The conflict check needs every meeting in a year, indexed by `(year, day, period)`.
Convex indexes only top-level fields, and a meeting's year is two joins away
(`meeting → class → cohort → year`), so an index without a stored `year` cannot
exist. The value cannot drift: a meeting belongs to one class, which belongs to one
cohort, which belongs to one year, and none of those are ever repointed.
`advanceGrade` creates new rows rather than moving existing ones.

### The room vocabulary lives in `settings`

`settings['esl.rooms.<year>']` holds a JSON array of the department's rooms for that
year, editable by an ESL admin. Absent, the UI suggests `ESL A` … `ESL G`.

**There is no rule rejecting a room past `ESL G`.** The school adding an `ESL H`
next year is not a data error, and a validation rule encoding "the most rooms we
have ever had" is exactly the brittle convention ADR-0025 warns against. `ESL A`–`G`
is a _suggestion list_, `J1nn`/`H1nn` are _derived suggestions_, and free text is
always accepted.

### Validation: shape errors and conflicts both block

These are two different failures, and they are detected two different ways, but
**both refuse the write**.

**Shape is a hard error** — the mutation is rejected. A `CLIL` class with two
meetings, two meetings on the same day, `day: 'Saturday'`, or `period: 9` are all
typos, all detectable, and all produce a timetable that is silently wrong.
`assertValidMeetings(type, meetings)` in `src/convex/shared/esl.ts` enforces the
count against the table above, distinct days within a class, and the valid day and
period ranges. A class with **no** meetings skips the check — absence is a
legitimate state, not a malformed one.

**Conflicts are also a hard error.** `findScheduleProblems(subject, neighbours,
unavailable)` runs every rule the department has, and `setSchedule` refuses if any
of them fires:

| Kind                   | Rule                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `cohort-slot`          | one cohort's `CLIL` and `Comm` draw the _same roster_; both at once puts the students in two rooms        |
| `cohort-days`          | **provisional** — the two classes of a cohort take different days; a policy, not a physical impossibility |
| `cohort-teacher`       | one teacher set to teach both classes of a cohort                                                         |
| `teacher`              | one teacher in two rooms at once                                                                          |
| `room`                 | one room holding two classes at once                                                                      |
| `teacher-availability` | a slot the teacher is marked unavailable for                                                              |

The refusal names **every** reason at once, because the picker already shows all
of them and a mutation reporting one per press would make a three-clash class a
three-press loop that only reveals the next problem each time.

#### Why this reversed an earlier decision

This ADR previously said conflicts "are never a rejected write", with the cohort
clash marked blocking in the table and prose that contradicted both. The code
settled on advisory, and the reasoning was sound: a half-built timetable is a real
state, and refusing to record it meant the admin could not see the clash they
needed in order to fix it.

What that reasoning missed: **advisory on the server is only as strong as the
client.** The schedule picker computed the same rules and disabled Save, so the
conflict looked blocked. But anything writing outside the picker — an import, a
backup restore, a second tab, a script — bypassed that entirely, and the server
happily persisted a timetable the school cannot run. Guidance in the UI cannot
close a hole in the data.

The fix keeps the reasoning and drops the hole. The picker still guides, so the
admin is told _before_ they commit — a hard block with no guidance is exactly the
opaque failure this ADR was written to avoid. The server gate is the safety net
underneath it, not a replacement. Both call the same function, so a refusal can
only ever be a rule the picker was already showing.

The card's red chips and the conflict marker are still load-bearing: they report
clashes already _in_ the data, from before this gate existed or from a path it does
not cover. That is why conflicts remain a **displayed** status computed on read
and never a stored flag.

### Nothing is blocked by an incomplete schedule

A class with no schedule is **not a valid class** — and that blocks nothing.
`cohorts.create` composes classes before anyone has thought about slots, and the
September roster import does not carry day or time at all. An import that could
create a cohort but not enrol twenty students into it would not be a working import.

So validity is a **displayed status, computed on read**, never a stored flag.
Validity is global — a class is invalid because of what _other_ rows say — so a
boolean on the row would go stale the moment a neighbour is edited. The classes page
and the timetable query load the year's meetings and classify each class. Four
states, not one flag, because "invalid" alone tells a coordinator nothing about what
to fix:

| State            | Meaning                                   |
| ---------------- | ----------------------------------------- |
| **No schedule**  | no meetings                               |
| **Incomplete**   | wrong number of meetings for the type     |
| **Missing room** | meetings exist, `room` is unset           |
| **Conflicting**  | reported against another class, naming it |

The badge is computed on read, so it cannot drift, and a conflict names the _other_
class involved rather than just reporting a clash.

### Year advancement does not carry the schedule

`advanceGrade` creates next year's classes bare, exactly as the September import
does. The G8 timetable is not the G7 timetable with the grade changed, and it does
not exist in June. A carried-forward slot would be a plausible fabrication sitting
in the database looking authoritative.

## Consequences

- **`esl_classes` gains `room: v.optional(v.string())`.** One room for all of a
  class's days. Optional, because a room is genuinely undecidable until the year's
  timetable exists.
- **`esl_class_meetings` is a new table**, and four things outside the ESL module
  must learn about it: `shared/backup_snapshot.ts`, `shared/restore_plan.ts`,
  `testLifecycle.ts` (cleanup by `e2eTag`), and the ADR-0021 quota budget. It is
  also carried by the backup schema version in ADR-0013 — a snapshot taken before
  this change restores without meetings, which is correct, since absence is a valid
  state.
- **`cohorts.create` writes no meetings.** The auto-composed classes start
  unscheduled. A default Mon/Wed/Fri is _not_ written, because it would be a
  proposal wearing the authority of a record.
- **The teacher timetable becomes possible**, which is why the meetings table exists
  rather than an array.
- **`J1nn` rooms get their vocabulary for free** from ADR-0025's existing
  derivation, and double as the check it already provides: a `J201` reading in a
  grade 7 class is provably wrong.

## What is deliberately not here

- **Room variations by day.** Decided against: one room per class, all types
  including grade 10. See "Rooms" above for why grade 10 is not the exception it
  appears to be. If a class ever does need to move rooms mid-week, `room` becomes a
  field on `esl_class_meetings` and this ADR is amended.
- **An evaluation does not snapshot its `(day, period, room)`.** ADR-0025 requires an
  unbuilt ESL evaluation to snapshot its own `cohortId`, because level transfer
  patches `esl_students.cohortId` in place. That reasoning does **not** extend to the
  slot. An evaluation is a fact about a student's work, pinned to the class it was
  earned in; when a timetable is corrected, the corrected timetable is the truth
  about when that class meets, and a record frozen against the old slot would be
  wrong rather than historical. Contrast ADR-0025, where the two differ precisely
  because a cohort transfer changes _who the record is about_, while a slot change
  does not.
- **Automatic default slots.** `cohorts.create` writes no meetings, so a new cohort
  starts unscheduled rather than on a fabricated Mon/Wed/Fri. A default would look
  authoritative and be wrong; a blank one is visibly unfinished and gets filled in.
- **Automatic default slots**, for the reason given above.
