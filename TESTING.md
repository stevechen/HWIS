# Testing Guide for AI Agents

This document provides comprehensive guidance for AI agents working on the HWIS testing infrastructure.

## Quick Start

```bash
# Run unit tests (fast, no server needed)
bunx vitest run --config vite.config.ts

# Run e2e tests (Playwright will start dev server)
bun run test:e2e

# Run all tests
bun run test:all
```

## Test Architecture

### Stack

- **Unit Tests (Browser)**: Vitest + vitest-browser-svelte (real Chromium, semantic locators)
- **Unit Tests (Server)**: Vitest + convex-test (fast, deterministic, no network calls)
- **E2E Tests**: Playwright (real browser, tests full UI flows)
- **Auth**: Better Auth with Google OAuth

### Directory Structure

```
HWIS/
├── src/
│   ├── convex/
│   │   └── *.test.ts           # Server-side unit tests (convex-test)
│   └── routes/
│       └── admin/
│           └── +page.svelte    # Components under test
├── e2e/
│   └── *.spec.ts               # Playwright E2E tests
└── TESTING.md                  # This file
```

## Browser Unit Tests (vitest-browser-svelte)

### New Locator Pattern (Required)

Tests run in real Chromium using semantic locators:

```typescript
import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		loading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

import StudentsPage from '$src/routes/admin/students/+page.svelte';

describe('Students Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(StudentsPage);
		await expect
			.element(page.getByRole('heading', { name: 'Student Management' }))
			.toBeInTheDocument();
	});

	it('shows back to admin button', async () => {
		render(StudentsPage);
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('renders search input', async () => {
		render(StudentsPage);
		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await expect.element(searchInput).toBeInTheDocument();
	});

	it('renders filter dropdowns', async () => {
		render(StudentsPage);
		const gradeFilter = page.getByRole('combobox', { name: /filter by grade/i });
		await expect.element(gradeFilter).toBeInTheDocument();
	});
});
```

### Key Principles

1. **Use Semantic Locators** (priority order):
   - `page.getByRole('heading')` - for headings
   - `page.getByRole('button')` - for buttons or Selects
   - `page.getByRole('option')` - for options
   - `page.getByRole('checkbox')` - for checkboxes
   - `page.getByRole('textbox')` - for inputs
   - `page.getByLabel()` - for inputs
   - `page.getByRole('combobox')` - for dropdowns
   - `page.getByPlaceholder()` - for placeholder text
   - `page.getByText()` - fallback for static text

2. **Await All Assertions**:

   ```typescript
   // Required - always await expect.element()
   await expect.element(page.getByRole('heading')).toBeInTheDocument();
   ```

3. **Mock Convex Properly**:

   ```typescript
   vi.mock('convex-svelte', () => ({
   	useQuery: vi.fn(() => ({
   		data: [],
   		loading: false,
   		error: null
   	})),
   	useConvexClient: vi.fn(() => ({
   		mutation: vi.fn().mockResolvedValue(undefined),
   		query: vi.fn().mockResolvedValue({})
   	}))
   }));
   ```

   Use `loading: false` to prevent hydration issues. Use `isLoading: true` for pages with auth redirects.

