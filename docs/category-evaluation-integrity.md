# Category-Evaluation Data Integrity Issue

## Problem Statement

Evaluations store category and subcategory names as denormalized strings. When category names change or categories/subcategories are removed, evaluations become orphaned - they reference category names that no longer exist in the `point_categories` table.

This creates a data integrity gap where:
1. Historical evaluations lose their proper categorization context
2. Filtering/grouping evaluations by category becomes unreliable
3. Reports and analytics may show inconsistent or missing data

## Current Data Model

### `point_categories` Table

```typescript
// From schema.ts (actual schema)
defineTable({
  name: v.string(),
  subCategories: v.array(v.string()),  // Array of subcategory names
  e2eTag: v.optional(v.string())
}).index('by_e2eTag', ['e2eTag'])
```

### `evaluations` Table

```typescript
// From schema.ts (actual schema)
defineTable({
  studentId: v.id('students'),
  teacherId: v.id('users'),
  value: v.number(),              // Points value
  category: v.string(),           // Denormalized category name
  subCategory: v.string(),        // Denormalized subcategory name
  details: v.string(),
  timestamp: v.number(),
  semesterId: v.string(),
  e2eTag: v.optional(v.string())
})
  .index('by_category', ['category'])
  .index('by_category_subCategory', ['category', 'subCategory'])
  // ... other indexes
```

### The Integrity Gap

There is **no referential integrity** between these tables:
- Evaluations store string names, not IDs
- No foreign key constraints exist
- No cascade update/delete mechanisms in place

## How Orphaning Occurs

### Scenario 1: Category Rename

```
1. Admin renames category "Leadership" → "Leadership Skills"
2. point_categories document updated with new name
3. Existing evaluations still have category = "Leadership"
4. Evaluations now reference non-existent category name
```

**Impact**: All evaluations with the old category name become unlinked from the category.

### Scenario 2: Subcategory Rename

```
1. Admin renames subcategory "Teamwork" → "Team Collaboration"
2. point_categories document updated
3. Existing evaluations still have subCategory = "Teamwork"
4. Evaluations now reference non-existent subcategory name
```

**Impact**: Evaluations lose their subcategory association while the parent category link remains.

### Scenario 3: Category Deletion

```
1. Admin deletes category "Old Category"
2. point_categories document removed
3. All evaluations with category = "Old Category" become orphaned
4. No cleanup or reassignment of affected evaluations
```

**Impact**: 
- Evaluations reference a deleted category
- No way to determine what category these evaluations belonged to
- Historical data loses context

### Scenario 4: Subcategory Deletion

```
1. Admin removes subcategory "Deprecated Sub" from category
2. point_categories.subCategories array updated
3. Evaluations with subCategory = "Deprecated Sub" become orphaned
4. Parent category link remains, but subcategory is invalid
```

**Impact**:
- Evaluations have invalid subcategory references
- Points may no longer align with any valid subcategory
- Filtering by subcategory becomes inconsistent

## Proposed Solutions

### Solution 1: Store References (Normalized)

**Approach**: Change evaluations to store `categoryId: v.id('point_categories')` instead of category names.

```typescript
// Updated evaluations schema
defineTable({
  categoryId: v.id('point_categories'),
  subCategoryId: v.string(), // or index within subCategories array
  points: v.number(),
  // ... other fields
})
```

**Pros**:
- True referential integrity
- Category name changes automatically reflected in all evaluations
- Can enforce existence validation at database level
- Standard normalized database pattern

**Cons**:
- Requires data migration of all existing evaluations
- Extra queries needed to display category names
- Subcategory handling still needs resolution (array index vs. ID)
- Breaking change for existing queries and UI components

### Solution 2: Cascade Updates

**Approach**: Keep denormalized data but update all related evaluations when category/subcategory changes.

```typescript
// In categories.update()
export const update = mutation({
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    
    // If name changed, update all evaluations
    if (args.name && args.name !== category.name) {
      const evaluations = await ctx.db
        .query('evaluations')
        .withIndex('by_category', q => q.eq('category', category.name))
        .collect();
      
      for (const evaluation of evaluations) {
        await ctx.db.patch(evaluation._id, { category: args.name });
      }
    }
    
    // Handle subcategory renames/deletions similarly
    // ...
  }
});
```

**Pros**:
- No schema change required
- Minimal code change
- Evaluations remain self-contained for display
- Works well at current scale

