# ADR-0001: Evaluation Weekly Locking

## Status

Accepted

## Context

Teachers create evaluations for students throughout the week, often awarding points to single students or to multiple students as a batch. Every week, an admin summarizes all scores and exports them to an external system. If a teacher could modify evaluations after the export, the admin's report would be inconsistent with the live data.

## Decision

Evaluations are locked for edit and delete after Monday 00:00 following the evaluation week.

- An evaluation created in week W (Monday–Sunday) is editable/deletable until Monday 00:00 of week W+1.
- After that cutoff, the evaluation is read-only for all users.
- Multi-student batch evaluations store a `batchId` field in the `evaluations` schema when awarded together. Legacy records created before `batchId` existed fall back to a `derivedBatchKey` (computed from timestamp, category, value, details, and semester) so older batches remain groupable.
- Batch operations (creating, editing via `evaluations.updateMany`, or reverting/deleting via `evaluations.removeMany` evaluations awarded together) strictly respect the same Monday 00:00 Taiwan time cutoff via `lockCutoffFor(timestamp)`.
- The cutoff is calculated server-side in Convex mutations (`evaluations.update`, `evaluations.remove`, `evaluations.updateMany`, `evaluations.removeMany`) and batch recent-action handlers, and is also reflected in the UI (edit/delete options hidden).
- All boundaries are in Taiwan time (Asia/Taipei, fixed UTC+8, no DST). This keeps the server (which runs in UTC), the teacher's browser (any device timezone), and the admin's weekly reports all resolving the same week and cutoff.

## Implementation

The week-boundary math behind this rule lives in one module, `src/convex/shared/evaluation_week.ts`, exposing `weekStartOf`, `weekEndOf`, `lockCutoffFor`, and `isEditable`. Convex mutations are the authoritative enforcer (ADR-0002); the Svelte UI imports the same pure functions for the lock-date copy and edit/delete gating rather than reimplementing the calendar math.

Multi-student evaluations created in a single call share a `batchId`. Batch mutations and recent actions query evaluations by `batchId` (or `derivedBatchKey` for legacy rows) and evaluate `lockCutoffFor(timestamp)` for each record before permitting updates or removals.

The module computes Monday/cutoff from the absolute timestamp against the Taiwan calendar (UTC+8 shift then UTC calendar read), so the result is independent of the host process timezone.

## Consequences

- Admins can run weekly exports with confidence that past-week data is frozen.
- Teachers have the current week plus Monday to review and correct individual or batch evaluations.
- Batch creation and modification remain atomic and safe, respecting weekly calendar boundaries.
- Simple, predictable rule that maps to a natural calendar boundary.
