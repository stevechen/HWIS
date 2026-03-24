# Classes Page and Database Test Plan

## Overview

This document outlines the comprehensive testing strategy for the classes management feature, covering unit tests (Convex functions), browser unit tests (Svelte component), and E2E tests (full UI flows).

## Architecture

### Schema

```typescript
// Classes table
classes: defineTable({
	grade: v.number(), // 7-12
	class: v.string(), // "1", "2", "3", "IB", "default"
	homeroomTeacherId: v.optional(v.id('users'))
})
	.index('by_grade_class', ['grade', 'class'])
	.index('by_teacher', ['homeroomTeacherId']);

// Students table (modified)
students: defineTable({
	englishName: v.string(),
	chineseName: v.string(),
	studentId: v.string(),
	classId: v.id('classes'), // Foreign key to classes
	status: v.union(v.literal('Enrolled'), v.literal('Not Enrolled'))
	// ...
}).index('by_classId', ['classId']);
```

### Key Features to Test

1. **Class CRUD Operations**: Create, read, update, delete classes
2. **Protected Classes**: "1" and "IB" classes cannot be deleted
3. **Homeroom Teacher Assignment**: Assign teachers to classes
4. **Grade Filtering**: Show/hide grades via checkboxes
5. **IB Class Visibility Toggle**: Show/hide IB classes per grade
6. **Student List Visibility**: Global toggle to show/hide student lists per class
7. **Auto-increment Class Names**: New classes get next available number
8. **Student-Class Relationships**: Students are linked to classes via classId
9. **Drag and Drop**: Move students between classes of the same grade

---

## 1. Unit Tests - Convex Functions (src/convex/classes.test.ts)

### Current Coverage Analysis

| Function             | Status | Coverage                                          |
| -------------------- | ------ | ------------------------------------------------- |
| `create`             | ✅     | Basic, duplicates, validation, teacher assignment |
| `list`               | ✅     | Sorting, filtering by grade, student counts       |
| `rename`             | ✅     | Rename success, duplicate prevention              |
| `remove`             | ✅     | Delete empty class, prevent delete with students  |
| `getByGradeAndClass` | ✅     | Find class, return null for non-existent          |
| `seedDefaultClasses` | ✅     | Create defaults, skip existing                    |
| `getById`            | ⚠️     | Used but not directly tested                      |
| `getByTeacher`       | ❌     | NOT TESTED                                        |
| `getStudentCount`    | ❌     | NOT TESTED                                        |
| `update`             | ❌     | NOT TESTED                                        |

### Additional Unit Tests Required

#### `update` mutation

```typescript
describe('update', () => {
	it('should update homeroom teacher successfully', async () => {
		// Create class and teacher
		// Update teacher assignment
		// Verify teacher is assigned
	});

	it('should remove homeroom teacher when null is passed', async () => {
		// Create class with teacher
		// Update with null
		// Verify teacher is removed
	});

	it('should throw error for non-existent class', async () => {
		// Try to update fake class ID
		// Expect 'Class not found' error
	});

	it('should require admin role', async () => {
		// Try with non-admin token
		// Expect permission error
	});
});
```

#### `getByTeacher` query

```typescript
describe('getByTeacher', () => {
	it('should return class for teacher', async () => {
		// Create teacher and assign to class
		// Query by teacher ID
		// Verify correct class returned
	});

	it('should return null when teacher has no class', async () => {
		// Create teacher without class assignment
		// Query by teacher ID
		// Expect null
	});

	it('should include teacher name in response', async () => {
		// Verify homeroomTeacherName is populated
	});
});
```

#### `getStudentCount` query

```typescript
describe('getStudentCount', () => {
	it('should return correct count for class with students', async () => {
		// Create class with multiple students
		// Query student count
		// Verify count matches
	});

	it('should return zero for empty class', async () => {
		// Create class without students
		// Verify count is 0
	});

	it('should return class info with count', async () => {
		// Verify classInfo contains grade and class
	});
});
```

#### `getById` query

