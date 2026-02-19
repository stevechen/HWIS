# Testing Guide for AI Agents

This document provides comprehensive guidance for AI agents working on the HWIS testing infrastructure.

## Quick Start

```bash
# Run server unit tests (fast, no browser/server needed)
bun run test:unit

# Run component/browser tests (Chromium via Vitest browser project)
bunx vitest run --config vite.config.ts --project client

# Run e2e tests (Playwright will start dev server)
bun run test:e2e

# Run e2e tests in Chromium + WebKit (slower)
E2E_CROSS_BROWSER=1 bun run test:e2e

# Run e2e tests in UI mode
bun run test:e2e:ui

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

### Mocking useQuery with Proper Types

When mocking `useQuery` return values, the type must match `UseQueryReturn` exactly:

```typescript
// Define a properly typed mock result
interface MockQueryResult<T> {
	data: T;
	isLoading: false;  // Must be literal false, not boolean
	error: undefined;  // Must be undefined, not null
	isStale: boolean;
}

const mockUser = {
	role: 'admin',
	status: 'active',
	name: 'Test Admin'
} as const;

const mockResult: MockQueryResult<typeof mockUser> = {
	data: mockUser,
	isLoading: false,
	error: undefined,
	isStale: false
};

vi.mocked(useQuery).mockReturnValue(mockResult);
```

**Common Mistakes:**
- Using `error: null` instead of `error: undefined`
- Using `isLoading: boolean` instead of literal `false`
- Using `as any` which hides type errors

### Passing Required Props

Some components require props that are normally provided by SvelteKit's `data` prop. Pass these explicitly:

```typescript
// Component expects: let { data }: { data: { demoMode?: boolean } } = $props();
render(WeeklyReportsPage, { data: { demoMode: false } });
```

### Testing Text vs Headings

Not all visible titles are semantic headings. Card.Title components render as `<div>`, not `<h1>`-`<h6>`:

```typescript
// ❌ WRONG - Card.Title is not a semantic heading
await expect.element(page.getByRole('heading', { name: 'Title' })).toBeInTheDocument();

// ✅ CORRECT - Use getByText for non-semantic titles
await expect.element(page.getByText('Title')).toBeInTheDocument();
```

4. **Test Static Structure Only**:
   - Headers, buttons, form labels, table structures
   - Avoid testing Convex-dynamic content (doesn't render with mocks)

### Running Browser Tests

```bash
# Run all component/browser tests (locator pattern, real Chromium)
bunx vitest run --config vite.config.ts --project client

# Run specific test file
bunx vitest run --config vite.config.ts --project client tests/routes/admin/users/users-page.test.ts

# Run all component/browser tests
bunx vitest run --config vite.config.ts --project client tests/**/*.test.ts

