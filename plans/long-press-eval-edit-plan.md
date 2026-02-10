# Implementation Plan: Long-Press Edit/Delete for Evaluations

## Overview

Implement a long-press interaction on evaluation cards that allows users to edit or delete evaluations they've given. This feature will be available in both:
- [`src/routes/evaluations/+page.svelte`](src/routes/evaluations/+/page.svelte) - Recent evaluations list
- [`src/routes/evaluations/student/[studentId]/+page.svelte`](src/routes/evaluations/student/[studentId]/+page.svelte) - Student evaluation history

## Current State Analysis

### Existing Components
- **EvaluationsTimeline**: Renders evaluation cards with `role="button"` or `role="group"` and `tabindex="0"`
- **Demo mode**: Student page supports `?demo=teacher` and `?demo=admin` query params

### Backend State
- **Existing mutations**: `create`, `remove`
- **Missing mutation**: `update` - needs to be created

## Convex Mutation: `update`

Add to [`src/convex/evaluations.ts`](src/convex/evaluations.ts):

```typescript
export const update = mutation({
  args: {
    id: v.id('evaluations'),
    value: v.optional(v.number()),
    category: v.optional(v.string()),
    subCategory: v.optional(v.string()),
    details: v.optional(v.string()),
    testToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userDoc = await requireUserProfile(ctx, args.testToken);
    const evaluation = await ctx.db.get(args.id);
    
    if (!evaluation) {
      throw new Error('Evaluation not found');
    }
    
    // Only allow editing own evaluations (admins are also teachers)
    // Admins can only edit evaluations they created, same as regular teachers
    if (evaluation.teacherId !== userDoc._id) {
      throw new Error('Not authorized to edit this evaluation');
    }
    
    const updates: Partial<typeof evaluation> = {};
    if (args.value !== undefined) updates.value = args.value;
    if (args.category !== undefined) updates.category = args.category;
    if (args.subCategory !== undefined) updates.subCategory = args.subCategory;
    if (args.details !== undefined) updates.details = args.details;
    
    await ctx.db.patch(args.id, updates);
    
    await ctx.db.insert('audit_logs', {
      action: 'update_evaluation',
      performerId: userDoc._id,
      targetTable: 'evaluations',
      targetId: args.id.toString(),
      oldValue: { ...evaluation },
      newValue: updates,
      timestamp: Date.now()
    });
    
    return { success: true };
  }
});
```

**Optimization Notes**:
- Uses `ctx.db.patch()` for partial updates (only modified fields)
- Single audit log insertion
- Authorization check before any database operations
- Returns early on errors to avoid unnecessary operations

### 2. New Convex Mutation: `getEvaluation`

Add to [`src/convex/evaluations.ts`](src/convex/evaluations.ts) for fetching single evaluation details:

```typescript
export const getEvaluation = query({
  args: { id: v.id('evaluations'), testToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx, args.testToken);
    if (!user) return null;
    
    const evaluation = await ctx.db.get(args.id);
    if (!evaluation) return null;
    
    return evaluation;
  }
});
```

### 3. Extend EvaluationEntry Type

Update [`src/lib/components/timeline/types.ts`](src/lib/components/timeline/types.ts):

```typescript
export interface EvaluationEntry {
  _id: string;
  value: number;
  category: string;
  subCategory?: string;
  details?: string;
  timestamp: number;
  teacherName?: string;
  isAdmin?: boolean;
  englishName?: string;
  grade?: number;
  studentId?: string;
  teacherId?: string;  // NEW: for ownership check
}
```

### 4. Modify EvaluationsTimeline Component

Update [`src/lib/components/timeline/EvaluationsTimeline.svelte`](src/lib/components/timeline/EvaluationsTimeline.svelte):

Add new props:
```typescript
interface Props {
  // ... existing props
  enableLongPress?: boolean;
  onLongPress?: (entry: EvaluationEntry) => void;
  currentUserId?: string;  // For ownership check
  canEditEntry?: (entry: EvaluationEntry) => boolean;  // Callback to check editability
}
```

Add long-press handling (mouse AND touch):
```svelte
<script lang="ts">
  let longPressTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let isLongPress = $state(false);
  const LONG_PRESS_THRESHOLD = 500; // ms
  
  function handleMouseDown(entry: EvaluationEntry): void {
    if (!enableLongPress || !onLongPress) return;
    if (!canEditEntry?.(entry)) return; // Check editability
    
    isLongPress = false;
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      onLongPress(entry);
    }, LONG_PRESS_THRESHOLD);
  }
  
  function handleMouseUp(): void {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
  
  function handleTouchStart(entry: EvaluationEntry): void {
    if (!enableLongPress || !onLongPress) return;
    if (!canEditEntry?.(entry)) return; // Check editability
    
    isLongPress = false;
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      onLongPress(entry);
    }, LONG_PRESS_THRESHOLD);
  }
  
  function handleTouchEnd(): void {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
  
  function handleClick(entry: EvaluationEntry): void {
    // Only navigate if NOT a long-press
    if (!isLongPress && enableCardClick && onCardClick) {
      onCardClick(entry);
    }
  }
</script>
```

