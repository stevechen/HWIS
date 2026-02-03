# Testing Guide for AI Agents

This document provides comprehensive guidance for AI agents working on the HWIS testing infrastructure.

## Quick Start

```bash
# Run unit tests (fast, no server needed)
bun run test:unit

# Run e2e tests (requires dev server running)
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
├── tests/
│   └── routes/
│       └── admin/
│           └── *.test.ts       # Browser unit tests (vitest-browser-svelte)
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
	useQuery: vi.fn((_api: unknown) => {
		const apiStr = JSON.stringify(_api);
		if (apiStr.includes('viewer')) {
			return { data: { role: 'admin' }, loading: false, error: null };
		}
		return { data: [], loading: false, error: null };
	}),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin' } }
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
});
```

### Key Principles

1. **Use Semantic Locators** (priority order):
   - `page.getByRole('heading')` - for headings
   - `page.getByRole('button')` - for buttons
   - `page.getByRole('textbox')` - for inputs
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
   	useQuery: vi.fn((_api: unknown) => {
   		const apiStr = JSON.stringify(_api);
   		if (apiStr.includes('viewer')) {
   			return { data: { role: 'admin' }, loading: false, error: null };
   		}
   		return { data: [], loading: false, error: null };
   	}),
   	useConvexClient: vi.fn(() => ({
   		mutation: vi.fn().mockResolvedValue(undefined),
   		query: vi.fn().mockResolvedValue({})
   	}))
   }));

   vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
   	useAuth: vi.fn(() => ({
   		isLoading: false,
   		isAuthenticated: true,
   		data: { user: { name: 'Test Admin' } }
   	}))
   }));
   ```

4. **Test Static Structure Only**:
   - Headers, buttons, form labels, table structures
   - Avoid testing Convex-dynamic content (doesn't render with mocks)

5. **Use `isLoading: true`** for pages with auth redirects:
   ```typescript
   useQuery: vi.fn(() => ({
   	data: { role: 'admin' },
   	isLoading: true, // Prevents redirect during test
   	loading: true,
   	error: null
   }));
   ```

### Running Browser Tests

```bash
# Run all browser unit tests
bunx vitest run --project=client

# Run specific test file
bunx vitest run tests/routes/admin/students/student-table.test.ts

# Run with UI
bunx vitest run --ui
```

## Server Unit Tests (convex-test)

### Location

- `src/convex/students.test.ts` - Student CRUD tests
- `src/convex/categories.test.ts` - Category tests
- `src/convex/*.test.ts` - Other Convex function tests

### Pattern

```typescript
import { convexTest } from './test';
import { expect, test } from 'vitest';

test('creates student', async () => {
  convexTest.run(async (ctx) => {
    const studentId = await ctx.db.insert('students', { ... });
    const student = await ctx.db.get(studentId);
    expect(student).toMatchObject({ name: 'Test' });
  });
});
```

### Running Server Tests

```bash
# Run all server unit tests
bunx vitest run --project=server

# Run specific file
bunx vitest run src/convex/students.test.ts
```

## E2E Tests (Playwright)

### Use Convenience Imports

Import from `e2e/convex-client.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { createCategory, cleanupTestData, getTestSuffix } from './convex-client';

test.describe('Categories @categories', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated'); // Critical!
	});

	test('can add category', async ({ page }) => {
		const suffix = getTestSuffix('add');
		const categoryName = `Category_${suffix}`;

		await page.getByRole('button', { name: 'Add new category' }).click();
		await page.getByLabel('Category Name').fill(categoryName);
		await page.getByRole('button', { name: 'Save' }).click();

		// Web-first assertion - waits for Convex subscription update
		await expect(page.getByText(categoryName)).toBeVisible();
	});
});
```

### Available E2E Imports

From `e2e/convex-client.ts`:

- `seedBaseline()` - Seeds users, categories
- `createStudent(opts)` - Create student with ID
- `createCategory(opts)` - Create category
- `createCategoryWithSubs(opts)` - Category with subcategories
- `createEvaluationForStudent(data)` - Create evaluation for student
- `createEvalForCategory(categoryName)` - Create evaluation for category
- `cleanupTestData(tag)` - Cleanup by e2eTag
- `cleanupAll()` - Nuclear cleanup

### Running E2E Tests

```bash
# Run all e2e tests (requires dev server)
bun run test:e2e

# Run specific test
bunx playwright test e2e/students.spec.ts

# Run with single worker (more stable)
bunx playwright test e2e/students.spec.ts --workers=1
```

## All Test Commands

```bash
# Browser unit tests (locator pattern)
bunx vitest run --config vite.config.ts

# Server unit tests (convex-test)
bunx vitest run src/convex/*.test.ts

# E2E tests (Playwright)
bun run test:e2e

# Full test suite
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

### Cleanup

```bash
# Nuclear cleanup
bunx convex run testCleanup:cleanupAll

# Full database reset
bunx convex run resetDb:resetDatabase
```

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

### Current Coverage (as of Jan 2026)

| Category           | Test Files | Tests           |
| ------------------ | ---------- | --------------- |
| Browser unit tests | 11         | ~54             |
| Server unit tests  | 6          | 68              |
| E2E tests          | 19         | varies          |
| **Total**          | **36**     | **157 passing** |

### Pages with Browser Tests

| Route               | Tests | Coverage             |
| ------------------- | ----- | -------------------- |
| `/admin`            | 1     | Basic structure      |
| `/admin/academic`   | 3     | Structure            |
| `/admin/audit`      | 4     | Structure, buttons   |
| `/admin/backup`     | 6     | Structure, buttons   |
| `/admin/categories` | 8     | Dialogs, form fields |
| `/admin/students`   | 10    | Dialogs, form fields |
| `/admin/users`      | 3     | Structure            |
| `/evaluations`     | 4     | Timeline, navigation, sorting, details toggle |
| `/evaluations/new`  | 7     | Form structure       |
| `/evaluations/student/[id]` | 31 | Timeline, sorting, filtering, admin features |
| `/rejected`         | 4     | Static page          |
| `$lib/utils.ts`     | 8     | cn() utility         |

### Convex Functions with Tests

| Function            | Edge Cases                   |
| ------------------- | ---------------------------- |
| `categories.create` | Basic, subCategories         |
| `categories.update` | Name, subCategories, removal |
| `categories.remove` | Cascade, error handling      |
| `categories.list`   | Filters, sorting             |
| `students.create`   | Validation, duplicates       |
| `students.update`   | Field preservation           |
| `students.list`     | Search, filters, sorting     |
| `students.remove`   | Cascade, status changes      |

### Test Strategy

1. **Browser Tests**: Focus on static structure only (headers, buttons, forms, dialogs)
2. **Convex Tests**: Cover edge cases (validation, duplicates, cascades, status transitions)
3. **E2E Tests**: Full user flows with real data (pre-existing)
