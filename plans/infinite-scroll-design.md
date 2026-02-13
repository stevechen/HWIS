# Infinite Scroll Pagination Design for Evaluations Page

## Overview

This document outlines the design for implementing infinite scrolling pagination on the admin evaluations page at `src/routes/admin/evaluations/+page.svelte`. The current implementation loads all evaluations at once, which may cause performance issues as the dataset grows.

## 1. Analysis of Current Implementation

### 1.1 Current Convex Query (`listAllEvaluations`)

Location: [`src/convex/evaluations.ts:504-581`](src/convex/evaluations.ts:504)

```typescript
export const listAllEvaluations = query({
  args: {
    studentFilter: v.optional(v.string()),
    teacherFilter: v.optional(v.string()),
    showUnenrolled: v.optional(v.boolean()),
    testToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    // 1. Fetch ALL evaluations using .collect()
    const allEvaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_timestamp')
      .order('desc')
      .collect();  // <-- Loads everything into memory

    // 2. Enrich with student/teacher data
    // 3. Apply server-side filters (student name, teacher name, unenrolled)
    // 4. Sort and return
  }
});
```

**Key Issues:**
1. Uses `.collect()` which fetches all records into memory
2. Server-side filtering happens AFTER fetching all data
3. No pagination support - returns complete dataset
4. Client-side sorting duplicates work already done server-side

### 1.2 Current Page Component

Location: [`src/routes/admin/evaluations/+page.svelte`](src/routes/admin/evaluations/+page.svelte)

```svelte
<script lang="ts">
  // Single query fetches all data
  const evaluationsQuery = useQuery(api.evaluations.listAllEvaluations, () => evaluationsQueryArgs);

  // Client-side sorting
  const sortedEvaluations = $derived.by(() => {
    if (!evaluationsQuery.data) return [];
    const evals = evaluationsQuery.data.map(transformEvaluation);
    return sortEvaluations(evals, displayState.sortAscending);
  });
</script>
```

**Key Issues:**
1. No pagination state management
2. No infinite scroll trigger mechanism
3. All data loaded upfront

### 1.3 EvaluationsTimeline Component

Location: [`src/lib/components/timeline/EvaluationsTimeline.svelte`](src/lib/components/timeline/EvaluationsTimeline.svelte)

- Receives complete `evaluations` array as prop
- Renders all items in a single `{#each}` block
- Has client-side filtering for `showUnenrolled` toggle
- No virtualization or lazy rendering

### 1.4 Available Indexes

From [`src/convex/schema.ts:77-93`](src/convex/schema.ts:77):

```typescript
evaluations: defineTable({...})
  .index('by_studentId', ['studentId'])
  .index('by_studentId_teacherId', ['studentId', 'teacherId'])
  .index('by_teacherId', ['teacherId'])
  .index('by_timestamp', ['timestamp'])           // <-- Primary ordering index
  .index('by_category', ['category'])
  .index('by_category_subCategory', ['category', 'subCategory'])
```

## 2. Proposed Solution: Cursor-Based Pagination

### 2.1 Approach Overview

We'll use Convex's built-in cursor-based pagination with the following strategy:

1. **Primary pagination**: Use `by_timestamp` index for time-ordered pagination
2. **Filter handling**: Hybrid approach - server-side for unenrolled, client-side for text search
3. **Reactive updates**: Leverage Convex's real-time subscriptions for live updates
4. **Load more pattern**: Use intersection observer to trigger next page loads

### 2.2 Why This Approach?

| Approach | Pros | Cons |
|----------|------|------|
| **Cursor-based (chosen)** | Efficient, works with Convex reactivity, no offset drift | Requires cursor management |
| Offset-based | Simple to understand | Performance degrades with offset, stale data issues |
| Keyset pagination | Very efficient | Complex with multiple sort orders |

## 3. Proposed Convex Query Changes

### 3.1 New Paginated Query