**Cons**:
- O(n) operation - performance degrades with many evaluations
- Convex transaction limits may be hit with large datasets
- Deletion handling requires decision (delete evaluations? reassign? leave orphaned?)
- No protection against direct database manipulation

### Solution 3: Hybrid Approach

**Approach**: Store both `categoryId` reference and `categoryName` for display.

```typescript
// Updated evaluations schema
defineTable({
  categoryId: v.id('point_categories'),
  categoryName: v.string(),      // Cached for display
  subCategoryName: v.string(),   // Cached for display
  points: v.number(),
  // ... other fields
})
```

**Pros**:
- Can verify category existence on create/update
- Fast display without extra queries
- Can detect and repair orphaned records
- Gradual migration path possible

**Cons**:
- Two fields to keep in sync
- Migration still required
- Extra storage overhead
- Complexity in handling deletions

### Solution 4: Soft Delete with Archival

**Approach**: Never delete categories; mark them as archived instead.

```typescript
// Updated categories schema
defineTable({
  name: v.string(),
  subCategories: v.array(...),
  isArchived: v.boolean(),       // Soft delete flag
  archivedAt: v.optional(v.number()),
  // ... other fields
})
```

**Pros**:
- Evaluations always have valid category references
- Historical data preserved
- Can restore accidentally deleted categories
- Simple implementation

**Cons**:
- Category list grows indefinitely
- UI must filter out archived categories
- Doesn't solve rename problem
- May confuse admins if not clearly indicated

## Subcategory Normalization Analysis

### Question: Should subcategories be normalized into a separate table?

**Answer: No - it would be overkill for the current requirements.**

### Current Model
- `point_categories.subCategories: v.array(v.string())` - stored as string array
- Typical volume: 0-2 subcategories per category
- Subcategories are simple labels with no additional metadata

### Why Not Normalize?

| Factor | Separate Table | Array (Current) |
|--------|---------------|-----------------|
| Metadata needed | Required for descriptions, icons, point values | Not needed - just strings |
| Independent queries | Required if subcategories accessed alone | Never happens |
| Data volume | Works for large datasets | 0-2 items is trivial |
| Schema complexity | Adds table, indexes, relations | Simple, self-contained |
| Query complexity | Requires joins/lookups | Single document fetch |

### Key Findings

1. **No Independent Metadata Needed** - Subcategories are simple labels with no descriptions, icons, or point values
2. **Always Accessed Via Parent Category** - Never queried independently in the UI
3. **Trivial Data Volume** - 0-2 subcategories per category
4. **Rare Edits** - Category/subcategory edits are infrequent

### When to Reconsider

If future requirements include:
- Descriptions or icons for subcategories
- Point value ranges per subcategory
- Independent ordering/sorting
- Audit history on subcategories
- Cross-category subcategory sharing

Then normalization would be appropriate. Currently, it would be premature optimization.

### Recommended Approach for Subcategories

Keep the array structure but handle renames/deletes via cascade operations when category is modified:
- When subcategory is renamed: update all evaluations with matching category + old subCategory
- When subcategory is deleted: warn user, optionally nullify or delete affected evaluations

## Recommendation

**Since there is no existing data, Solution 1 (Store References - Normalized) is the recommended approach.**

This provides:
1. **True referential integrity** - Evaluations reference categories by ID
2. **Automatic reflection** - Category name changes automatically appear in evaluations
3. **No migration needed** - Clean implementation without data migration concerns
4. **Future-proof** - Standard normalized pattern that scales well

### Why Not Denormalized (Solution 2)?

While denormalized data offers faster reads without joins, the tradeoffs include:
- Integrity must be maintained manually via cascade updates
- Risk of orphaned data if cascade logic fails
- More complex code to handle renames/deletes
- Technical debt that compounds over time

### Implementation Priority

1. **High Priority**: Update schema to use `categoryId` reference
2. **High Priority**: Update all evaluation queries/mutations to use category ID
3. **High Priority**: Add validation to ensure category exists before evaluation creation
4. **Medium Priority**: Implement soft delete for categories
5. **Medium Priority**: Add UI for category management with impact preview

## Implementation Notes

### Schema Update (Normalized Approach)

