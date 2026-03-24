# Component Test Plan: Category/Evaluation Integrity

## Overview

This plan outlines additional component tests needed to ensure comprehensive coverage for the category/subcategory functionality, specifically focusing on:

- `removeSubCategory` mutation
- Cascade delete behavior
- Evaluation integrity checks
- UI components (delete warnings, toast notifications)

## Current Test Coverage

### Unit Tests (src/convex/categories.test.ts)

| Test Suite                                 | Tests                                                  | Status     |
| ------------------------------------------ | ------------------------------------------------------ | ---------- |
| `categories.create`                        | Creates with/without subCategories                     | ✅ Covered |
| `categories.update`                        | Updates name and subCategories                         | ✅ Covered |
| `categories.remove`                        | Removes without evaluations, cascade delete            | ✅ Covered |
| `categories.list`                          | Returns all/empty list                                 | ✅ Covered |
| `categories.getEvaluationCount`            | Returns 0 and count with evaluations                   | ✅ Covered |
| `categories.getSubCategoryEvaluationCount` | Returns count for specific subcategory                 | ✅ Covered |
| `categories.removeSubCategory`             | Removes without evaluations, cascade delete, returns 0 | ✅ Covered |

### Unit Tests (src/convex/evaluations.test.ts)

| Test Suite             | Tests                       | Status     |
| ---------------------- | --------------------------- | ---------- |
| Basic table operations | Insert/query evaluations    | ✅ Covered |
| Query by teacherId     | Filter by teacher           | ✅ Covered |
| Query by studentId     | Filter by student           | ✅ Covered |
| Pagination             | listAllEvaluationsPaginated | ✅ Covered |

### E2E Tests (e2e/categories.spec.ts)

| Test Suite           | Tests                        | Status     |
| -------------------- | ---------------------------- | ---------- |
| Access Control       | Redirects non-admin          | ✅ Covered |
| Add Form UI          | Open/cancel/edit form        | ✅ Covered |
| CRUD Operations      | Add/update/delete categories | ✅ Covered |
| Delete Warning       | Shows evaluation count       | ✅ Covered |
| SubCategory Delete   | Warning and cascade          | ✅ Covered |
| Rename Toast         | Shows notification           | ✅ Covered |
| Name Change Reflects | Evaluations show new name    | ✅ Covered |

### Component Tests (tests/)

| Test File                | Tests               | Status            |
| ------------------------ | ------------------- | ----------------- |
| students-dialogs.test.ts | Edit/delete dialogs | ✅ Example exists |
| **categories page**      | **No tests**        | ❌ Missing        |

---

## Identified Test Gaps

### 1. Unit Tests: Evaluation Category Name Resolution

**File:** `src/convex/evaluations.test.ts`

**Missing Tests:**

- Evaluation queries resolve `categoryId` to category name correctly
- Changing category name reflects in evaluation query results
- Evaluation with invalid/non-existent `categoryId` handles gracefully

**Rationale:** The schema change from `category: string` to `categoryId: Id` requires verification that queries properly resolve the category name for display.

### 2. Component Tests: Categories Page

**File:** `tests/routes/admin/categories/categories-dialogs.test.ts` (new file)

**Missing Tests:**

- Delete dialog shows evaluation count warning
- Delete dialog allows confirmation/cancellation
- Subcategory delete shows confirmation dialog
- Subcategory delete shows evaluation count
- Toast notification appears on category rename
- Toast notification shows correct evaluation count

**Rationale:** The students page has component tests for dialogs, but categories page lacks equivalent coverage for the new delete warnings and toast notifications.

### 3. Unit Tests: Edge Cases for removeSubCategory

**File:** `src/convex/categories.test.ts`

**Missing Tests:**

- Throws error when category not found
- Throws error when subcategory doesn't exist in category
- Handles empty subcategory string gracefully
- Returns correct count when multiple evaluations exist

**Rationale:** Current tests cover happy path but not error conditions.

### 4. Unit Tests: Category Rename Integrity

**File:** `src/convex/categories.test.ts`

**Missing Tests:**