Update card element:
```svelte
<div
  class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(entry)}"
  role="button"
  tabindex="0"
  aria-label="Evaluation for {entry.category}, {entry.value > 0 ? '+' : ''}{entry.value} points"
  onmousedown={() => handleMouseDown(entry)}
  onmouseup={handleMouseUp}
  onmouseleave={handleMouseUp}
  ontouchstart={() => handleTouchStart(entry)}
  ontouchend={handleTouchEnd}
  onclick={() => handleClick(entry)}
  onkeydown={(e) => e.key === 'Enter' && handleCardClick(entry)}
>
```

### 5. Update Parent Pages with Edit/Delete Callbacks

#### [`src/routes/evaluations/+page.svelte`](src/routes/evaluations/+/page.svelte)

Add to script section:
```typescript
import { Pencil, Trash2 } from '@lucide/svelte';
import * as Dialog from '$lib/components/ui/dialog';
import { useConvexClient } from 'convex-svelte';
import { api } from '$convex/_generated/api';
import * as Select from '$lib/components/ui/select';
import { Button } from '$lib/components/ui/button';

const client = useConvexClient();

// State for dialogs
let editDialogOpen = $state(false);
let deleteDialogOpen = $state(false);
let selectedEvaluation = $state<EvaluationEntry | null>(null);

// Edit form state
let editValue = $state(0);
let editCategory = $state('');
let editSubCategory = $state('');
let editDetails = $state('');
let editLoading = $state(false);

// User data for ownership check
const user = useQuery(api.users.viewer, () => ({}));
const currentUserId = $derived(user.data?._id);

function canEditEntry(entry: EvaluationEntry): boolean {
  return entry.teacherId === currentUserId;
}

function handleLongPress(entry: EvaluationEntry): void {
  selectedEvaluation = entry;
  editValue = entry.value;
  editCategory = entry.category;
  editSubCategory = entry.subCategory || '';
  editDetails = entry.details || '';
  editDialogOpen = true;
}

function handleDeleteRequest(entry: EvaluationEntry): void {
  selectedEvaluation = entry;
  deleteDialogOpen = true;
}

async function handleEditConfirm(): Promise<void> {
  if (!selectedEvaluation) return;
  
  editLoading = true;
  try {
    await client.mutation(api.evaluations.update, {
      id: selectedEvaluation._id as Id<'evaluations'>,
      value: editValue,
      category: editCategory,
      subCategory: editSubCategory,
      details: editDetails
    });
    
    editDialogOpen = false;
    selectedEvaluation = null;
  } finally {
    editLoading = false;
  }
}

async function handleDeleteConfirm(): Promise<void> {
  if (!selectedEvaluation) return;
  
  await client.mutation(api.evaluations.remove, {
    id: selectedEvaluation._id as Id<'evaluations'>
  });
  
  deleteDialogOpen = false;
  selectedEvaluation = null;
}
```

Update EvaluationsTimeline props:
```svelte
<EvaluationsTimeline
  evaluations={sortedEvaluations}
  title="Recent"
  showStudentName={true}
  showTeacherFilter={false}
  showLegend={false}
  showTeacherName={false}
  enableCardClick={true}
  cardHref={(entry) => `/evaluations/student/${entry.studentId}`}
  onCardClick={handleCardClick}
  bind:sortAscending
  bind:showDetails
  enableLongPress={true}
  onLongPress={handleLongPress}
  {canEditEntry}
/>
```

