## Architecture Overview

The enrichment consolidation places a single deep module at the seam between the Evaluation queries and the data they need to resolve. Rather than each of the 9 query paths in the Evaluations module independently building student/category/class Maps, one module owns the enrichment logic and exposes a small interface.

## Seam Placement

The seam is the enrichment helper module, placed in `src/convex/shared/` alongside the existing `evaluation_utils.ts`, `authorization.ts`, and `houses.ts`. This is the highest seam available — it avoids creating a new module directory and uses the existing shared module location that is already consumed by both the server Convex functions and (via imports) the client page.

## Module Shape

The enrichment helper is a deep module: its interface is a single method `enrich(evaluations, ctx)` while the implementation contains the Map-building pattern, student/category/class lookups, and sort logic. Callers learn one method but get full enrichment behavior.

## Before/After Dependency

Before: 9 query paths each contain a ~30-line enrichment block that independently builds 3 Maps (students, categories, classes) and resolves each evaluation entry. After: 9 query paths each call one helper function that encapsulates the enrichment logic.

## Key Design Decisions

1. **One seam, two adapters**: The production adapter calls Convex database queries to resolve lookups. The client adapter imports the same function signature but operates on pre-fetched data. This is one real seam justified by two adapters (server-side DB access vs client-side data resolution).
2. **matchesMultiSearch single source**: The canonical version lives in the server shared module. Client code imports from there. The inline page variant and the client lib copy are removed.
3. **No new schema**: The enrichment helper adds no new table, index, or type. It is purely an organizational refactoring within existing interfaces.
4. **ADR-0002 compliance**: The consolidation eliminates duplicate business logic between server and client, honoring the single-source-of-truth decision.
5. **evaluations.ts stays monolithic for now**: The extraction does not split the 895-line file into smaller modules — it only reduces its duplication. A future deepening may split it further.

## Data Flow

```
Query path → enrich() → Map<studentId, StudentDoc> + Map<categoryId, CategoryDoc> + Map<classId, ClassDoc> → resolved evaluation array
```

The `enrich()` function:

1. Collects all unique studentIds, categoryIds, and classIds from the input array
2. Fetches each in parallel via `ctx.db.query()`
3. Builds Maps for O(1) lookup
4. Maps over the input array, enriching each entry
5. Returns the enriched array (optionally sorted)