- Category rename does not break evaluation references
- Evaluations still resolve after category name change
- Multiple evaluations with same categoryId all show new name

**Rationale:** Verify the core integrity guarantee of the categoryId reference system.

---

## Recommended Test Implementation

### Priority 1: Component Tests for Categories Page

Create `tests/routes/admin/categories/categories-dialogs.test.ts`:

```typescript
import { page } from 'vitest-browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

// Mock data
const mockCategories = [
	{
		_id: 'cat-001',
		name: 'Leadership',
		subCategories: ['Teamwork', 'Initiative']
	},
	{
		_id: 'cat-002',
		name: 'Academic',
		subCategories: ['Homework', 'Exams']
	}
];

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: mockCategories, isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue(5) // evaluation count
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin' } }
	}))
}));

import CategoriesPage from '$src/routes/admin/categories/+page.svelte';

describe('Categories Page - Delete Dialogs', () => {
	describe('Category Delete Dialog', () => {
		it('opens delete confirmation dialog', async () => {
			render(CategoriesPage);
			await page.getByRole('button', { name: 'Delete' }).first().click();
			await expect
				.element(page.getByRole('heading', { name: 'Delete Category' }))
				.toBeInTheDocument();
		});

		it('shows warning when category has evaluations', async () => {
			render(CategoriesPage);
			await page.getByRole('button', { name: 'Delete' }).first().click();
			// Mock returns 5 evaluations
			await expect.element(page.getByText(/This category has evaluations/)).toBeInTheDocument();
		});
	});

	describe('SubCategory Delete Dialog', () => {
		it('shows confirmation dialog for subcategory with evaluations', async () => {
			render(CategoriesPage);
			// Open edit dialog first
			await page.getByRole('button', { name: 'Edit' }).first().click();
			// Click remove on subcategory
			await page.getByRole('button', { name: 'Remove' }).first().click();
			// Should show warning dialog
			await expect.element(page.getByText(/This subcategory has.*evaluations/)).toBeInTheDocument();
		});
	});

	describe('Rename Toast Notification', () => {
		it('shows toast when renaming category with evaluations', async () => {
			render(CategoriesPage);
			// Open edit dialog
			await page.getByRole('button', { name: 'Edit' }).first().click();
			// Change name
			await page.getByRole('textbox', { name: 'Category Name' }).fill('New Name');
			await page.getByRole('button', { name: 'Update' }).click();
			// Toast should appear
			await expect.element(page.getByRole('alert')).toBeInTheDocument();
		});
	});
});
```

### Priority 2: Unit Tests for Category Name Resolution

Add to `src/convex/evaluations.test.ts`:

```typescript
describe('evaluation category name resolution', () => {
	it('resolves categoryId to category name in query results', async () => {
		const t = convexTest(schema, modules);

		// Create category
		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Leadership',
				subCategories: ['Teamwork']
			});
		});

		// Create evaluation with categoryId
		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Test Student',
				chineseName: '測試學生',
				studentId: 'STU_CAT_NAME',
				grade: 10,
				status: 'Enrolled'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				categoryId,
				subCategory: 'Teamwork',
				value: 5,
				details: 'Test',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		// Query should resolve category name
		const result = await t.query(api.evaluations.listAllEvaluationsPaginated, {
			showUnenrolled: false,
			sortAscending: false,
			paginationOpts: { numItems: 10, cursor: null }
		});

		expect(result.page[0].category).toBe('Leadership');
	});

	it('reflects category name change in evaluation queries', async () => {
		const t = convexTest(schema, modules);

		// Create category
		const categoryId = await t.mutation(api.categories.create, {
			name: 'Original Name',
			subCategories: ['Sub']
		});

		// Create evaluation
		const studentId = await t.mutation(api.students.create, {
			englishName: 'Student',
			chineseName: '學生',
			studentId: 'STU_RENAME',
			grade: 10,
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				categoryId,
				subCategory: 'Sub',
				value: 5,
				details: 'Test',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		// Rename category
		await t.mutation(api.categories.update, {
			id: categoryId,
			name: 'Renamed Category',
			subCategories: ['Sub']
		});

		// Query should show new name
		const result = await t.query(api.evaluations.listAllEvaluationsPaginated, {
			showUnenrolled: false,
			sortAscending: false,
			paginationOpts: { numItems: 10, cursor: null }
		});

		expect(result.page[0].category).toBe('Renamed Category');
	});
});
```