Add edit dialog:
```svelte
<Dialog.Root bind:open={editDialogOpen}>
  <Dialog.Content aria-label="Edit evaluation">
    <Dialog.Header>
      <Dialog.Title>Edit Evaluation</Dialog.Title>
    </Dialog.Header>
    
    <div class="space-y-4 py-4">
      <!-- Category -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Category</label>
        <Select.Root type="single" bind:value={editCategory}>
          <Select.Trigger aria-label="Select category">
            {editCategory || 'Select Category'}
          </Select.Trigger>
          <Select.Content>
            {#each categoriesQuery.data || [] as cat (cat._id)}
              <Select.Item value={cat.name}>{cat.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      
      <!-- Points - Only -2, -1, +1, +2 like new evaluation page -->
      <fieldset class="space-y-2">
        <legend class="text-sm font-medium">Points</legend>
        <div class="grid grid-cols-4 gap-2">
          {#each [-2, -1, 1, 2] as p (p)}
            <Button
              type="button"
              variant={editValue === p ? 'default' : 'outline'}
              onclick={() => (editValue = p)}
              aria-label={p > 0 ? `Award ${p} points` : `Deduct ${Math.abs(p)} points`}
            >
              {p > 0 ? '+' : ''}{p}
            </Button>
          {/each}
        </div>
      </fieldset>
      
      <!-- Details -->
      <div class="space-y-2">
        <label class="text-sm font-medium">Details / Comments</label>
        <textarea
          bind:value={editDetails}
          placeholder="Enter specific details..."
          class="bg-background border-input w-full rounded-md border p-3 text-sm"
          rows="3"
          aria-label="Evaluation details"
        ></textarea>
      </div>
    </div>
    
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (editDialogOpen = false)}>Cancel</Button>
      <Button onclick={handleEditConfirm} disabled={editLoading}>
        {editLoading ? 'Saving...' : 'Save Changes'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

Add delete confirmation dialog:
```svelte
<Dialog.Root bind:open={deleteDialogOpen}>
  <Dialog.Content aria-label="Delete Evaluation">
    <Dialog.Header>
      <Dialog.Title>Delete Evaluation</Dialog.Title>
    </Dialog.Header>
    
    <p class="py-4">Are you sure you want to delete this evaluation? This action cannot be undone.</p>
    
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Cancel</Button>
      <Button variant="destructive" onclick={handleDeleteConfirm}>Delete</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

#### [`src/routes/evaluations/student/[studentId]/+page.svelte`](src/routes/evaluations/student/[studentId]/+page.svelte)

Add similar handlers. Note that this page already has demo mode. The long-press should only work for the current user's own evaluations.

### 6. Accessibility Roles and Labels

| Element | Role | Aria-label / Name | Purpose |
|---------|------|-------------------|---------|
| Evaluation card | `button` | `Evaluation for {category}, {+/-}{value} points` | Main interactive element |
| Edit dialog | `dialog` | `Edit Evaluation` | Modal dialog |
| Delete dialog | `dialog` | `Delete Evaluation` | Confirmation modal |
| Points buttons | `button` | `Award {p} points` or `Deduct {Math.abs(p)} points` | Points selector |
| Category select | `combobox` | `Select category` | Category dropdown |
| Details textarea | `textbox` | `Evaluation details` | Description input |
| Cancel button | `button` | `Cancel` | Cancel action |
| Save button | `button` | `Save Changes` | Confirm edit |
| Delete button | `button` | `Delete` | Confirm delete |

## Integration Tests

### Test Files Placement

Tests should be placed in appropriate files based on feature scope:
- **`e2e/student-timeline.spec.ts`** - Tests for student timeline page long-press
- **`e2e/evaluations.spec.ts`** - Tests for main evaluations page long-press

### Test Structure (following TESTING.md standards)