```typescript
// Updated evaluations schema in convex/schema.ts

evaluations: defineTable({
  studentId: v.id('students'),
  teacherId: v.id('users'),
  value: v.number(),
  categoryId: v.id('point_categories'),    // Reference to category
  subCategory: v.string(),                  // Subcategory name (still denormalized)
  details: v.string(),
  timestamp: v.number(),
  semesterId: v.string(),
  e2eTag: v.optional(v.string())
})
  .index('by_studentId', ['studentId'])
  .index('by_studentId_teacherId', ['studentId', 'teacherId'])
  .index('by_teacherId', ['teacherId'])
  .index('by_timestamp', ['timestamp'])
  .index('by_categoryId', ['categoryId'])              // Updated index
  .index('by_categoryId_subCategory', ['categoryId', 'subCategory'])  // Updated index
  .index('by_e2eTag', ['e2eTag']),
```

### Subcategory Handling Considerations

Since subcategories are stored as a simple string array in `point_categories`, there are two options for handling subcategory references:

**Option A: Keep subcategory name denormalized**
- Store `subCategory: v.string()` in evaluations
- Must cascade updates when subcategory names change
- Simpler initial implementation

**Option B: Use subcategory index**
- Store `subCategoryIndex: v.number()` in evaluations
- References position in the `subCategories` array
- More robust but requires array position stability
- Problematic if subcategories can be reordered

**Recommended: Option A** with cascade updates for subcategory renames.

### Evaluation Creation with Category Validation

```typescript
// In convex/evaluations.ts

export const create = mutation({
  args: {
    studentId: v.id('students'),
    categoryId: v.id('point_categories'),
    subCategory: v.string(),
    value: v.number(),
    details: v.string(),
    semesterId: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate category exists
    const category = await ctx.db.get(args.categoryId);
    
    if (!category) {
      throw new Error(`Category with ID ${args.categoryId} does not exist`);
    }
    
    // Validate subcategory exists within category
    if (!category.subCategories.includes(args.subCategory)) {
      throw new Error(
        `Subcategory "${args.subCategory}" does not exist in category "${category.name}"`
      );
    }
    
    // Proceed with creation
    return await ctx.db.insert('evaluations', {
      studentId: args.studentId,
      teacherId: ctx.userId, // From auth context
      categoryId: args.categoryId,
      subCategory: args.subCategory,
      value: args.value,
      details: args.details,
      timestamp: Date.now(),
      semesterId: args.semesterId,
    });
  }
});
```

### Querying Evaluations with Category Name

```typescript
// In convex/evaluations.ts

export const getByStudent = query({
  args: { studentId: v.id('students') },
  handler: async (ctx, args) => {
    const evaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_studentId', q => q.eq('studentId', args.studentId))
      .collect();
    
    // Fetch category names for each evaluation
    const evaluationsWithCategories = await Promise.all(
      evaluations.map(async (evaluation) => {
        const category = await ctx.db.get(evaluation.categoryId);
        return {
          ...evaluation,
          categoryName: category?.name ?? 'Unknown Category',
          categoryExists: category !== null,
        };
      })
    );
    
    return evaluationsWithCategories;
  }
});
```

### Subcategory Rename Cascade

```typescript
// In convex/categories.ts

export const renameSubCategory = mutation({
  args: {
    categoryId: v.id('point_categories'),
    oldName: v.string(),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    
    if (!category) {
      throw new Error('Category not found');
    }
    
    // Update subcategories array
    const subCategoryIndex = category.subCategories.indexOf(args.oldName);
    if (subCategoryIndex === -1) {
      throw new Error(`Subcategory "${args.oldName}" not found`);
    }
    
    const newSubCategories = [...category.subCategories];
    newSubCategories[subCategoryIndex] = args.newName;
    
    await ctx.db.patch(args.categoryId, { subCategories: newSubCategories });
    
    // Cascade update to evaluations
    const affectedEvaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_categoryId_subCategory', q => 
        q.eq('categoryId', args.categoryId).eq('subCategory', args.oldName)
      )
      .collect();
    
    for (const evaluation of affectedEvaluations) {
      await ctx.db.patch(evaluation._id, { subCategory: args.newName });
    }
    
    return { updatedCount: affectedEvaluations.length };
  }
});
```

### Subcategory Deletion Handling