Create a new query `listAllEvaluationsPaginated` in [`src/convex/evaluations.ts`](src/convex/evaluations.ts):

```typescript
export const listAllEvaluationsPaginated = query({
  args: {
    studentFilter: v.optional(v.string()),
    teacherFilter: v.optional(v.string()),
    showUnenrolled: v.optional(v.boolean()),
    cursor: v.optional(v.string()),      // Convex cursor
    limit: v.optional(v.number()),       // Page size (default: 20)
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    testToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.testToken);

    const limit = args.limit ?? 20;
    const order = args.sortOrder ?? 'desc';

    // Use paginate() instead of collect()
    const result = await ctx.db
      .query('evaluations')
      .withIndex('by_timestamp', (q) => 
        order === 'desc' ? q : q  // Order is handled by the index
      )
      .order(order)
      .paginate({
        cursor: args.cursor ?? null,
        numItems: limit
      });

    // Enrich only the current page
    const enriched = await enrichEvaluations(result.page);

    // Apply filters
    let filtered = enriched;
    
    // Server-side: unenrolled filter
    if (args.showUnenrolled !== true) {
      filtered = filtered.filter(e => e.status !== 'Not Enrolled');
    }

    // Server-side: text filters (may reduce results below limit)
    if (args.studentFilter?.trim()) {
      filtered = filtered.filter(e => 
        matchesMultiSearch(args.studentFilter, e.englishName ?? '')
      );
    }

    if (args.teacherFilter?.trim()) {
      filtered = filtered.filter(e => 
        matchesMultiSearch(args.teacherFilter, e.teacherName ?? '')
      );
    }

    return {
      page: filtered,
      cursor: result.continueCursor,
      hasMore: !result.isDone,
      // Include total count hint for UI
      pageSize: filtered.length
    };
  }
});
```

### 3.2 Helper Function for Enrichment

```typescript
async function enrichEvaluations(
  ctx: QueryCtx,
  evaluations: Doc<'evaluations'>[]
): Promise<EnrichedEvaluation[]> {
  const studentIds = [...new Set(evaluations.map(e => e.studentId))];
  const teacherIds = [...new Set(evaluations.map(e => e.teacherId))];

  const [students, teachers] = await Promise.all([
    Promise.all(studentIds.map(id => ctx.db.get(id))),
    Promise.all(teacherIds.map(id => ctx.db.get(id)))
  ]);

  const studentMap = new Map(
    students.filter((s): s is NonNullable<typeof s> => s != null)
      .map(s => [s._id, s])
  );
  const teacherMap = new Map(
    teachers.filter((t): t is NonNullable<typeof t> => t != null)
      .map(t => [t._id, t])
  );

  return evaluations.map(eval_ => {
    const student = studentMap.get(eval_.studentId);
    const teacher = teacherMap.get(eval_.teacherId);
    return {
      _id: eval_._id.toString(),
      studentId: eval_.studentId.toString(),
      englishName: student?.englishName || 'Unknown Student',
      grade: student?.grade || 0,
      studentIdCode: student?.studentId || 'N/A',
      status: student?.status || 'Not Enrolled',
      value: eval_.value,
      category: eval_.category,
      subCategory: eval_.subCategory,
      details: eval_.details,
      timestamp: eval_.timestamp,
      teacherName: teacher?.name || 'Unknown Teacher',
      teacherId: eval_.teacherId.toString()
    };
  });
}
```

### 3.3 Filter Change Handling

When filters change, we need to reset pagination:

```typescript
// In the Svelte component
$effect(() => {
  // Reset cursor when filters change
  if (studentFilter || teacherFilter || showUnenrolled !== undefined) {
    cursor = null;
    accumulatedEvaluations = [];
  }
});
```

**Important Consideration:** Text filters reduce the page size. We have two options:

1. **Accept smaller pages**: Simple, but may show fewer results than expected
2. **Over-fetch and filter**: Fetch more than needed, filter, return exact count

