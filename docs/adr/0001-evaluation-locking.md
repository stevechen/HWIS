# ADR-0001: Evaluation Weekly Locking

## Status

Accepted

## Context

Teachers create evaluations for students throughout the week. Every week, an admin summarizes all scores and exports them to an external system. If a teacher could modify evaluations after the export, the admin's report would be inconsistent with the live data.

## Decision

Evaluations are locked for edit and delete after Monday 00:00 following the evaluation week.

- An evaluation created in week W (Monday–Sunday) is editable/deletable until Monday 00:00 of week W+1.
- After that cutoff, the evaluation is read-only for all users.
- The cutoff is calculated server-side in Convex mutations (`evaluations.update`, `evaluations.remove`) and is also reflected in the UI (edit/delete options hidden).

## Consequences

- Admins can run weekly exports with confidence that past-week data is frozen.
- Teachers have the current week plus Monday to review and correct.
- Simple, predictable rule that maps to a natural calendar boundary.