```typescript
describe('getById', () => {
	it('should return class by ID', async () => {
		// Create class
		// Query by ID
		// Verify correct class returned
	});

	it('should include teacher name if assigned', async () => {
		// Create class with teacher
		// Verify homeroomTeacherName is populated
	});

	it('should return null for non-existent ID', async () => {
		// Query fake ID
		// Expect null
	});
});
```

#### Additional Edge Cases for `remove`

```typescript
describe('remove - protected classes', () => {
	it('should prevent deleting protected class "1"', async () => {
		// Try to delete class "1"
		// Expect protected class error
	});

	it('should prevent deleting protected class "IB"', async () => {
		// Try to delete class "IB"
		// Expect protected class error
	});

	it('should allow deleting non-protected class even with "1" in name', async () => {
		// Create class "A1"
		// Should be deletable (not protected)
	});
});
```

#### Additional Tests for `create`

```typescript
describe('create - auto-increment', () => {
	it('should auto-increment to next available number', async () => {
		// Create classes 1, 2
		// Create without class name
		// Should get class "3"
	});

	it('should fill gaps in numbering', async () => {
		// Create classes 1, 3 (delete 2)
		// Auto-increment should create "2"
	});

	it('should start at "1" when no classes exist', async () => {
		// Create class in empty grade
		// Should get "1"
	});
});
```

#### `moveStudent` mutation (NEW - for drag and drop)

```typescript
describe('moveStudent', () => {
	it('should move student between classes of same grade', async () => {
		// Create two classes in grade 7
		// Create student in class A
		// Move student to class B
		// Verify student classId updated
	});

	it('should prevent moving student to different grade', async () => {
		// Create class in grade 7 and grade 8
		// Create student in grade 7 class
		// Try to move to grade 8 class
		// Expect error: 'Cannot move student to different grade'
	});

	it('should throw error for non-existent student', async () => {
		// Try to move fake student ID
		// Expect 'Student not found' error
	});

	it('should throw error for non-existent target class', async () => {
		// Create student
		// Try to move to fake class ID
		// Expect 'Class not found' error
	});

	it('should require admin role', async () => {
		// Try with non-admin token
		// Expect permission error
	});

	it('should preserve student data when moving', async () => {
		// Create student with all fields populated
		// Move to new class
		// Verify all student data unchanged except classId
	});
});
```

---

## 2. Browser Unit Tests - Classes Page Component

**File**: `src/routes/admin/classes/+page.svelte`  
**Test File**: `src/routes/admin/classes/+page.test.ts` (NEW)

### Test Setup

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined)
	}))
}));