# Run tests matching a name
bunx vitest run --config vite.config.ts --project client -t "Users Page"
```

## Server Unit Tests (convex-test)

### Location

- `src/convex/students.test.ts` - Student CRUD tests
- `src/convex/categories.test.ts` - Category tests
- `src/convex/*.test.ts` - Other Convex function tests
- `src/convex/testUtilities.test.ts` - Guardrail tests for test utilities

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

The server test config (`vitest.config.ts`) includes `src/convex/*.test.ts`.

```bash
# Run all server unit tests
bunx vitest run src/convex/*.test.ts

# Run only students tests
bunx vitest run src/convex/students.test.ts

# Run only categories tests
bunx vitest run src/convex/categories.test.ts

# Run utility guardrail tests
bunx vitest run src/convex/testUtilities.test.ts
```

### Test Utility Guardrails

`src/convex/testUtilities.test.ts` validates safety behavior for:

- `testSetup.ts`
- `testCleanup.ts`
- `resetDb.ts`
- `dedupeUsers.ts`

The focus is intentionally narrow:

- idempotency (safe to run more than once)
- scope control (only test/prefixed/tagged data is touched)
- protected account preservation (e.g. `teacher@hwis.test`, `admin@hwis.test`, `super@hwis.test`)

## E2E Tests (Playwright)

### Project Phases (Ordering)

Playwright runs tests in phases via project dependencies.

Default mode is Chromium-only for speed.  
Set `E2E_CROSS_BROWSER=1` to include WebKit.

### Default (Chromium-only)

1. `setup` (auth + storageState)
2. `chromium-parallel` (parallel-safe tests)
3. `cleanup-after-parallel` (delete all `e2eTag` data)
4. `chromium-sequential` (single-worker)
5. `auth-sequential` (logout/session invalidation tests; runs last)
6. `chromium-super` (audit tests with super user)

### Cross-browser Mode (`E2E_CROSS_BROWSER=1`)

Adds:

- `webkit-parallel`
- `webkit-sequential`
- `webkit-super`

If a project fails, **all dependent projects are skipped** (shown as “did not run” in UI).

### Waiting for Data Loading

After `body.hydrated`, you must wait for data to load before testing data-dependent elements:

```typescript
// For pages with data loading (students, categories, evaluations, etc.)
await page.goto('/admin/students');
await page.waitForSelector('body.hydrated');
// Wait for loading state to complete
await expect(page.getByText('Loading students...')).not.toBeVisible();
// Now safe to test data-dependent elements

// For pages without data or tests not dependent on data
await page.goto('/admin/settings');
await page.waitForSelector('body.hydrated');
// Just verify the heading is visible
await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
```

**Important:** Do not test for empty data states in E2E tests (e.g., "No students found"). Other parallel tests may create data that appears in your test. Empty state testing should be done in component tests.

### Use Convenience Imports

Import data helpers from `e2e/convex-client.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { createStudent, createCategory, cleanupByTag, getTestSuffix } from './convex-client';

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

	// VARs - Define at top of describe
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
| ✅ Completed | `e2e/students/crud.spec.ts` - student CRUD tests |
| ✅ Completed | `e2e/students/list.spec.ts` - student list tests |
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
- `cleanupByTag(dataType, e2eTag)` - Cleanup by e2eTag
- `cleanupAllE2eTaggedData()` - Cleanup all data that has `e2eTag`
- `cleanupAll()` - Nuclear cleanup
- `getTestSuffix(prefix)` - Generate unique test suffix
- `useRole(role)` - Set auth token for Convex API calls in tests

### E2E Auth Guard Notes

- Sensitive Convex test/setup/cleanup helpers are now auth-guarded.
- `e2e/convex-client.ts` automatically passes `testToken` for helper mutations.
- In non-production runtimes, default helper token is `unit-test-token`.
- If you set `E2E_TEST_TOKEN`, helper calls must use the same value.

### Running E2E Tests

```bash
# Run all e2e tests (requires dev server running)
bun run test:e2e

# Run cross-browser e2e tests (Chromium + WebKit)
E2E_CROSS_BROWSER=1 bun run test:e2e

# Run specific test file
bunx playwright test e2e/students/crud.spec.ts

# Run with single worker (more stable)
bunx playwright test e2e/students/crud.spec.ts --workers=1
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

### Empty State Testing

**Do not test "database empty" states in E2E tests.** When tests run in parallel with a shared backend, another test may create data that causes your empty state test to fail.

#### Problem

```typescript
// ❌ WRONG - Fails when other tests create data
test('shows empty state when no evaluations exist', async ({ page }) => {
    await page.goto('/admin/evaluations');
    await expect(page.getByText('No evaluations found.')).toBeVisible();
});
```

#### Solution: Use Component Tests

Empty states are **UI concerns** that don't need real backend data. Test them with component tests instead:

```typescript
// tests/lib/components/timeline/EvaluationsTimeline.test.ts
describe('Empty State', () => {
    it('shows empty message when no evaluations', async () => {
        render(EvaluationsTimeline, { evaluations: [] });
        await expect.element(page.getByText('No evaluations found.')).toBeInTheDocument();
    });
});
```

#### Filter Empty States Are OK

Tests that create data first, then filter to show nothing, are fine:

```typescript
// ✅ OK - Creates data, then filters to empty
test('filter with no matches shows empty state', async ({ page }) => {
    await createStudent({ studentId, englishName, e2eTag });
    await page.goto('/admin/students');
    await page.getByPlaceholder('Search...').fill('NonExistentXYZ123');
    await expect(page.getByText('No students match your filters')).toBeVisible();
});
```

#### Summary

| Test Type | Use For |
|-----------|---------|
| **Component Tests** | Empty states, loading states, error states |
| **E2E Tests** | Happy paths, CRUD operations, user flows with data |
| **E2E Filter Empty** | OK - creates data first, then filters to empty |

## Multi-Browser Parallel Testing

### Browser ID in Test Data

All test data includes a browser identifier to prevent cross-project collisions when multiple browser projects run in parallel:

| Browser | Short ID | Example Suffix |
|---------|----------|----------------|
| Chromium | CR | `addCat_CR_0_123456_abc` |
| WebKit | WK | `addCat_WK_0_123456_abc` |
| Firefox | FF | `addCat_FF_0_123456_abc` |

The `getTestSuffix()` function automatically includes the browser ID - no manual action required.

### Test Categorization: @parallel vs @sequential vs @auth-sequential

Tests are categorized by their parallel-safety using annotations:

#### Parallel-Safe Tests (Default - No Annotation)

Tests that:
- Create unique data and assert on that specific data
- Do NOT assert on counts, totals, or "only" conditions
- Do NOT test empty states that depend on no data existing

```typescript
// No annotation needed - parallel by default
test.describe('CRUD Tests', () => {
    test('creates category', async ({ page }) => {
        const suffix = getTestSuffix('create'); // Auto-includes browser ID
        await createCategory({ name: `Category_${suffix}` });
        await expect(page.getByText(`Category_${suffix}`)).toBeVisible();
    });
});
```

#### Sequential-Required Tests (@sequential)

Tests that MUST run with `workers: 1`:
- Assert on exact counts (`toHaveCount(3)`)
- Test empty states that depend on no data existing
- Assert "only" conditions

```typescript
// Tag with @sequential for single-worker execution
test.describe('Empty State Tests @sequential', () => {
    test('shows no categories when filtered', async ({ page }) => {
        await page.goto('/admin/categories');
        await page.getByPlaceholder('Search').fill('NonExistentXYZ');
        await expect(page.getByText('No categories match')).toBeVisible();
    });
});
```

#### Auth/Session Tests (@auth-sequential)

Tests that **logout** or **invalidate sessions** must run last because all parallel tests share
the same storageState users.

```typescript
test.describe('Session Management @session @auth-sequential', () => {
	// logout/invalidation tests here
});
```

### How To Decide: Parallel vs Sequential

Use this quick decision guide before writing a new test:

**Parallel-safe (default, no tag)** if all are true:
- Test creates **unique data** (via `getTestSuffix`) and only asserts on that data.
- Assertions are **existence/visibility** of the unique entity (not counts or totals).
- Test does **not** require a clean database or “only my data” guarantees.
- Test does **not** change shared auth/session state.

**Sequential (@sequential)** if any are true:
- Asserts **counts/totals** (`toHaveCount`, “shows 3 rows”, “only X exists”).
- Asserts **empty state** that depends on no other data existing.
- Relies on **global ordering** (e.g., newest/oldest across all users).
- Mutates shared resources in a way that affects other tests (global settings, shared lists).

**Auth/Session Sequential (@auth-sequential)** if any are true:
- Logs out or invalidates sessions.
- Changes user roles/permissions for shared storageState users.

**If unsure:** mark it `@sequential`. It’s slower but stable; you can always relax it later.

### Creating New Tests: Checklist

When creating a new E2E test, follow this checklist:

1. **Use `getTestSuffix()` for all unique identifiers**
   ```typescript
   const suffix = getTestSuffix('myTest'); // Auto-includes browser ID
   const studentId = `STU_${suffix}`;
   const e2eTag = `e2e-test_${suffix}`;
   ```

2. **Determine if test is parallel-safe**
   - Does it assert on specific unique data? **Parallel-safe** (no annotation)
   - Does it assert on counts or empty states? **Add @sequential**

3. **Use isolated describe blocks**
   ```typescript
   test.describe('Feature Name - Test Name', () => {
       test.use({ storageState: 'e2e/.auth/admin.json' });
       
       let suffix: string;
       let e2eTag: string;
       let hasData = false;
       
       test.beforeEach(async ({ page }) => {
           suffix = getTestSuffix('testId');
           e2eTag = `e2e-test_${suffix}`;
           // Create data, set hasData = true
       });
       
       test.afterEach(async () => {
           if (hasData) await cleanupByTag('all', e2eTag);
       });
       
       test('does something', async ({ page }) => {
           // Test assertions
       });
   });
   ```

4. **Never generate IDs at module level**
   ```typescript
   // WRONG - shared across workers
   const suffix = getTestSuffix('test');
   
   // RIGHT - unique per test execution
   test.beforeEach(() => {
       suffix = getTestSuffix('test');
   });
   ```

### Parallel-Safety Decision Tree

```
Does your test assert on...
    |
    +-- Specific unique data (e.g., "Category_CR_0_123_abc exists")
    |       --> PARALLEL-SAFE (no annotation needed)
    |
    +-- Count or total (e.g., "table has 3 rows")
    |       --> ADD @sequential
    |
    +-- Empty state (e.g., "No data found")
    |       --> ADD @sequential
    |
    +-- "Only" condition (e.g., "only my data shows")
            --> ADD @sequential
```

### Expected Speed Improvement

| Configuration | Estimated Time (10 min baseline) |
|---------------|----------------------------------|
| All sequential (current) | 10 min |
| Hybrid (75% parallel) | ~5-6 min |

The exact improvement depends on the ratio of parallel-safe tests.

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
# Cleanup all e2e-tagged data (preferred between test phases)
bun run test:e2e:cleanup

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

### Server Test Authentication Bypass

For server-side unit tests (convex-test), the `getAuthenticatedUser` function must check the test token **before** making any auth component calls:

```typescript
// auth.ts
export const getAuthenticatedUser = async (ctx: any, testToken?: string) => {
	// CRITICAL: Check test token FIRST to avoid hanging on auth component calls
	if (testToken === 'unit-test-token') {
		return {
			_id: 'test-user-id',  // Must match audit log skip check
			authId: 'test_admin',
			name: 'Test Admin',
			role: 'admin',
			status: 'active'
		} as any;
	}
	// ... rest of function with real auth
};
```

**Why this order matters:**
- In convex-test environment, auth component calls hang indefinitely
- The test token check must come before any auth-related operations
- The mock user `_id` must be `'test-user-id'` to match the audit log skip check in `users.ts`

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