```typescript
// In convex/categories.ts

export const removeSubCategory = mutation({
  args: {
    categoryId: v.id('point_categories'),
    subCategoryName: v.string(),
    action: v.union(
      v.literal('archive'),      // Keep evaluations, mark as orphaned
      v.literal('delete'),       // Delete affected evaluations
      v.literal('reassign'),     // Move to another subcategory
    ),
    reassignTo: v.optional(v.string()),  // For 'reassign' action
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    
    // Find affected evaluations
    const affectedEvaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_categoryId_subCategory', q => 
        q.eq('categoryId', args.categoryId).eq('subCategory', args.subCategoryName)
      )
      .collect();
    
    // Handle based on action
    switch (args.action) {
      case 'delete':
        for (const evaluation of affectedEvaluations) {
          await ctx.db.delete(evaluation._id);
        }
        break;
        
      case 'reassign':
        if (!args.reassignTo) {
          throw new Error('reassignTo is required for reassign action');
        }
        for (const evaluation of affectedEvaluations) {
          await ctx.db.patch(evaluation._id, { subCategory: args.reassignTo });
        }
        break;
        
      case 'archive':
        // Evaluations keep their subCategory name
        // UI should handle display of orphaned subcategories
        break;
    }
    
    // Remove from category
    const newSubCategories = category.subCategories.filter(
      sc => sc !== args.subCategoryName
    );
    await ctx.db.patch(args.categoryId, { subCategories: newSubCategories });
    
    return { affectedCount: affectedEvaluations.length };
  }
});
```

### Soft Delete for Categories

```typescript
// Updated categories schema
point_categories: defineTable({
  name: v.string(),
  subCategories: v.array(v.string()),
  isArchived: v.optional(v.boolean()),     // Soft delete flag
  archivedAt: v.optional(v.number()),      // When archived
  e2eTag: v.optional(v.string())
}).index('by_e2eTag', ['e2eTag'])

// In convex/categories.ts
export const archive = mutation({
  args: { id: v.id('point_categories') },
  handler: async (ctx, args) => {
    // Check for existing evaluations
    const affectedCount = await ctx.db
      .query('evaluations')
      .withIndex('by_categoryId', q => q.eq('categoryId', args.id))
      .count();
    
    // Soft delete - archive instead of remove
    await ctx.db.patch(args.id, { 
      isArchived: true,
      archivedAt: Date.now()
    });
    
    return { affectedCount };
  }
});

// Update getAll to exclude archived
export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db
      .query('point_categories')
      .filter(q => q.neq(q.field('isArchived'), true))
      .collect();
  }
});
```

## Migration Considerations

**Since there is no existing data, no migration is required.** The schema can be updated directly without needing to:

- Backfill existing evaluation records
- Maintain backward compatibility
- Run data transformation scripts
- Handle downtime for migration

### Implementation Steps

1. **Update schema** - Add `categoryId` field, remove `category` string field
2. **Update indexes** - Change from `by_category` to `by_categoryId`
3. **Update mutations** - Modify create/update to use category ID
4. **Update queries** - Join with categories table for display
5. **Update UI** - Category selectors should pass ID, not name
6. **Add validation** - Ensure category exists before evaluation creation

### Breaking Changes

The following will need to be updated when implementing this change:

| Component | Current | Updated |
|-----------|---------|---------|
| Schema | `category: v.string()` | `categoryId: v.id('point_categories')` |
| Index | `by_category` | `by_categoryId` |
| Create mutation | Accepts category name | Accepts category ID |
| Queries | Direct category name | Join to get category name |
| UI forms | Category name in form | Category ID in form |

## User Interaction and Notification

When category modifications affect existing evaluations, users need clear communication about the impact. This section outlines the UX considerations and implementation patterns.

### Impact Preview Before Modification

Before committing category changes, show users a preview of affected evaluations:

```
┌─────────────────────────────────────────────────────────────┐
│ Rename Category                                             │
├─────────────────────────────────────────────────────────────┤
│ Current name: Leadership                                    │
│ New name: Leadership Skills                                 │
│                                                             │
│ ⚠️ This will update 47 evaluations that reference this      │
│    category. This action cannot be easily undone.           │
│                                                             │
│ [Cancel]                    [Rename & Update Evaluations]   │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Pattern

```typescript
// Add a preview query to check impact before modification
export const previewCategoryRename = query({
  args: {
    id: v.id('point_categories'),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    
    // Count affected evaluations
    const affectedEvaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_category', q => q.eq('category', category.name))
      .collect();
    
    return {
      currentName: category.name,
      newName: args.newName,
      affectedCount: affectedEvaluations.length,
      recentEvaluations: affectedEvaluations.slice(0, 5).map(e => ({
        id: e._id,
        studentId: e.studentId,
        date: e.date,
      })),
    };
  }
});
```

### UI Components for Impact Display

```svelte
<!-- CategoryRenameDialog.svelte -->
<script lang="ts">
  import { useQuery } from 'convex-svelte';
  import { api } from '$lib/convex/api';
  
  let { categoryId, newName, onConfirm, onCancel } = $props();
  
  const impact = useQuery(api.categories.previewCategoryRename, {
    id: categoryId,
    newName: newName,
  });