import ClassesPage from './+page.svelte';
import { useQuery } from 'convex-svelte';
```

### Test Cases

#### Page Structure

```typescript
describe('Classes Page - Structure', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useQuery).mockImplementation((api) => {
			if (api.toString().includes('classes.list')) {
				return { data: [], isLoading: false, error: undefined, isStale: false };
			}
			if (api.toString().includes('users.getTeachers')) {
				return { data: [], isLoading: false, error: undefined, isStale: false };
			}
			return { data: null, isLoading: false, error: undefined, isStale: false };
		});
	});

	it('renders grade filter checkboxes', async () => {
		render(ClassesPage);
		for (const grade of [7, 8, 9, 10, 11, 12]) {
			await expect.element(page.getByRole('checkbox', { name: String(grade) })).toBeInTheDocument();
		}
	});

	it('renders "Show Students" toggle button', async () => {
		render(ClassesPage);
		await expect.element(page.getByRole('button', { name: /show students/i })).toBeInTheDocument();
	});

	it('renders add class buttons for each grade', async () => {
		render(ClassesPage);
		const addButtons = page.getByRole('button', { name: /add class to grade/i });
		await expect.element(addButtons).toBeInTheDocument();
	});
});
```

#### Loading and Error States

```typescript
describe('Classes Page - States', () => {
	it('shows loading state', async () => {
		vi.mocked(useQuery).mockReturnValue({
			data: null,
			isLoading: true,
			error: undefined,
			isStale: false
		});
		render(ClassesPage);
		await expect.element(page.getByText(/loading classes/i)).toBeInTheDocument();
	});

	it('shows error state', async () => {
		vi.mocked(useQuery).mockReturnValue({
			data: null,
			isLoading: false,
			error: new Error('Failed to load'),
			isStale: false
		});
		render(ClassesPage);
		await expect.element(page.getByText(/error loading classes/i)).toBeInTheDocument();
	});
});
```

#### Class Display

```typescript
describe('Classes Page - Class Display', () => {
	it('displays classes grouped by grade', async () => {
		const mockClasses = [
			{
				_id: 'c1',
				grade: 7,
				class: '1',
				studentCount: 10,
				students: [],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			},
			{
				_id: 'c2',
				grade: 7,
				class: '2',
				studentCount: 8,
				students: [],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			},
			{
				_id: 'c3',
				grade: 8,
				class: '1',
				studentCount: 12,
				students: [],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			}
		];

		vi.mocked(useQuery).mockImplementation((api) => {
			if (api.toString().includes('classes.list')) {
				return { data: mockClasses, isLoading: false, error: undefined, isStale: false };
			}
			return { data: [], isLoading: false, error: undefined, isStale: false };
		});

		render(ClassesPage);

		await expect.element(page.getByText('G7')).toBeInTheDocument();
		await expect.element(page.getByText('G8')).toBeInTheDocument();
		await expect.element(page.getByText('7-1')).toBeInTheDocument();
		await expect.element(page.getByText('7-2')).toBeInTheDocument();
	});

	it('displays IB classes with logo', async () => {
		const mockClasses = [
			{
				_id: 'c1',
				grade: 7,
				class: 'IB',
				studentCount: 5,
				students: [],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			}
		];

		vi.mocked(useQuery).mockReturnValue({
			data: mockClasses,
			isLoading: false,
			error: undefined,
			isStale: false
		});

		render(ClassesPage);

		await expect.element(page.getByAltText('IB')).toBeInTheDocument();
	});

	it('displays student count for each class', async () => {
		const mockClasses = [
			{
				_id: 'c1',
				grade: 7,
				class: '1',
				studentCount: 15,
				students: [],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			}
		];

		vi.mocked(useQuery).mockReturnValue({
			data: mockClasses,
			isLoading: false,
			error: undefined,
			isStale: false
		});

		render(ClassesPage);

		await expect.element(page.getByText('15')).toBeInTheDocument();
	});
});
```

#### Teacher Assignment Dropdown

```typescript
describe('Classes Page - Teacher Assignment', () => {
	it('renders teacher dropdown for each class', async () => {
		const mockClasses = [
			{
				_id: 'c1',
				grade: 7,
				class: '1',
				studentCount: 10,
				students: [],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			}
		];
		const mockTeachers = [
			{ _id: 't1', name: 'Teacher A' },
			{ _id: 't2', name: 'Teacher B' }
		];

		vi.mocked(useQuery).mockImplementation((api) => {
			if (api.toString().includes('classes.list')) {
				return { data: mockClasses, isLoading: false, error: undefined, isStale: false };
			}
			if (api.toString().includes('users.getTeachers')) {
				return { data: mockTeachers, isLoading: false, error: undefined, isStale: false };
			}
			return { data: null, isLoading: false, error: undefined, isStale: false };
		});

		render(ClassesPage);

		await expect
			.element(page.getByRole('combobox', { name: /teacher for 7-1/i }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: '- No Teacher -' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Teacher A' })).toBeInTheDocument();
	});
});
```

#### Drag and Drop (when student lists visible)

```typescript
describe('Classes Page - Drag and Drop', () => {
	it('renders drag handles when student lists visible', async () => {
		const mockClasses = [
			{
				_id: 'c1',
				grade: 7,
				class: '1',
				studentCount: 2,
				students: [
					{ _id: 's1', name: 'Student A', studentId: '7001001', status: 'Enrolled' },
					{ _id: 's2', name: 'Student B', studentId: '7001002', status: 'Enrolled' }
				],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			}
		];

		vi.mocked(useQuery).mockImplementation((api) => {
			if (api.toString().includes('classes.list')) {
				return { data: mockClasses, isLoading: false, error: undefined, isStale: false };
			}
			return { data: [], isLoading: false, error: undefined, isStale: false };
		});

		render(ClassesPage);

		// Student lists should be visible by default or toggle them on
		// Verify drag handles exist
		const dragHandles = page.getByRole('button', { name: /drag to move student/i });
		await expect.element(dragHandles).toBeInTheDocument();
	});

	it('students are draggable when student lists visible', async () => {
		const mockClasses = [
			{
				_id: 'c1',
				grade: 7,
				class: '1',
				studentCount: 1,
				students: [{ _id: 's1', name: 'Student A', studentId: '7001001', status: 'Enrolled' }],
				homeroomTeacherId: null,
				homeroomTeacherName: null
			}
		];

		vi.mocked(useQuery).mockImplementation((api) => {
			if (api.toString().includes('classes.list')) {
				return { data: mockClasses, isLoading: false, error: undefined, isStale: false };
			}
			return { data: [], isLoading: false, error: undefined, isStale: false };
		});

		render(ClassesPage);

		// Verify student element has draggable attribute
		const studentElement = page.getByText('Student A');
		await expect.element(studentElement).toHaveAttribute('draggable', 'true');
	});
});
```

---

## 3. E2E Tests - Classes Management

**Test File**: `e2e/classes/` (NEW DIRECTORY)

### 3.1 Class CRUD Operations

**File**: `e2e/classes/crud.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { getTestSuffix, getTestStudentId } from '../helpers';
import { cleanupByTag, useRole } from '../convex-client';

test.describe('Classes CRUD', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/classes');
		await page.waitForSelector('body.hydrated');
	});

	test('can add a new class to a grade', async ({ page }) => {
		// Click add button for grade 7
		// Verify dialog opens
		// Submit form
		// Verify new class appears in list
	});

	test('can delete an empty non-protected class', async ({ page }) => {
		// Create a class (e.g., "A")
		// Click delete button
		// Confirm deletion
		// Verify class is removed
	});

	test('cannot delete protected class "1"', async ({ page }) => {
		// Try to delete class "1"
		// Verify alert/dialog shows protection message
	});

	test('cannot delete protected class "IB"', async ({ page }) => {
		// Try to delete class "IB"
		// Verify alert/dialog shows protection message
	});

	test('cannot delete class with enrolled students', async ({ page }) => {
		// Create class with student
		// Try to delete
		// Verify warning about students
	});
});
```

### 3.2 Homeroom Teacher Assignment

**File**: `e2e/classes/teachers.spec.ts`

```typescript
test.describe('Class Teacher Assignment', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('can assign homeroom teacher to class', async ({ page }) => {
		// Select teacher from dropdown
		// Verify teacher is assigned
	});

	test('can remove homeroom teacher from class', async ({ page }) => {
		// Select "- No Teacher -" option
		// Verify teacher is removed
	});

	test('teacher sees their assigned class', async ({ page }) => {
		// Assign teacher to class
		// Login as teacher
		// Verify teacher sees their class
	});
});
```

### 3.3 Grade Filtering

**File**: `e2e/classes/filtering.spec.ts`

```typescript
test.describe('Grade Filtering', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('can show/hide grades using checkboxes', async ({ page }) => {
		// Uncheck grade 7 checkbox
		// Verify grade 7 classes are hidden
		// Check grade 7 checkbox
		// Verify grade 7 classes are shown
	});

	test('all grades visible by default', async ({ page }) => {
		// Verify all grade checkboxes are checked
		// Verify all grades are visible
	});

	test('hiding grade persists after refresh', async ({ page }) => {
		// Hide grade 7
		// Refresh page
		// Verify grade 7 is still hidden
	});
});
```

### 3.4 IB Class Visibility

**File**: `e2e/classes/ib-visibility.spec.ts`

```typescript
test.describe('IB Class Visibility', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('IB classes hidden by default when empty', async ({ page }) => {
		// Verify IB toggle button exists for grades
		// Verify IB classes are not visible initially
	});

	test('can toggle IB class visibility', async ({ page }) => {
		// Click IB toggle for grade 7
		// Verify IB class appears
		// Click again
		// Verify IB class is hidden
	});

	test('IB class visible when it has students', async ({ page }) => {
		// Add student to IB class
		// Verify IB class is automatically visible
		// Verify toggle button is hidden (not needed when students exist)
	});
});
```

### 3.5 Student List Visibility

**File**: `e2e/classes/student-lists.spec.ts`

```typescript
test.describe('Student List Visibility', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('can toggle global student list visibility', async ({ page }) => {
		// Click "Show Students" button
		// Verify student lists appear for all classes
		// Click "Hide Students" button
		// Verify student lists are hidden
	});

	test('student names displayed in list', async ({ page }) => {
		// Add students to class
		// Show student lists
		// Verify student names are displayed
	});

	test('not enrolled students shown differently', async ({ page }) => {
		// Add enrolled and not enrolled students
		// Show student lists
		// Verify visual distinction between statuses
	});
});
```

### 3.6 Student-Class Integration

**File**: `e2e/classes/student-integration.spec.ts`

```typescript
test.describe('Student-Class Integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('student count updates when adding student', async ({ page }) => {
		// Note initial count
		// Add student via admin/students page
		// Return to classes page
		// Verify count increased
	});

	test('student appears in class student list', async ({ page }) => {
		// Add student to specific class
		// Show student lists
		// Verify student appears in correct class
	});

	test('moving student updates both classes', async ({ page }) => {
		// Create student in class A
		// Move student to class B
		// Verify counts updated for both classes
		// Verify student appears in B's list, not A's
	});
});
```

### 3.7 Auto-increment Behavior

**File**: `e2e/classes/auto-increment.spec.ts`

```typescript
test.describe('Auto-increment Class Creation', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test('creates class with next available number', async ({ page }) => {
		// Create class in grade 7
		// Create another class
		// Verify second class has next number
	});

	test('fills gap when class is deleted', async ({ page }) => {
		// Create classes 1, 2, 3
		// Delete class 2
		// Create new class
		// Verify it becomes class 2
	});
});
```

### 3.8 Permissions

**File**: `e2e/classes/permissions.spec.ts`

```typescript
test.describe('Classes Permissions', () => {
	test('teacher cannot access classes page', async ({ page }) => {
		// Login as teacher
		// Navigate to /admin/classes
		// Verify redirect or access denied
	});

	test('admin can access classes page', async ({ page }) => {
		// Login as admin
		// Navigate to /admin/classes
		// Verify page loads
	});
});
```

### 3.9 Drag and Drop Student Movement

**File**: `e2e/classes/drag-drop.spec.ts`

```typescript
test.describe('Drag and Drop Student Movement', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/classes');
		await page.waitForSelector('body.hydrated');
	});

	test('can drag student to another class in same grade', async ({ page }) => {
		// Show student lists
		// Drag student from class 7-1 to class 7-2
		// Verify student count updated in both classes
		// Verify student appears in target class list
	});

	test('cannot drag student to different grade', async ({ page }) => {
		// Show student lists
		// Try to drag student from grade 7 to grade 8
		// Verify drop zone is not highlighted/receptive
		// Verify student stays in original class
	});

	test('drag shows visual feedback', async ({ page }) => {
		// Show student lists
		// Start dragging student
		// Verify drag image/ghost appears
		// Verify valid drop zones are highlighted
	});

	test('drop zone highlights on drag over', async ({ page }) => {
		// Show student lists
		// Drag student over valid drop zone
		// Verify visual highlight on target class
	});

	test('student moved persists after refresh', async ({ page }) => {
		// Move student via drag and drop
		// Refresh page
		// Verify student is still in target class
	});

	test('drag handles shown when student lists visible', async ({ page }) => {
		// Show student lists
		// Verify drag handles appear next to each student name
	});

	test('drag handles hidden when student lists hidden', async ({ page }) => {
		// Hide student lists
		// Verify no drag handles visible
	});

	test('moving student updates both class counts in real-time', async ({ page }) => {
		// Note initial counts
		// Drag student from class A to class B
		// Verify source count decreases by 1
		// Verify target count increases by 1
	});
});
```

---

## 4. Helper Functions for E2E Tests

### Add to `e2e/convex-client.ts`

```typescript
export async function createClass(opts: {
	grade: number;
	class: string;
	homeroomTeacherId?: string;
	e2eTag?: string;
}) {
	const utils = getUtils();
	return await utils.createClass(opts);
}