**Recommendation:** Use option 1 for simplicity, with a minimum threshold. If filtered results are too small, trigger another page load automatically.

## 4. Proposed Svelte Component Changes

### 4.1 Page Component Updates

Update [`src/routes/admin/evaluations/+page.svelte`](src/routes/admin/evaluations/+page.svelte):

```svelte
<script lang="ts">
  import { useQuery } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import { onMount, onDestroy } from 'svelte';

  // Filter states
  let studentFilter = $state('');
  let teacherFilter = $state('');
  let showUnenrolled = $state(false);

  // Pagination state
  let cursor = $state<string | null>(null);
  let accumulatedEvaluations = $state<EvaluationEntry[]>([]);
  let hasMore = $state(true);
  let isLoadingMore = $state(false);

  // Sort state
  let sortAscending = $state(false);

  // Query args
  const evaluationsQueryArgs = $derived({
    studentFilter: studentFilter || undefined,
    teacherFilter: teacherFilter || undefined,
    showUnenrolled,
    cursor,
    limit: 20,
    sortOrder: sortAscending ? 'asc' : 'desc'
  });

  // Main query
  const evaluationsQuery = useQuery(
    api.evaluations.listAllEvaluationsPaginated, 
    () => evaluationsQueryArgs
  );

  // Handle query results
  $effect(() => {
    if (evaluationsQuery.data) {
      if (cursor === null) {
        // First load or filter reset
        accumulatedEvaluations = evaluationsQuery.data.page;
      } else {
        // Append to existing
        accumulatedEvaluations = [
          ...accumulatedEvaluations,
          ...evaluationsQuery.data.page
        ];
      }
      hasMore = evaluationsQuery.data.hasMore;
      isLoadingMore = false;
    }
  });

  // Reset on filter change
  $effect(() => {
    // Track filter dependencies
    const filters = { studentFilter, teacherFilter, showUnenrolled };
    cursor = null;
    accumulatedEvaluations = [];
    hasMore = true;
  });

  // Load more function
  function loadMore() {
    if (!hasMore || isLoadingMore || evaluationsQuery.isLoading) return;
    isLoadingMore = true;
    cursor = evaluationsQuery.data?.cursor ?? null;
  }

  // Intersection observer for infinite scroll
  let sentinelElement: HTMLElement | null = $state(null);
  let observer: IntersectionObserver | null = null;

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { rootMargin: '100px' }
    );

    if (sentinelElement) {
      observer.observe(sentinelElement);
    }
  });

  onDestroy(() => {
    observer?.disconnect();
  });

  // Re-observe when sentinel changes
  $effect(() => {
    if (sentinelElement && observer) {
      observer.disconnect();
      observer.observe(sentinelElement);
    }
  });
</script>

<div class="mx-auto p-8 max-w-6xl">
  {#if evaluationsQuery.isLoading && cursor === null}
    <EvaluationsLoadingState />
  {:else if evaluationsQuery.error}
    <EvaluationsErrorState message={evaluationsQuery.error.message} />
  {:else if accumulatedEvaluations.length === 0}
    <EvaluationsEmptyState />
  {:else}
    <EvaluationsTimeline
      evaluations={accumulatedEvaluations}
      showStudentName={true}
      showTeacherName={true}
      enableCardClick={true}
      cardHref={(entry) => `/evaluations/student/${entry.studentIdCode}`}
      bind:sortAscending
      bind:showDetails={displayState.showDetails}
      {showUnenrolled}
      onToggleShowUnenrolled={toggleShowUnenrolled}
    >
      <!-- filters slot -->
    </EvaluationsTimeline>

    <!-- Load more sentinel -->
    <div bind:this={sentinelElement} class="h-4" />

    <!-- Loading indicator -->
    {#if isLoadingMore}
      <div class="flex justify-center py-4">
        <Loader class="size-6 animate-spin" />
      </div>
    {/if}

    <!-- End of list indicator -->
    {#if !hasMore && accumulatedEvaluations.length > 0}
      <div class="text-center py-4 text-muted-foreground text-sm">
        No more evaluations
      </div>
    {/if}
  {/if}
</div>
```

