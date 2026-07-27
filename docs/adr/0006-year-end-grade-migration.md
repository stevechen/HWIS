# ADR-0006: Year-End Grade Migration

## Status

Accepted

## Context

At the end of each academic year, the system must reset for the next year. This involves: advancing enrolled students to the next grade, graduating grade 12 students, removing mid-year leavers, clearing evaluation data, resetting house competitions, and freeing teachers for reassignment.

## Decision

A single `advanceGradesAndClearEvaluations` mutation handles the entire year-end migration.

1. **Auto-backup**: Full snapshot of students, evaluations, users, categories, classes, and house events is saved to the `backups` table before any changes.
2. **Clear evaluations**: All evaluations and their audit log entries are deleted.
3. **Clear house events**: All house competition events are deleted (fresh start each year).
4. **Graduate grade 12**: All students in grade 12 classes are deleted.
5. **Remove leavers**: All `Not Enrolled` students are deleted.
6. **Advance enrolled**: Each enrolled student is moved to the next grade level, carrying their class section name (e.g., "1", "IB") forward. Classes are created on demand if they don't exist at the target grade.
7. **Clear homeroom teachers**: All class homeroom teacher assignments are cleared — admins reassign them each year.
8. **Clean up empty classes**: Classes with no students are deleted, except IB classes at grades 11–12 (kept for future planning).

## Consequences

- One-shot migration with built-in backup for recovery if something goes wrong.
- Destructive — evaluations and house events are permanently deleted; only the backup preserves them.
- IB classes at grades 11–12 are preserved even when empty, so admin doesn't need to recreate them each year.
- Homeroom teacher reassignment is a manual post-migration step.
