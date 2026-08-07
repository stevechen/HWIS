# ADR-0005: Class Structure and Protection

## Status

Accepted

## Context

HWIS runs grades 7–12. The IB Diploma Programme (IB-DP) is offered only at grades 11–12, so IB-designated classes should not exist in lower grades. Some class names serve as defaults and must not be accidentally deleted.

## Decision

- Classes are identified by `(grade, class)` — e.g., "7-1", "11-IB".
- **IB classes** are only created for grades 11 and 12 (enforced in `seedDefaultClasses`).
- **Protected classes**: `"1"` and `"IB"` cannot be deleted. The `remove` mutation checks `isProtectedClass(className)` and throws if either is targeted.
- The auto-increment logic for new classes excludes `"default"` and `"IB"` from the number pool.
- Display uses `getDisplayName(grade, className)`: numeric classes render as `"7-1"`, IB renders as `"11-IB"`.

## Implementation

The class-roster rules live in one place, `src/convex/shared/class_roster.ts`, a pure module shared by Convex and the Svelte UI:

- `GRADES`, `MIN_IB_GRADE` — the grade range and the IB threshold (grades 11–12).
- `getDisplayName`, `isProtectedClass`, `protectedClassErrorMessage` — display naming and delete protection.
- `classSortPriority`, `classGradientPosition`, `groupClassesByGrade` — display grouping and gradient ordering.
- `isEligibleMoveTarget`, `moveRejectionReason`, `buildMovePlan`, `eligibleTargetClasses` — movement decisions: same-grade-only with the IB rule (with machine-readable rejection reasons), move plans including skipped students, and the bulk-move target list.

Convex mutations (`seedDefaultClasses`, `remove`, `moveStudent`) remain the authoritative enforcer; the classes page imports the same functions so drag/drop and bulk movement share one decision path instead of reconstructing the rules in event handlers.

## Consequences

- Prevents accidental deletion of the default "1" stream or IB classes at any grade.
- IB classes must be manually created for grade 11–12 if seed is rerun.
- The auto-numbering scheme assumes "1" always exists — adding it to every grade is part of seeding.