### 4.2 EvaluationsTimeline Component Updates

The timeline component can remain largely unchanged since it already accepts an array. However, consider adding:

1. **Virtualization hint**: For very long lists, consider virtualization
2. **Scroll position preservation**: When new items are added

```svelte
<!-- Optional: Add key for stable rendering -->
{#each filteredEvaluations as entry, idx (entry._id)}
```

### 4.3 New Utility Functions

Add to [`src/lib/evaluations/utils.ts`](src/lib/evaluations/utils.ts):

```typescript
// Merge paginated results while avoiding duplicates
export function mergePaginatedResults(
  existing: EvaluationEntry[],
  newPage: EvaluationEntry[]
): EvaluationEntry[] {
  const existingIds = new Set(existing.map(e => e._id));
  const uniqueNew = newPage.filter(e => !existingIds.has(e._id));
  return [...existing, ...uniqueNew];
}

// Check if we should auto-load more (when filtered results are too small)
export function shouldAutoLoadMore(
  pageSize: number,
  minThreshold: number = 5
): boolean {
  return pageSize < minThreshold;
}
```

## 5. Edge Cases and Considerations

### 5.1 Filter Changes During Pagination

**Problem:** User changes filter while paginated data exists.

**Solution:** Reset cursor and accumulated data when filters change:

```typescript
$effect(() => {
  // Dependencies trigger reset
  studentFilter; teacherFilter; showUnenrolled;
  cursor = null;
  accumulatedEvaluations = [];
});
```

### 5.2 Sort Order Changes

**Problem:** Changing sort order invalidates cursor.

**Solution:** Reset pagination on sort change:

```typescript
$effect(() => {
  sortAscending;
  cursor = null;
  accumulatedEvaluations = [];
});
```

### 5.3 Real-time Updates

**Problem:** New evaluations added while user is viewing paginated list.

**Solution:** Convex reactivity handles this automatically. The query will re-run and:
- If cursor is null (first page), results update immediately
- If cursor exists, consider showing a "New items available" toast

```typescript
// Optional: Track new items
$effect(() => {
  if (cursor === null && evaluationsQuery.data) {
    // First page updated
    const newCount = evaluationsQuery.data.page.length;
    if (newCount > accumulatedEvaluations.length) {
      // Show toast: "X new evaluations available"
    }
  }
});
```

### 5.4 Filtered Results Smaller Than Page Size

**Problem:** Text filters reduce results below `limit`, showing fewer items than expected.

**Solutions:**
1. **Auto-load more**: Automatically trigger next page if results < threshold
2. **Over-fetch**: Request more items than needed, filter server-side
3. **Accept behavior**: Show fewer items, user can load more

**Recommendation:** Option 1 with a threshold of 5 items.

### 5.5 Network Errors During Pagination

**Problem:** Network fails while loading more items.

**Solution:** Show error state with retry button:

```svelte
{#if evaluationsQuery.error && cursor !== null}
  <div class="text-center py-4">
    <p class="text-destructive">Failed to load more</p>
    <Button onclick={loadMore}>Retry</Button>
  </div>
{/if}
```

### 5.6 Scroll Position Preservation

**Problem:** New items loading may cause scroll jump.

**Solution:** Use CSS `overflow-anchor` or manual scroll position tracking:

```css
.timeline-container {
  overflow-anchor: auto;
}

.timeline-item {
  overflow-anchor: none;
}
```

### 5.7 Memory Management

**Problem:** Accumulating many items in memory.

**Solution:** Consider a maximum accumulation limit with "load previous" functionality:

