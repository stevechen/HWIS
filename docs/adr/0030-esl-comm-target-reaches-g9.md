# ADR-0030: The `Comm` event target reaches G9, because a G9 lesson is a communication lesson

## Status

Accepted. Fixes #278.

## Context

An ESL event carries one `target` saying which classes it affects. The target
union mixes two kinds of name:

| Target      | Names                     |
| ----------- | ------------------------- |
| `all`       | every class               |
| `CLIL`      | the CLIL lessons          |
| `Comm`      | the communication lessons |
| `G7` / `G8` | every class of that grade |
| `G9`        | the G9 classes            |
| `H1`        | the grade 10 classes      |

`esl_classes.type` is a different axis — `CLIL`, `Comm`, `G9`, `H10A`, `H10B` —
and a cohort's shape decides which type it gets: a G7/G8 cohort is taught by a
`CLIL` and a `Comm` class, a G9 cohort by a single `G9` class, a G10 cohort by
one `H10A`/`H10B` section ([ADR-0023](0023-esl-cohort-shape-junior-vs-senior.md)).

The two axes only line up for grades 7 and 8. `eventReachesClass` matched
`Comm` against `classType === 'Comm'`, and there is no class type `Comm` on a G9
cohort, so a `Comm`-targeted event never reached G9.

That was tolerable while nothing important was `Comm`-targeted. It stopped being
tolerable once the communication cycle was: passport dues, recording dues and
passport checks are locked to `Comm` (#212, `ESL_LOCKED_REMINDER_TARGETS`) and
`assertValidEslTarget` refuses any other target for them. So G9 cohorts drew no
passport or recording dues at all, and their teachers saw no due banners in the
schedule list or the calendar — the bug in #278.

The department's own rule is that G9 runs two days a week, **communication
only, with no CLIL** ([ADR-0023](0023-esl-cohort-shape-junior-vs-senior.md), [ADR-0027](0027-esl-class-day-period-and-room.md)). A G9 lesson _is_ a communication
lesson. The event target was the thing that had never been taught that.

### What this is not

The report inferred the problem from G9 "being treated as a Comm class", on the
theory that this is why G9 gets oral exams. The causal link is wrong and worth
recording so nobody re-derives it: oral-exam marking is gated on
`type !== 'CLIL'` (`eventReachesClass` is not involved), so G9 marks its last two
active class days before each exam — and its `Oral` count-up — no matter what
the target rules say. Changing target reach cannot add or remove an oral mark.

## Decision

`Comm` names the communication lessons, not the `Comm` class type. A G9 cohort's
single `G9` class is one of those lessons, so:

```ts
if (target === 'Comm') return classType === 'Comm' || classType === 'G9';
```

Grade 10 is unchanged and stays outside the junior-high targets: only `all` and
`H1` reach it.

Two supporting decisions:

- **The rule has one executable home.** `isCommunicationLessonClassType(classType)`
  names the set (`Comm` or `G9`), and `eventReachesClass` reads it; the
  passport-cycle reminder kinds are locked to `Comm` in the one table
  (`ESL_LOCKED_REMINDER_TARGETS`) that already governs every reminder target.
  The wizard, the checklist one-click create and the client row descriptors
  author their target through `defaultTargetForEventType`, which resolves
  through that table — so no authoring site repeats the literal and none can
  drift from the lock.
- **The picker says what `Comm` reaches.** The custom-event target dropdown
  labels it "Communication (G7–G9)"; a teacher choosing it is choosing who sees
  the event, not just which class type it matches.

### Deliberate consequence

The rule is about the target, not about due kinds. A `Comm`-targeted **task** or
custom event now also reaches G9. That is intended: communication-class homework
aimed at communication classes includes the G9 class, and a second rule that
made only the due kinds reach G9 would be a hidden exception that no one could
express in the data.

## Alternatives considered

- **Add a new target literal for the communication cycle** (`'JH'`, `'CommCycle'`
  or similar) meaning G7+G8+G9 communication, leaving `Comm` as G7/G8 only.
  Rejected: it buys precision about _why_ an event reaches G9 at the cost of a
  new vocabulary word that the rest of the app never needs — `CLIL` and `Comm`
  already name lessons, and G9 already has a communication lesson. It also
  spreads across the schema union, both validators, the wizard mappings, the
  target filters and every fixture. The migration objection that once stood
  against it is moot (nothing is deployed), but the modelling cost is not.
- **Special-case the due kinds in the matcher** so passport/recording/passport
  check reach G9 regardless of target while `Comm` keeps its old meaning.
  Rejected: it hides a real rule in a branch, makes "this due reaches G9"
  unrepresentable in the event row, and would leave two different answers to
  "does a `Comm` event reach G9?" depending on the event type.
- **Change nothing and keep G9 out of the communication cycle.** Rejected: G9
  runs the passport and recording cycle in practice; the software said otherwise.

## Consequences

- G9 teachers see Passport due, Recording due and Passport check banners on the
  schedule list and the calendar. No schema change and no data migration: the
  rows already carried `target: 'Comm'`.
- The due authors read one lock table instead of repeating the literal, so a
  future change to the target touches `ESL_LOCKED_REMINDER_TARGETS` alone.
- **`Comm` and `G9` are no longer disjoint targets.** `Comm` is a superset of
  `G9`: every G9 class is reached by `Comm`, and `G9`-targeted events still reach
  G9 alone. Anyone adding a target meaning "G7/G8 Comm only" has to say so
  explicitly — the old inference no longer works.
- `eventReachesClass` remains the single gate. `isEslActiveDay`, the oral-day
  walk-back, the due collapse and the count-up all read reach through it, so
  they agree by construction.
- The `SCHEDULE_TARGET_FILTERS` list still carries both `Comm` and `G9` and has
  no consumer. If it is ever wired up, filtering by `Comm` must decide
  deliberately whether it includes G9 rows, because the matcher now does.