4. **Test Static Structure Only**:
   - Headers, buttons, form labels, table structures
   - Avoid testing Convex-dynamic content (doesn't render with mocks)

### Running Browser Tests

```bash
# Run all browser unit tests (locator pattern, real Chromium)
bunx vitest run --config vite.config.ts

# Run specific test file
bunx vitest run src/convex/students.test.ts

# Run only students tests
bunx vitest run src/convex/students.test.ts

# Run only categories tests
bunx vitest run src/convex/categories.test.ts
```

## Server Unit Tests (convex-test)

### Location

- `src/convex/students.test.ts` - Student CRUD tests
- `src/convex/categories.test.ts` - Category tests
- `src/convex/*.test.ts` - Other Convex function tests

### Pattern

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { convexTest } from './test.setup';

describe('Students', () => {
	beforeEach(() => {
		convexTest.clearDatabase();
	});

	it('creates student', async () => {
		convexTest.run(async (ctx) => {
			const studentId = await ctx.db.insert('students', { ... });
			const student = await ctx.db.get(studentId);
			expect(student).toMatchObject({ name: 'Test' });
		});
	});
});
```

### Key patterns:

- Each test gets a fresh mock database
- Use `t.mutation()` to call mutations
- Use `t.query()` to call queries
- Use `t.run()` to directly insert data into the mock database
- Foreign keys (like `teacherId`) need valid IDs created via `t.run()`

### Running Server Tests

```bash
# Run all server unit tests
bunx vitest run src/convex/*.test.ts

# Run only students tests
bunx vitest run src/convex/students.test.ts

# Run only categories tests
bunx vitest run src/convex/categories.test.ts
```

## E2E Tests (Playwright)

### Use Convenience Imports

Import data helpers from `e2e/convex-client.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { createStudent, createCategory, cleanupTestData, getTestSuffix } from './convex-client';

test.describe('Students @students', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated'); // Critical!
	});

	test('can add student', async ({ page }) => {
		const suffix = getTestSuffix('add');
		const studentId = `STU_${suffix}`;
		const englishName = `Student_${suffix}`;

		await page.getByRole('button', { name: 'Add new student' }).click();
		await page.getByLabel('Student ID').fill(studentId);
		await page.getByLabel('English Name').fill(englishName);
		await page.getByRole('button', { name: 'Save' }).click();

		// Web-first assertion - waits for Convex subscription update
		await expect(page.getByText(englishName)).toBeVisible();
	});
});
```

### Recommended E2E Test Structure (Isolated Pattern)

For reliable automatic cleanup, use isolated `test.describe()` blocks:

```typescript
test.describe('Test Feature - Specific Test Name', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let entityName: string;
	let e2eTag: string;
	let testEntity = false;

	// DATA SEEDING & Navigation
	test.beforeEach(async ({ page }) => {
		suffix = getTestSuffix('testId');
		entityName = `Entity_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;
		await createEntity({ name: entityName, e2eTag });
		testEntity = true;
		await page.goto('/admin/entities');
		await page.waitForSelector('body.hydrated');
	});

	// CLEANUP - Conditional based on flag
	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('entities', e2eTag);
	});

	// TEST - The actual test
	test('can perform action', async ({ page }) => {
		// Test assertions
	});
});
```

#### For UI-Created Data

When data is created via UI form submission:

```typescript
test('can create entity via UI', async ({ page }) => {
	await page.getByRole('button', { name: 'Add' }).click();
	await page.getByRole('textbox', { name: 'Name' }).fill(entityName);
	await page.getByRole('button', { name: 'Save' }).click();

	// Tag the entity for cleanup AFTER successful creation
	await setE2eTag('entities', entityName, e2eTag);
	testEntity = true;

	await expect(page.getByRole('cell', { name: entityName })).toBeVisible();
});
```

#### For Delete Tests

When the test deletes the entity, reset the flag to skip cleanup:

```typescript
test('can delete entity', async ({ page }) => {
	const row = page.getByRole('row', { name: new RegExp(entityName) });
	await expect(row).toBeVisible();

	await row.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();

	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('dialog')).not.toBeVisible();

	// Entity was deleted, skip afterEach cleanup
	testEntity = false;
});
```

### Boolean Flag Convention

- Use `let testEntity = false;` at describe level
- Set to `true` after successful data creation
- Check in `afterEach()` before cleanup

### Helper Functions

#### `createTestEntity(suffix: string)`

Helper function for tests that need data seeded:

```typescript
function createTestEntity(suffix: string) {
	const entityName = `Entity_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	return { entityName, e2eTag };
}
```

### Key Differences from Old Pattern

| Old Pattern | New Pattern |
|-------------|--------------|
| Shared `beforeEach` in parent describe | Each test in own describe with isolated hooks |
| Relied on `seedBaseline` | Each test seeds its own data |
| Manual cleanup calls | Automatic cleanup via `afterEach()` |
| No tagging | `e2eTag` for reliable cleanup |

### Refactor Status

| Status | Test Files |
| ------ | ---------- |
| ✅ Completed | `e2e/students.delete.spec.ts` - 8 tests |
| ✅ Completed | `e2e/students.list.spec.ts` - 11 tests |
| ✅ Completed | `e2e/categories.spec.ts` - 34 tests |
| ✅ Completed | `e2e/evaluations.spec.ts` - 18 tests |
| ⏳ Pending | Other test files |

### Available E2E Imports

From `e2e/convex-client.ts`:

- `createStudent(opts)` - Create student with ID
- `createCategory(opts)` - Create category
- `createCategoryWithSubs(opts)` - Category with subcategories
- `createEvaluationForStudent(data)` - Create evaluation for student
- `createEvalForCategory(categoryName)` - Create evaluation for category
- `cleanupTestData(tag)` - Cleanup by e2eTag
- `cleanupAll()` - Nuclear cleanup
- `getTestSuffix(prefix)` - Generate unique test suffix

### Running E2E Tests

```bash
# Run all e2e tests (requires dev server running)
bun run test:e2e

# Run specific test file
bunx playwright test e2e/students.spec.ts

# Run with single worker (more stable)
bunx playwright test e2e/students.spec.ts --workers=1
```

### Convex Reactivity Pattern

When testing mutations that create data:

1. **After creating data via UI form**, the list should update automatically via Convex reactivity:

   ```typescript
   // After submitting form and dialog closes
   await expect(page.locator('[role="dialog"]').first()).not.toBeVisible();

   // Wait for new data to appear (Convex reactivity)
   await expect(page.getByText(englishName)).toBeVisible();
   ```

2. **IMPORTANT: Reset filters** - If you previously filtered the list (e.g., by grade),
   the new student might not appear in filtered results. Clear filters first:

   ```typescript
   const searchInput = page.getByPlaceholder('Search by name or student ID...');
   await searchInput.fill('');
   const statusFilter = page.getByLabel('Filter by status');
   await statusFilter.selectOption('');
   // Now the new student will be visible
   await expect(page.getByText(englishName)).toBeVisible();
   ```

3. **When creating data via API** (convex-client.ts), the UI won't auto-update.
   Use web-first assertions to poll for the data:

   ```typescript
   await createStudent({ studentId, englishName, grade: 10 });
   // UI updates via Convex reactivity - use polling assertion
   await expect(page.getByText(englishName)).toBeVisible();
   ```

### Best Practices for Parallel Execution

To ensure tests can run in parallel (`fullyParallel: true`) without data collisions, follow these rules:

#### 1. Gold Standard: Generate IDs in `beforeEach`
**Never** generate test IDs or suffixes at the top level of the file. If multiple workers run tests from the same file, they will share the ID and collide.

```typescript
// ✅ CORRECT: Unique ID per test execution
test.describe('Feature', () => {
    let suffix: string;
    let studentId: string;

    test.beforeEach(() => {
        suffix = getTestSuffix('myFeature'); // Generates unique suffix
        studentId = `S_${suffix}`;
    });
});
```

```typescript
// ❌ WRONG: Shared ID across all workers/retries
const suffix = getTestSuffix('myFeature'); 
const studentId = `S_${suffix}`;

test.describe('Feature', () => { ... });
```

#### 2. Robustness Pattern: Search over Wait
When waiting for an item to appear in a list (e.g., Student Table), **do not** just wait for it to appear. If the list is long or loading is delayed, the item might be off-screen.
**Always filter** the list to the specific ID you created.

```typescript
// ✅ CORRECT: Force UI to show ONLY your item
await page.getByPlaceholder('Search...').fill(studentId); 
await expect(page.getByRole('row', { name: studentId })).toBeVisible();
```

```typescript
// ❌ FLAKY: Might fail if list is long or slow
await expect(page.getByRole('row', { name: studentId })).toBeVisible();
```

### Avoid

- `page.waitForTimeout()` - use web-first assertions with timeout instead
- `page.reload()` - only use if absolutely necessary; prefer web-first assertions
- `window.e2e.*` - use imports from `convex-client.ts`

## All Test Commands

```bash
# Run browser unit tests (locator pattern, real Chromium)
bunx vitest run --config vite.config.ts

# Run server unit tests (convex-test)
bunx vitest run src/convex/*.test.ts

# Run e2e tests (requires dev server)
bun run test:e2e

# Run unit tests then e2e tests
bun run test:all
```

## Data Isolation

### E2E Tests

Use unique `e2eTag` for each test:

```typescript
const suffix = getTestSuffix('mytest'); // e.g., "mytest_123456_abc"
const categoryName = `Category_${suffix}`;

await createCategory({
	name: categoryName,
	e2eTag: `e2e-test_${suffix}`
});
```

### User Isolation: Infra vs Ephemeral

To support robust parallel testing, we distinguish between two types of test users:

1.  **Core Infrastructure Users**: Shared accounts (`super@hwis.test`, `admin@hwis.test`, `teacher@hwis.test`) that provide the `storageState` for tests.
    - **Stability**: These users are **protected** from automatic cleanup functions.
    - **Parallel Safety**: Preventing their deletion ensures that a teardown in one parallel worker doesn't log out a test running in another worker (averting "Pending Approval" or "Unauthorized" errors).
    - **Reusability**: They are updated/synchronized at the start of each suite by `setup.spec.ts`.

2.  **Ephemeral Test Users**: Any users created dynamically *during* a test (e.g., via a signup flow or generic `e2e_` prefixes).
    - **Cleanup**: These are automatically deleted by `cleanupTestUsers` or `cleanupAll` at the end of runs.

### Cleanup

```bash
# Nuclear cleanup
bunx convex run testCleanup:cleanupAll

# Full database reset
bunx convex run resetDb:resetDatabase
```

## Tailwind CSS Conventions

When using Tailwind CSS for sizing, prefer the `size-*` utility classes over separate `w-*` and `h-*` classes when setting both width and height to the same value:

```html
<!-- Preferred -->
<div class="size-4">Icon</div>

<!-- Avoid -->
<div class="w-4 h-4">Icon</div>
```

This applies to icons, buttons, avatars, and any other elements where width equals height.

## Common Issues & Solutions

| Issue                  | Solution                                                  |
| ---------------------- | --------------------------------------------------------- |
| Auth failures          | Check `e2e/.auth/*.json` files exist                      |
| Hydration not complete | Use `await page.waitForSelector('body.hydrated')`         |
| Data not appearing     | Use `await expect(locator).toBeVisible()`                 |
| Locator not found      | Use semantic queries: `getByRole()`, `getByPlaceholder()` |
| Test times out         | Use web-first assertions with timeout                     |
| Wrong element found    | Use specific selectors with name option                   |
| Version mismatch       | Ensure `@vitest/browser` and `vitest` versions match      |
| Category not found     | Wait for UI update before `setE2eTag` (timing issue)      |

### TestToken Bypass Pattern

For e2e tests that create data via Convex mutations, the `testToken` bypass allows tests to run without real authentication:

**File: `src/lib/e2e-utils.ts`**

```typescript
const TEST_TOKEN = 'unit-test-token'; // Must match the bypass check in Convex
```

**How it works:**

1. All e2e utility functions pass `testToken: TEST_TOKEN` to mutations
2. Convex mutations check `if (args.testToken === 'unit-test-token')`
3. If true, they bypass real auth and use/create test users

**Example bypass in Convex mutation:**

```typescript
// dataFactory.ts
if (args.testToken === 'unit-test-token') {
  // Look for existing test teacher or create one
  const existingUser = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', 'e2e_test_teacher'))
    .first();

  if (existingUser) {
    teacherId = existingUser._id;
  } else {
    teacherId = await ctx.db.insert('users', {
      authId: 'e2e_test_teacher',
      name: 'E2E Test Teacher',
      role: 'teacher',
      status: 'active'
    });
  }
}
```

**Important:** The `cleanupByTag` mutation must also accept `testToken`:

```typescript
// testCleanup.ts
export const cleanupByTag = mutation({
  args: {
    dataType: v.union(...),
    e2eTag: v.string(),
    testToken: v.optional(v.string()) // Required for bypass
  },
  handler: async (ctx, args) => {
    await getAuthenticatedUser(ctx, args.testToken); // Uses bypass
    // ... cleanup logic
  }
});
```

### Timing Issues with setE2eTag

When renaming entities via UI and then calling `setE2eTag`, you must wait for the UI to update first:

```typescript
// ❌ WRONG - Timing issue, name change may not be visible yet
await page.getByRole('button', { name: 'Update' }).click();
await setE2eTag('categories', updatedName, e2eTag); // Fails - category not found
```

```typescript
// ✅ CORRECT - Wait for UI update first
await page.getByRole('button', { name: 'Update' }).click();

// Wait for the new name to appear in the UI
await expect(page.getByRole('cell', { name: updatedName })).toBeVisible();

// Now safe to tag
await setE2eTag('categories', updatedName, e2eTag);
```

This ensures the Convex mutation can find the entity by its new name.

## CI/CD Pipeline

Tests run on every PR:

1. **Browser unit tests** - Vitest with real Chromium
2. **Server unit tests** - Vitest with convex-test
3. **E2E tests** - Playwright (requires dev server)

## Related Documentation

- [Vitest Browser Mode](https://vitest.dev/guide/browser/)
- [vitest-browser-svelte](https://github.com/vitest-dev/vitest-browser-svelte)
- [Playwright](https://playwright.dev/docs)
- [Convex Testing](https://docs.convex.dev/testing)
- [Better Auth](https://www.better-auth.com/docs)

## Test Coverage Summary

### Current Coverage (as of Feb 2026)

| Category           | Test Files | Tests           |
| ------------------ | ---------- | --------------- |
| Browser unit tests | 10         | varies          |
| Server unit tests  | 7          | varies          |
| E2E tests          | 19         | varies          |

### Pages with Browser Tests

| Route               | Tests | Coverage         |
| ------------------- | ----- | ---------------- |
| `/login`            | 1     | Structure        |
| `/admin`            | 1     | Structure        |
| `/admin/academic`   | 1     | Structure        |
| `/admin/students`   | 2     | Dialogs, fields  |
| `/admin/weekly-reports` | 1 | Structure        |
| `/evaluations`      | 1     | Structure        |
| `/evaluations/new`  | 1     | Structure        |
| `/rejected`         | 1     | Static page      |
| `$lib/utils.ts`     | 1     | cn() utility     |

### Convex Functions with Tests

| Function            | Edge Cases                   |
| ------------------- | ---------------------------- |
| `audit.*`           | Access, filtering            |
| `backup.*`          | Basic flows                  |
| `categories.*`      | CRUD, subCategories          |
| `evaluations.*`     | CRUD, sorting, filters       |
| `students.*`        | Validation, duplicates       |
| `students.duplicates.*` | Deduping paths          |
| `weekly-reports.*`  | CRUD, filters                |

### Test Strategy

1. **Browser Tests**: Focus on static structure only (headers, buttons, forms, dialogs)
2. **Convex Tests**: Cover edge cases (validation, duplicates, cascades, status transitions)
3. **E2E Tests**: Full user flows with real data (pre-existing)