```typescript
const MAX_ACCUMULATED = 200;

if (accumulatedEvaluations.length > MAX_ACCUMULATED) {
  // Remove oldest items, keep most recent
  accumulatedEvaluations = accumulatedEvaluations.slice(-MAX_ACCUMULATED);
}
```

## 6. Implementation Steps

### Phase 1: Backend Changes

1. **Create paginated query**
   - [ ] Add `listAllEvaluationsPaginated` query to [`src/convex/evaluations.ts`](src/convex/evaluations.ts)
   - [ ] Extract enrichment logic to helper function
   - [ ] Add cursor-based pagination using `.paginate()`
   - [ ] Handle sort order parameter

2. **Add unit tests**
   - [ ] Test pagination with various page sizes
   - [ ] Test cursor continuation
   - [ ] Test filter combinations
   - [ ] Test sort order changes

### Phase 2: Frontend Changes

3. **Update page component**
   - [ ] Add pagination state management
   - [ ] Implement intersection observer for infinite scroll
   - [ ] Handle filter/sort resets
   - [ ] Add loading states for initial load and load more

4. **Update utility functions**
   - [ ] Add `mergePaginatedResults` function
   - [ ] Add `shouldAutoLoadMore` function

5. **Update timeline component** (optional)
   - [ ] Add scroll position preservation
   - [ ] Consider virtualization for very long lists

### Phase 3: Testing

6. **Add E2E tests**
   - [ ] Test infinite scroll behavior
   - [ ] Test filter changes during pagination
   - [ ] Test sort order changes
   - [ ] Test network error recovery

7. **Performance testing**
   - [ ] Measure initial load time improvement
   - [ ] Test with large datasets (1000+ evaluations)
   - [ ] Monitor memory usage

### Phase 4: Cleanup

8. **Deprecate old query**
   - [ ] Keep `listAllEvaluations` for backward compatibility
   - [ ] Add deprecation notice
   - [ ] Update other pages using the old query

## 7. Alternative Approaches Considered

### 7.1 Virtual Scrolling Only

**Description:** Keep loading all data but use virtual scrolling to render only visible items.

**Pros:**
- Simpler backend (no pagination needed)
- Instant filtering/sorting

**Cons:**
- Still loads all data into memory
- Initial load time remains high
- Network bandwidth waste

**Verdict:** Not recommended for growing datasets.

### 7.2 Search-Based Pagination

**Description:** Use Convex search indexes for text filtering with pagination.

**Pros:**
- Efficient text search
- Built-in pagination support

**Cons:**
- Requires additional search indexes
- Eventual consistency (search indexes may be stale)
- More complex implementation

**Verdict:** Consider for future enhancement if text search becomes primary use case.

### 7.3 Hybrid Client/Server Filtering

**Description:** Server handles unenrolled filter, client handles text filters.

**Pros:**
- Reduces server load for text filtering
- Simpler server implementation

**Cons:**
- May load unnecessary data
- Client memory usage higher

**Verdict:** Current recommendation for initial implementation.

## 8. References

- [Convex Pagination Documentation](https://docs.convex.dev/database/pagination)
- [Reactive Pagination in Convex](https://stack.convex.dev/fully-reactive-pagination)
- [Overreacting Fix](https://stack.convex.dev/help-my-app-is-overreacting)
- [Svelte Infinite Scroll Example](https://svelte.dev/playground/aacd1a2d8eb14bb19e5cb3b0ad20fdbe?version=5.50.2)

## 9. Summary

This design proposes cursor-based pagination for the evaluations page using Convex's built-in `.paginate()` method. The key changes are:

1. **New paginated query** with cursor support
2. **Intersection observer** for infinite scroll trigger
3. **State management** for accumulated results
4. **Filter/sort reset** handling

The implementation prioritizes simplicity while maintaining Convex's real-time reactivity. Future enhancements could include search-based pagination for better text filtering performance.