</script>

<Dialog>
  <DialogHeader>
    <DialogTitle>Rename Category</DialogTitle>
  </DialogHeader>
  
  <DialogContent>
    <p>Renaming "{impact?.currentName}" to "{impact?.newName}"</p>
    
    {#if impact?.affectedCount > 0}
      <Alert variant="warning">
        <AlertTitle>Impact Warning</AlertTitle>
        <AlertDescription>
          This will update {impact.affectedCount} evaluation(s) that 
          reference this category.
        </AlertDescription>
      </Alert>
    {:else}
      <Alert variant="info">
        No evaluations are affected by this change.
      </Alert>
    {/if}
  </DialogContent>
  
  <DialogFooter>
    <Button variant="outline" onclick={onCancel}>Cancel</Button>
    <Button 
      variant="default" 
      onclick={onConfirm}
      disabled={impact === undefined}
    >
      {#if impact?.affectedCount > 0}
        Rename & Update {impact.affectedCount} Evaluations
      {:else}
        Rename Category
      {/if}
    </Button>
  </DialogFooter>
</Dialog>
```

### Notification Patterns

#### 1. Pre-Action Confirmation

For destructive or high-impact operations:

| Operation | Impact Level | User Action Required |
|-----------|--------------|---------------------|
| Category rename | Medium | Show count, require confirmation if > 0 evaluations |
| Subcategory rename | Medium | Show count, require confirmation if > 0 evaluations |
| Category delete | High | Show count, require explicit confirmation |
| Subcategory delete | High | Show count, require explicit confirmation |

#### 2. Progress Indication

For operations affecting many evaluations:

```svelte
{#if isUpdating}
  <div class="progress-indicator">
    <Progress value={updateProgress} max={totalToUpdate} />
    <p>Updating evaluations... {updateProgress} of {totalToUpdate}</p>
  </div>
{/if}
```

#### 3. Success/Acknowledgment

After modification completes:

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ Category Updated Successfully                            │
│                                                             │
│ Category renamed from "Leadership" to "Leadership Skills"   │
│ 47 evaluations were updated to reflect this change.         │
│                                                             │
│ [View Updated Evaluations]              [Dismiss]           │
└─────────────────────────────────────────────────────────────┘
```

### Deletion Handling Options

When deleting categories or subcategories, offer users choices:

```
┌─────────────────────────────────────────────────────────────┐
│ Delete Category: Leadership                                 │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ This category has 23 evaluations associated with it.     │
│                                                             │
│ What would you like to do with these evaluations?           │
│                                                             │
│ ○ Archive category (recommended)                            │
│   Category will be hidden but evaluations preserved         │
│                                                             │
│ ○ Reassign to another category                              │
│   Move evaluations to: [Select category ▼]                  │
│                                                             │
│ ○ Delete evaluations                                        │
│   Permanently remove all 23 evaluations                     │
│                                                             │
│ [Cancel]                              [Proceed]             │
└─────────────────────────────────────────────────────────────┘
```

### Audit Trail

Log all category modifications with their impact:

```typescript
// In convex/audit.ts
export const logCategoryModification = mutation({
  args: {
    action: v.string(),           // "rename", "delete", "archive"
    categoryId: v.id('point_categories'),
    oldValues: v.optional(v.object({ name: v.string() })),
    newValues: v.optional(v.object({ name: v.string() })),
    affectedEvaluationCount: v.number(),
    performedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('audit_log', {
      ...args,
      timestamp: Date.now(),
    });
  }
});
```

### Error Recovery

Provide undo capability for recent modifications:

```typescript
// Store pre-modification state for potential undo
export const undoCategoryRename = mutation({
  args: {
    categoryId: v.id('point_categories'),
    previousName: v.string(),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    
    // Revert category name
    await ctx.db.patch(args.categoryId, { name: args.previousName });
    
    // Cascade the revert to evaluations
    await cascadeCategoryRename(ctx, category.name, args.previousName);
  }
});
```

### UI Notification Timing

| Scenario | Timing | Duration |
|----------|--------|----------|
| Success with 0 affected | Immediate | 3 seconds auto-dismiss |
| Success with 1-10 affected | Immediate | 5 seconds or manual dismiss |
| Success with 11+ affected | Immediate | Manual dismiss only |
| Error during update | Immediate | Manual dismiss only |
| Long-running update | Progress bar | Until complete |

## Testing Requirements

Any implementation should include tests for:

1. **Category rename cascade**: Verify all evaluations update correctly
2. **Subcategory rename cascade**: Verify all evaluations update correctly
3. **Category soft delete**: Verify category is archived, not removed
4. **Evaluation creation validation**: Verify rejection for invalid category/subcategory
5. **Orphan detection**: Verify job correctly identifies orphaned evaluations
6. **Performance**: Test cascade operations with large evaluation counts

## E2E Test Infrastructure Impact

### Effort Estimate: LOW-MEDIUM

The test infrastructure is well-abstracted with helper functions, minimizing the blast radius of the schema change.

### Files Requiring Changes

| File | Changes Needed | Effort |
|------|----------------|--------|
| [`src/convex/dataFactory.ts`](src/convex/dataFactory.ts) | `createEvaluationForStudent`: store `categoryId` instead of `category.name` | Low |
| [`src/convex/testE2E.ts`](src/convex/testE2E.ts) | 4 functions: `e2eCreateEvaluationForCategory`, `e2eCheckEvaluationExists`, `e2eSeedAll`, `e2eSeedStudentsForDisable` | Low-Medium |
| [`src/convex/testData/weeklyReports.ts`](src/convex/testData/weeklyReports.ts) | Use `categoryId` from existing `categoryIds` array | Low |
| [`src/lib/e2e-utils.ts`](src/lib/e2e-utils.ts) | Optional: update `E2EUtils` interface | Low |
| [`e2e/convex-client.ts`](e2e/convex-client.ts) | `createEvalForCategory`: look up category ID or accept ID param | Low |

### Files That Would NOT Need Changes

The following test files use high-level helpers and would remain unchanged:
- `e2e/evaluations.spec.ts` - Uses `createCategoryWithSubs()` and `createEvaluationForStudent()` helpers
- `e2e/student-timeline.spec.ts` - Uses `createEvaluationForStudent()` helper
- `e2e/categories.spec.ts` - Uses `createEvaluationForStudent()` helper
- `e2e/weekly-reports.spec.ts` - Uses `createWeeklyReportTestData()` helper
- `e2e/integration.spec.ts` - Uses `createCategory()` and helpers

### Recommended Approach: Keep Test Helpers Name-Based

Keep test helpers accepting `categoryName` and look up the ID internally:

```typescript
// src/convex/dataFactory.ts
async createEvaluationForStudent(args) {
  // Look up category by name or e2eTag
  const category = await findCategoryByNameOrTag(args);
  
  await ctx.db.insert('evaluations', {
    categoryId: category._id,  // Store ID internally
    // ...
  });
}
```

**Benefits:**
- Tests remain readable: `createEvalForCategory('Academic Excellence')`
- No changes needed to test files
- Matches how users interact with the UI

### Test Assertions

Most e2e tests verify category names in the **UI**, not in evaluation records. These UI assertions would remain valid because the UI would still display category names (looked up by ID).

## Related Files

- [`src/convex/schema.ts`](../src/convex/schema.ts) - Database schema definitions
- [`src/convex/categories.ts`](../src/convex/categories.ts) - Category CRUD operations
- [`src/convex/evaluations.ts`](../src/convex/evaluations.ts) - Evaluation CRUD operations
- [`src/convex/categories.test.ts`](../src/convex/categories.test.ts) - Category tests
- [`src/convex/evaluations.test.ts`](../src/convex/evaluations.test.ts) - Evaluation tests

## Archived Category Conflicts

### The Problem

When categories are soft-deleted (archived) and hidden from users, a critical question arises: **Can an admin create a new category with the same name as an archived one?**

This section analyzes the potential conflicts and proposes solutions.

### Current State Analysis

#### Schema Reality Check

```typescript
// Current schema in src/convex/schema.ts
point_categories: defineTable({
  name: v.string(),                        // NO unique constraint
  subCategories: v.array(v.string()),
  e2eTag: v.optional(v.string())
}).index('by_e2eTag', ['e2eTag'])
```

**Key Finding**: There is **NO unique index** on `point_categories.name`. This means:
- Multiple categories CAN legally have the same name
- No database-level protection against duplicates exists

#### Current Implementation

| Function | Behavior |
|----------|----------|
| [`categories.list`](src/convex/categories.ts:5-12) | Returns ALL categories (no archived filter) |
| [`categories.create`](src/convex/categories.ts:74-99) | Does NOT check for duplicate names |
| [`categories.remove`](src/convex/categories.ts:118-139) | Hard delete with cascade to evaluations |

**Key Finding**: No archive functionality exists yet. The current `remove` does a hard delete.

### Conflict Scenarios

#### Scenario A: Archive → Create Same Name (String-Based References)

If we implement soft delete while keeping string-based category references:

```
1. Admin archives "Creativity" (sets isArchived: true)
2. Admin creates new "Creativity" category
3. Now TWO categories named "Creativity" exist in database
4. Old evaluations have category: "Creativity" 
5. Which "Creativity" do they refer to?
```

**Problem**: Evaluations store `category: v.string()`, not `categoryId: v.id()`. With two categories having the same name, there's no way to distinguish which category an evaluation originally referenced.

**Impact**:
- Query `by_category` index matches evaluations from BOTH categories
- Historical data loses its precise linkage
- Restoring the archived category creates further confusion

#### Scenario B: Archive → Create Same Name (ID-Based References)

If we implement soft delete WITH ID-based references (Solution 1):

```
1. Admin archives "Creativity" (categoryId: "abc123", isArchived: true)
2. Admin creates new "Creativity" (categoryId: "def456")
3. Old evaluations reference categoryId: "abc123" (archived)
4. New evaluations reference categoryId: "def456" (active)
5. No ambiguity - IDs are unique
```

**Result**: ID references completely eliminate this conflict. Each evaluation points to exactly one category, regardless of name overlaps.

### Proposed Solutions for Name Conflicts

#### Option 1: Unique Name Constraint with Archived Exclusion

**Approach**: Enforce unique category names among non-archived categories only.

```typescript
// In categories.create mutation
export const create = mutation({
  args: { name: v.string(), subCategories: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Check for existing NON-ARCHIVED category with same name
    const existing = await ctx.db
      .query('point_categories')
      .filter(q => 
        q.and(
          q.eq(q.field('name'), args.name),
          q.neq(q.field('isArchived'), true)
        )
      )
      .first();
    
    if (existing) {
      throw new Error(`Category "${args.name}" already exists`);
    }
    
    // Allow creation even if archived category has same name
    return await ctx.db.insert('point_categories', {
      name: args.name,
      subCategories: args.subCategories,
      isArchived: false
    });
  }
});
```

**Pros**:
- Prevents user confusion (no duplicate visible names)
- Allows recycling names from archived categories
- Works with string-based references if archived categories are truly "dead"

**Cons**:
- Convex doesn't support partial unique indexes - must enforce in application code
- Race conditions possible (two admins create same name simultaneously)
- If archived category is restored, name conflict emerges

#### Option 2: Auto-Rename on Archive

**Approach**: Automatically suffix archived category names to free up the original name.

```typescript
export const archive = mutation({
  args: { id: v.id('point_categories') },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    
    // Rename to free up the original name
    const archivedName = `${category.name} (archived ${new Date().toISOString().split('T')[0]})`;
    
    await ctx.db.patch(args.id, {
      name: archivedName,
      isArchived: true,
      archivedAt: Date.now()
    });
    
    // Cascade rename to evaluations if using string references
    // (Not needed if using ID references)
  }
});
```

**Pros**:
- Original name immediately available for reuse
- Clear visual distinction in database
- No ambiguity in evaluation references

**Cons**:
- Modifies historical data (category name changes)
- If using string references, must cascade to evaluations
- Archived category names become "ugly"

#### Option 3: ID-Based References (Recommended)

**Approach**: Use `categoryId: v.id('point_categories')` instead of `category: v.string()`.

This is already the recommended solution (Solution 1) and completely eliminates name conflict issues:

```typescript
// Evaluations reference by ID, not name
evaluations: defineTable({
  categoryId: v.id('point_categories'),  // Unique ID reference
  subCategory: v.string(),
  // ... other fields
})
```

**Why This Solves Archive Conflicts**:

| Scenario | String Reference | ID Reference |
|----------|-----------------|--------------|
| Archive "Creativity" | Evaluations have `category: "Creativity"` | Evaluations have `categoryId: "abc123"` |
| Create new "Creativity" | Two categories with same name | New category gets `categoryId: "def456"` |
| Query evaluations | Ambiguous - which "Creativity"? | Precise - ID points to exact category |
| Restore archived | Name conflict! | No conflict - different IDs |

**Pros**:
- Complete elimination of name-based ambiguity
- Archived categories can coexist with same-named active categories
- No application-level uniqueness enforcement needed
- Standard normalized database pattern

**Cons**:
- Requires schema migration (already planned)
- Extra query to display category name

### Recommendation

**Use ID-Based References (Option 3)** as the primary solution. This:

1. **Eliminates archive name conflicts entirely** - IDs are always unique
2. **Aligns with Solution 1** already recommended in this document
3. **Preserves historical accuracy** - evaluations always point to the correct category
4. **Simplifies archive/restore operations** - no name manipulation needed

### Implementation Considerations

#### Archive Mutation with ID References

```typescript
export const archive = mutation({
  args: { 
    id: v.id('point_categories'),
    testToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.testToken);
    
    const category = await ctx.db.get(args.id);
    if (!category) throw new Error('Category not found');
    
    // Count affected evaluations for user feedback
    const affectedCount = await ctx.db
      .query('evaluations')
      .withIndex('by_categoryId', q => q.eq('categoryId', args.id))
      .count();
    
    // Soft delete - just mark as archived
    await ctx.db.patch(args.id, {
      isArchived: true,
      archivedAt: Date.now()
    });
    
    return { affectedCount };
  }
});
```

#### List Query Filtering Archived

```typescript
export const list = query({
  args: { testToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.testToken);
    if (!user) return [];
    
    // Filter out archived categories for normal users
    return await ctx.db
      .query('point_categories')
      .filter(q => q.neq(q.field('isArchived'), true))
      .collect();
  }
});
```

#### Admin View Including Archived

```typescript
export const listIncludingArchived = query({
  args: { testToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdminRole(ctx, args.testToken);
    
    return await ctx.db.query('point_categories').collect();
  }
});
```

### Edge Cases to Handle

#### 1. Restoring an Archived Category

```typescript
export const restore = mutation({
  args: { id: v.id('point_categories') },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    
    // Check if active category with same name exists
    const conflict = await ctx.db
      .query('point_categories')
      .filter(q =>
        q.and(
          q.eq(q.field('name'), category.name),
          q.neq(q.field('_id'), args.id),
          q.neq(q.field('isArchived'), true)
        )
      )
      .first();
    
    if (conflict) {
      throw new Error(
        `Cannot restore: an active category named "${category.name}" already exists`
      );
    }
    
    await ctx.db.patch(args.id, {
      isArchived: false,
      archivedAt: undefined
    });
  }
});
```

#### 2. Permanent Deletion of Archived Category

```typescript
export const permanentDelete = mutation({
  args: { id: v.id('point_categories') },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    
    if (!category.isArchived) {
      throw new Error('Only archived categories can be permanently deleted');
    }
    
    // Delete all associated evaluations
    const evaluations = await ctx.db
      .query('evaluations')
      .withIndex('by_categoryId', q => q.eq('categoryId', args.id))
      .collect();
    
    for (const eval_ of evaluations) {
      await ctx.db.delete(eval_._id);
    }
    
    await ctx.db.delete(args.id);
    
    return { deletedEvaluations: evaluations.length };
  }
});
```

### Summary Table

| Approach | Name Conflicts | Evaluation Integrity | Complexity |
|----------|---------------|---------------------|------------|
| String refs + unique constraint | Partial (archived excluded) | At risk | Medium |
| String refs + auto-rename | No | Requires cascade | Medium |
| ID refs (recommended) | No | Guaranteed | Low |

## Change History

| Date | Author | Description |
|------|--------|-------------|
| 2026-02-13 | Documentation | Initial creation - documented integrity issue and solutions |
| 2026-02-13 | Documentation | Added user interaction/notification patterns |
| 2026-02-13 | Documentation | Updated to reflect actual schema (subCategories as string array) |
| 2026-02-13 | Documentation | Updated recommendation to Solution 1 (no existing data = no migration needed) |
| 2026-02-13 | Documentation | Added Archived Category Conflicts section with analysis and solutions |