```typescript
// e2e/evaluations.spec.ts - Add new test describe blocks

test.describe('Evaluations Long-Press Edit @evaluations-longpress', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });
  
  // CONSTANTS - Define at top of describe
  let suffix: string;
  let categoryName: string;
  let studentName: string;
  let e2eTag: string;
  let testEval = false;
  
  // DATA SEEDING & Navigation
  test.beforeEach(async ({ page }) => {
    suffix = getTestSuffix('evalEdit');
    categoryName = `Cat_${suffix}`;
    studentName = `Student_${suffix}`;
    e2eTag = `e2e-test_${suffix}`;
    
    // Seed data via API
    await createCategoryWithSubs({
      name: categoryName,
      subCategories: ['Sub1', 'Sub2'],
      e2eTag
    });
    const studentId = await createStudent({
      studentId: `STU_${suffix}`,
      englishName: studentName,
      chineseName: '學生',
      grade: 10,
      e2eTag
    });
    
    // Create evaluation via UI
    await createEvaluationForStudent({ studentId, e2eTag });
    testEval = true;
    
    await page.goto('/evaluations');
    await page.waitForSelector('body.hydrated');
  });
  
  // CLEANUP
  test.afterEach(async () => {
    if (testEval) await cleanupByTag('all', e2eTag);
  });
  
  test('long-press on own evaluation shows edit/delete options', async ({ page }) => {
    const card = page.getByRole('button', { name: /Evaluation for/i }).first();
    await expect.element(card).toBeVisible();
    
    // Long-press
    await card.dispatchEvent('mousedown');
    await page.waitForTimeout(600); // 500ms threshold + buffer
    await card.dispatchEvent('mouseup');
    
    // Should show options
    await expect.element(page.getByRole('button', { name: /Edit/i })).toBeVisible();
    await expect.element(page.getByRole('button', { name: /Delete/i })).toBeVisible();
  });
  
  test('can edit evaluation using points buttons', async ({ page }) => {
    const card = page.getByRole('button', { name: /Evaluation for/i }).first();
    
    // Long-press to open options
    await card.dispatchEvent('mousedown');
    await page.waitForTimeout(600);
    await card.dispatchEvent('mouseup');
    
    // Click edit
    await page.getByRole('button', { name: /Edit/i }).click();
    await expect.element(page.getByRole('dialog', { name: /Edit evaluation/i })).toBeVisible();
    
    // Change points using buttons (-2, -1, +1, +2)
    await page.getByRole('button', { name: /Award 2 points/i }).click();
    
    // Save
    await page.getByRole('button', { name: /Save Changes/i }).click();
    await expect.element(page.getByRole('dialog')).not.toBeVisible();
    
    // Verify update (wait for Convex reactivity)
    await expect.element(page.getByText('+2')).toBeVisible();
  });
  
  test('can delete own evaluation with confirmation', async ({ page }) => {
    const card = page.getByRole('button', { name: /Evaluation for/i }).first();
    
    // Long-press
    await card.dispatchEvent('mousedown');
    await page.waitForTimeout(600);
    await card.dispatchEvent('mouseup');
    
    // Click delete
    await page.getByRole('button', { name: /Delete/i }).click();
    await expect.element(page.getByRole('dialog', { name: /Delete Evaluation/i })).toBeVisible();
    
    // Confirm
    await page.getByRole('dialog').getByRole('button', { name: /Delete/i }).click();
    await expect.element(page.getByRole('dialog')).not.toBeVisible();
    
    // Entity was deleted, skip cleanup
    testEval = false;
  });
});

test.describe('Evaluations Long-Press Touch Support @evaluations-longpress', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });
  
  test('long-press works on touch devices', async ({ page }) => {
    await page.goto('/evaluations');
    await page.waitForSelector('body.hydrated');
    
    const card = page.getByRole('button', { name: /Evaluation for/i }).first();
    await expect.element(card).toBeVisible();
    
    // Simulate touch long-press
    await card.dispatchEvent('touchstart');
    await page.waitForTimeout(600);
    await card.dispatchEvent('touchend');
    
    await expect.element(page.getByRole('button', { name: /Edit/i })).toBeVisible();
  });
});
```

### Student Timeline Tests

```typescript
// e2e/student-timeline.spec.ts - Add new test describe blocks

test.describe('Student Timeline Long-Press @timeline-longpress', () => {
  test.use({ storageState: 'e2e/.auth/teacher.json' });
  
  test('long-press on own evaluation in timeline', async ({ page }) => {
    await page.goto('/evaluations/student/demo-student-id?demo=teacher');
    await page.waitForSelector('body.hydrated');
    
    const card = page.getByRole('button', { name: /Evaluation for/i }).first();
    await expect.element(card).toBeVisible();
    
    await card.dispatchEvent('mousedown');
    await page.waitForTimeout(600);
    await card.dispatchEvent('mouseup');
    
    await expect.element(page.getByRole('button', { name: /Edit/i })).toBeVisible();
  });
});
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| [`src/convex/evaluations.ts`](src/convex/evaluations.ts) | Modify | Add `update` mutation with ownership validation |
| [`src/lib/components/timeline/types.ts`](src/lib/components/timeline/types.ts) | Modify | Add `teacherId` to `EvaluationEntry` |
| [`src/lib/components/timeline/EvaluationsTimeline.svelte`](src/lib/components/timeline/EvaluationsTimeline.svelte) | Modify | Add long-press handling (mouse + touch) |
| [`src/routes/evaluations/+page.svelte`](src/routes/evaluations/+/page.svelte) | Modify | Add edit/delete handlers, dialogs with aria-labels |
| [`src/routes/evaluations/student/[studentId]/+page.svelte`](src/routes/evaluations/student/[studentId]/+page.svelte) | Modify | Add edit/delete handlers for student timeline |
| [`e2e/evaluations.spec.ts`](e2e/evaluations.spec.ts) | Modify | Add long-press tests for main page |
| [`e2e/student-timeline.spec.ts`](e2e/student-timeline.spec.ts) | Modify | Add long-press tests for student timeline |

## Ownership Validation

### Convex Backend
- Teachers can only edit/delete their own evaluations
- Admins are also teachers - they can only edit/delete their own evaluations
- Authorization check happens server-side before any mutations

### Frontend (UX Guidance)
- `canEditEntry` callback determines if an entry is editable
- Long-press on non-owned evaluations shows no options
- Use `teacherId` field to check ownership

## Visual Design Consistency

The edit dialog should match the existing evaluation creation form styling from [`src/routes/evaluations/new/+page.svelte`](src/routes/evaluations/new/+page.svelte):
- Same 4 point buttons: [-2, -1, +1, +2]
- Same Select component patterns
- Same Button variants (`default`, `outline`, `destructive`)
- Same spacing and typography
- Use `aria-label="Edit evaluation"` on dialog content