export async function deleteClass(classId: string) {
	const utils = getUtils();
	return await utils.deleteClass(classId);
}

export async function assignTeacherToClass(classId: string, teacherId: string) {
	const utils = getUtils();
	return await utils.assignTeacherToClass(classId, teacherId);
}
```

### Add to `src/lib/e2e-utils.ts`

```typescript
export async function createClass(opts: {
	grade: number;
	class: string;
	homeroomTeacherId?: string;
	e2eTag?: string;
}) {
	const client = getClient();
	return await client.mutation(api.classes.create, {
		grade: opts.grade,
		class: opts.class,
		homeroomTeacherId: opts.homeroomTeacherId,
		e2eTag: opts.e2eTag
	});
}

export async function deleteClass(classId: string) {
	const client = getClient();
	return await client.mutation(api.classes.remove, { id: classId });
}
```

---

## 5. Test Data Factory Updates

### Add to `src/convex/dataFactory.ts`

```typescript
// Add class creation to test data factory
async function createClass(
	ctx: any,
	options: {
		grade: number;
		class: string;
		homeroomTeacherId?: string;
	}
) {
	return await ctx.db.insert('classes', {
		grade: options.grade,
		class: options.class,
		homeroomTeacherId: options.homeroomTeacherId
	});
}
```

---

## 6. Implementation Priority

### Phase 1: Unit Tests (High Priority)

- [ ] Add missing unit tests for `update`, `getByTeacher`, `getStudentCount`, `getById`
- [ ] Add protected class deletion tests
- [ ] Add auto-increment gap filling tests

### Phase 2: Browser Unit Tests (Medium Priority)

- [ ] Create `+page.test.ts` for Classes page
- [ ] Test page structure and rendering
- [ ] Test loading and error states
- [ ] Test class display and grouping

### Phase 3: E2E Tests (High Priority)

- [ ] Create `e2e/classes/crud.spec.ts`
- [ ] Create `e2e/classes/teachers.spec.ts`
- [ ] Create `e2e/classes/filtering.spec.ts`
- [ ] Create `e2e/classes/ib-visibility.spec.ts`
- [ ] Create `e2e/classes/student-lists.spec.ts`

### Phase 4: Integration Tests (Medium Priority)

- [ ] Create `e2e/classes/student-integration.spec.ts`
- [ ] Create `e2e/classes/auto-increment.spec.ts`
- [ ] Create `e2e/classes/permissions.spec.ts`

### Phase 5: Drag and Drop Feature (High Priority)

**Approach: Write tests first, then implement**

1. Add unit tests for `moveStudent` mutation
2. Add browser unit tests for drag-and-drop UI
3. Add E2E tests for drag-and-drop interactions
4. Implement the `moveStudent` backend mutation
5. Implement frontend drag-and-drop functionality

---

## 7. Running the Tests

```bash
# Unit tests (Convex functions)
bunx vitest run src/convex/classes.test.ts

# Browser unit tests (Component)
bunx vitest run --config vite.config.ts src/routes/admin/classes/+page.test.ts

# E2E tests (Classes)
bunx playwright test e2e/classes/

# All tests
bun run test:all
```

---

## 8. Notes and Considerations

1. **Test Isolation**: Each E2E test should use unique test data with `e2eTag` for cleanup
2. **Cross-browser**: Tests should work in Chromium, WebKit, and Firefox
3. **Parallel Execution**: Use `getTestSuffix()` to prevent data collisions
4. **Cleanup**: Always clean up created classes in `afterEach`
5. **Protected Classes**: Remember that classes "1" and "IB" cannot be deleted
6. **Auto-seeding**: The page auto-seeds default classes on mount - account for this in tests
