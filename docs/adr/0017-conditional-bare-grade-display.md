# ADR-0017: Conditional Bare-Grade Class Display

## Status

Accepted

## Context

A `default` class row is the holding pen for students created without an
explicit class (`students.create`, Excel import, e2e factory). `getDisplayName`
rendered it unconditionally as the bare grade (`getDisplayName(10, 'default')
=== '10'`), which is only unambiguous while the grade has no numbered classes.

Stray `default` rows (e.g. left behind by e2e runs whose teardown only removes
tagged classes) surfaced as phantom "10" cards next to the real "10-1"/"10-2"
on the class leaderboard and Class Management — indistinguishable from a real
single class. The roster invariant is: a grade holds either one undivided class
(shown bare) or numbered classes, never both (`[10, 10-1]` is invalid).

## Decision

**Bare grade only when sole in grade; explicit `grade-default` otherwise.**

1. `getDisplayName(grade, className, totalInGrade = 1)` — `default` renders as
   the bare grade only when `totalInGrade <= 1`; with siblings it renders
   `grade-default` (e.g. `10-default`). The default parameter preserves
   historical behavior at call sites without sibling knowledge (audit logs,
   error messages gained counts; nothing regressed).
2. Sibling counts come from `countClassesByGrade`, computed once per query/page
   from the already-loaded class list — no new indexes, negligible cost (tens
   of rows).
3. Invalid states become visible instead of masquerading: a leftover `default`
   row next to numbered classes shows as `10-default`, flagging it for moving
   students out and deleting the row. No data is auto-migrated or hidden.

## Consequences

- The stray-row class of bug is now self-announcing wherever classes are
  listed (leaderboard, Class Management, student rows, form dropdowns).
- Prevention (requiring an explicit class when numbered classes exist) is
  deliberately out of scope — it would break e2e flows that mint classless
  students and needs its own product decision.