### Priority 3: Edge Case Tests for removeSubCategory

Add to `src/convex/categories.test.ts`:

```typescript
describe('categories.removeSubCategory edge cases', () => {
	it('throws error when category not found', async () => {
		const t = convexTest(schema, modules);

		await expect(async () => {
			await t.mutation(api.categories.removeSubCategory, {
				categoryId: 'nonexistent' as any,
				subCategory: 'Sub'
			});
		}).rejects.toThrow();
	});

	it('handles subcategory not in category gracefully', async () => {
		const t = convexTest(schema, modules);

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Test Category',
			subCategories: ['Existing']
		});

		// Try to remove non-existent subcategory
		const result = await t.mutation(api.categories.removeSubCategory, {
			categoryId,
			subCategory: 'NonExistent'
		});

		// Should return 0 deleted, category unchanged
		expect(result.deletedEvaluationCount).toBe(0);

		const category = (await t.query(api.categories.list, {}))[0];
		expect(category.subCategories).toEqual(['Existing']);
	});

	it('deletes multiple evaluations in same subcategory', async () => {
		const t = convexTest(schema, modules);

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Multi Eval Category',
			subCategories: ['SubA']
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const studentId1 = await t.mutation(api.students.create, {
			englishName: 'Student 1',
			chineseName: '學生1',
			studentId: 'S_MULTI_1',
			grade: 10,
			status: 'Enrolled'
		});

		const studentId2 = await t.mutation(api.students.create, {
			englishName: 'Student 2',
			chineseName: '學生2',
			studentId: 'S_MULTI_2',
			grade: 10,
			status: 'Enrolled'
		});

		// Create evaluations for multiple students in same subcategory
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: studentId1,
				teacherId,
				categoryId,
				subCategory: 'SubA',
				value: 5,
				details: 'Eval 1',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
			await ctx.db.insert('evaluations', {
				studentId: studentId2,
				teacherId,
				categoryId,
				subCategory: 'SubA',
				value: 10,
				details: 'Eval 2',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const result = await t.mutation(api.categories.removeSubCategory, {
			categoryId,
			subCategory: 'SubA'
		});

		expect(result.deletedEvaluationCount).toBe(2);

		const evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});
		expect(evaluations).toHaveLength(0);
	});
});
```

---

## Test File Structure

```
tests/
├── routes/
│   ├── admin/
│   │   ├── students/
│   │   │   ├── students-dialogs.test.ts    # ✅ Exists
│   │   │   └── students.test.ts            # ✅ Exists
│   │   └── categories/                      # 🆕 New directory
│   │       ├── categories-dialogs.test.ts  # 🆕 Component tests
│   │       └── categories.test.ts          # 🆕 Optional: more tests
│   └── ...
├── mocks/
│   └── convex.ts                            # ✅ Exists (may need updates)
└── ...

src/convex/
├── categories.test.ts                       # ➕ Add edge case tests
├── evaluations.test.ts                      # ➕ Add category resolution tests
└── ...
```

---

## Implementation Order

1. **Create component tests** for categories page (Priority 1)
   - Tests delete dialog with evaluation count
   - Tests subcategory delete confirmation
   - Tests rename toast notification

2. **Add unit tests** for category name resolution (Priority 2)
   - Tests categoryId -> category name lookup
   - Tests rename reflects in evaluations

3. **Add edge case tests** for removeSubCategory (Priority 3)
   - Tests error conditions
   - Tests multiple evaluations

---

## Running Tests

```bash
# Run component tests
bunx vitest run --config vite.config.ts tests/routes/admin/categories/

# Run unit tests
bunx vitest run src/convex/categories.test.ts
bunx vitest run src/convex/evaluations.test.ts

# Run all tests
bunx vitest run
```
