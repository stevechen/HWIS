# ADR-0008: House Competition Architecture

## Status

Accepted

## Context

HWIS divides students into four houses: Heracles, Wukong, Ixbalam, and Setna. House standings drive inter-house competitions throughout the academic year. The cumulative house score combines points earned by individual enrolled students through teacher evaluations as well as administrative event points awarded during school-wide competitions.

## Decision

The house competition system uses a dynamic, unmaterialized aggregation architecture to maintain exact point standings without risk of cache divergence.

- **Dynamic Calculation**: House point totals are computed on-demand by aggregating evaluations of active, enrolled students (grouped by `students.house`) and adding point allocations from administrative events recorded in `house_events`.
- **No Materialized Total Tables**: Storing pre-calculated total scores in a separate table is explicitly avoided. This eliminates cache divergence and sync issues whenever evaluations are edited, deleted, or restored, or when year-end rollbacks take place.
- **Student House Assignment**: Enrolled student records carry an optional `house` field (`house: v.optional(v.union(v.literal('Heracles'), v.literal('Wukong'), v.literal('Ixbalam'), v.literal('Setna')))`). Bulk house assignment and individual reassignment are supported via administrative mutations.
- **Timed House Events**: The `house_events` table manages administrative point allocations (e.g., Sports Day or spirit competitions) with start/end dates and per-house point distributions (`housePoints`).

## Implementation & Consequences

### Implementation

- `src/convex/houses.ts`: Queries calculate real-time standings by scanning enrolled students, fetching their associated evaluations, summing point values per house, and combining these with the sum of points in `house_events`.
- `src/convex/houseEvents.ts`: Manages CRUD operations for special house events and administrative point adjustments.
- **Year-End Migration**: The year-end migration procedure (`advanceGradesAndClearEvaluations` in `src/convex/backup.ts`) clears all records from `house_events` and deletes evaluations to reset standings for the new academic year, while retaining each student's house assignment (`students.house`) across grade advancement.

### Consequences

- **Guaranteed Consistency**: Standings always reflect the true sum of live evaluations and event points. Edits, deletions, or imports instantly update house scores.
- **Zero Cache Divergence**: Eliminates complex cache invalidation or synchronization logic.
- **Clean Academic Year Reset**: Resetting standings for a new year only requires clearing evaluations and house events, leaving student house memberships intact.
