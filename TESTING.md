# Testing Guide for AI Agents

This document provides comprehensive guidance for AI agents working on the HWIS testing infrastructure.

## Quick Start

```bash
# Run unit tests (fast, no server needed)
npm run test:unit

# Run e2e tests (requires dev server running)
npm run test:e2e

# Run all tests
npm run test:all
```

## Test Architecture

### Stack

- **Unit Tests**: Vitest + convex-test (fast, deterministic, no network calls)
- **E2E Tests**: Playwright (real browser, tests full UI flows)
- **Auth**: Better Auth with Google OAuth

### Directory Structure

```
HWIS/
├── src/
│   ├── lib/
│   │   └── e2e-utils.ts      # Test utilities (Convex client helpers)
│   └── convex/
│       ├── testSetup.ts      # Creates test users in Convex
│       ├── testCleanup.ts    # Cleans up test data
│       ├── testE2E.ts        # E2E-specific test functions
│       └── dataFactory.ts    # Creates test data (students, categories, etc.)
├── e2e/
│   ├── convex-client.ts      # Import THIS in tests for data helpers
│   ├── auth.helpers.ts       # Auth helpers (setTestAuth, etc.)
│   ├── students.shared.ts    # Shared student test utilities
│   ├── helpers.ts            # getTestSuffix() utility
│   └── *.spec.ts             # Playwright test files
└── TESTING.md                # This file
```

## Key Testing Principles

### 1. Hydration Flag (Critical)

The app adds `body.hydrated` class when SvelteKit client-side hydration is complete. Always wait for this before interacting with the UI:

```typescript
test.beforeEach(async ({ page }) => {
	await page.goto('/admin/categories');
	await page.waitForSelector('body.hydrated'); // Wait for hydration!
});
```

**Why?** SvelteKit renders SSR HTML first, then hydrates. Without waiting, tests may interact with non-interactive SSR content.

### 2. Auto-Waiting with Web-First Assertions

**NEVER use `page.waitForTimeout()`.** Use web-first assertions instead:

```typescript
// BAD - arbitrary timeout
await page.waitForTimeout(3000);
await expect(page.getByText('New Data')).toBeVisible();

// GOOD - Playwright auto-retries until condition met (default 5s timeout)
await expect(page.getByText('New Data')).toBeVisible();
```

Web-first assertions automatically poll until:

- Element is visible
- Text matches
- Count equals expected value
- etc.

This works perfectly with Convex subscriptions - Playwright will retry until Convex pushes the new data. The default 5s timeout is sufficient for most cases.

### 3. Data Isolation

Always use unique `e2eTag` for each test to prevent parallel workers from interfering:

```typescript
const suffix = getTestSuffix('mytest'); // e.g., "mytest_123456_abc"
const categoryName = `Category_${suffix}`;

await createCategory({
	name: categoryName,
	e2eTag: `e2e-test_${suffix}`
});
```

### 4. No Reload Needed After Server-Side Data Creation

With web-first assertions, you don't need to reload after creating data via server API:

```typescript
// Create data via server API
await createCategory({ name: 'Test', e2eTag: 'test' });

// Web-first assertion auto-retries until Convex subscription updates
await expect(page.getByText('Test')).toBeVisible();
```

## Writing E2E Tests

### Use Convenience Imports (Recommended)

Import from `e2e/convex-client.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { createCategory, cleanupTestData, getTestSuffix } from './convex-client';
import { cleanupE2EData } from './students.shared';

test.describe('Categories @categories', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/categories');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupE2EData(page, 'test');
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

	test('can delete category with cascade', async ({ page }) => {
		const suffix = getTestSuffix('delCasc');
		const categoryName = `Category_${suffix}`;

		// Create category via server API
		await createCategoryWithSubs({
			name: categoryName,
			subCategories: ['Sub1'],
			e2eTag: `e2e-test_${suffix}`
		});

		// Web-first assertion - no reload needed
		await expect(page.getByRole('row', { name: categoryName })).toBeVisible();

		// Click delete button
		const row = page.locator('table tbody tr', { hasText: categoryName });
		await row.getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog')).toBeVisible();

		// Verify warning appears (Convex query result)
		await expect(page.getByText(/This category has sub-categories with evaluations/)).toBeVisible({
			timeout: 5000
		});
	});
});
```

**Available imports from `e2e/convex-client.ts`:**

- `seedBaseline()` - Seeds users, categories
- `createStudent(opts)` - Create student with ID
- `createCategory(opts)` - Create category
- `createCategoryWithSubs(opts)` - Category with subcategories
- `createEvalForCategory(name)` - Create evaluation for category
- `createEvaluationForStudent(data)` - Create evaluation for student
- `cleanupTestData(tag)` - Cleanup by e2eTag
- `cleanupAll()` - Nuclear cleanup
- `cleanupAuditLogs()` - Cleanup audit logs
- `resetAll()` - Reset all test data
- `setRoleByEmail(email, role)` - Set user role
- `setMyRole(role)` - Set current user role

**From `e2e/students.shared.ts`:**

- `cleanupE2EData(page, testId)` - Cleanup test data (handles errors gracefully)
- `getTestSuffix(testId)` - Generate unique test suffix
- `expect` - Playwright expect for assertions

## Auth in Tests

### Setting Test Auth

Use `setTestAuth` from `e2e/auth.helpers.ts`:

```typescript
import { setTestAuth } from './auth.helpers';

test.beforeEach(async ({ page }) => {
	await setTestAuth(page, 'admin'); // 'admin', 'super', or 'teacher'
});
```

Or use pre-generated auth files:

```typescript
test.use({ storageState: 'e2e/.auth/admin.json' });
```

### Auth Files

Pre-generated auth files in `e2e/.auth/`:

- `admin.json` - Admin user session for most tests
- `super.json` - Super admin session for audit page
- `teacher.json` - Teacher session for evaluations
- `test.json` - Generic test session

## Test Data Management

### Tagging Test Data

All test data should include an `e2eTag` for cleanup:

```typescript
await createStudent({
	studentId: 'S_123',
	englishName: 'Test',
	grade: 10,
	e2eTag: `test_${getTestSuffix('mytest')}`
});
```

### Generating Unique IDs

Use `getTestSuffix()` from `e2e/helpers.ts`:

```typescript
import { getTestSuffix } from './helpers';

const suffix = getTestSuffix('mytest'); // e.g., "mytest_123456_abc123"
const studentId = `S_${suffix}`;
```

### Cleanup Strategy

1. **Per-test cleanup** - Clean up in `test.afterEach`:

   ```typescript
   test.afterEach(async () => {
   	await cleanupTestData(getTestSuffix('testId'));
   });
   ```

2. **Nuclear cleanup** - Run cleanup via Convex CLI:

   ```bash
   # Nuke all test data (users, students, evaluations, categories, audit logs)
   npx convex run testCleanup:cleanupAll

   # Full database reset + re-seed default data
   npx convex run resetDb:resetDatabase
   ```

3. **Per-table cleanup** - Via Convex dashboard or CLI:

   ```bash
   # Clean up test data by e2eTag
   npx convex run testCleanup:cleanupAllTestData

   # Clean up orphaned test users
   npx convex run testCleanup:cleanupAllTestUsers

   # Clean up audit logs
   npx convex run testCleanup:cleanupAuditLogs
   ```

## Unit Tests (Vitest)

### Location

- `src/convex/students.test.ts` - Student CRUD tests
- `src/convex/categories.test.ts` - Category tests

### Running

```bash
npm run test:unit              # Run all unit tests
npx vitest run src/convex/students.test.ts  # Specific file
```

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

## Debugging Tests

### Verbose Output

```bash
DEBUG=pw:api npx playwright test --reporter=line
```

### Error Context

Playwright generates `error-context.md` files in `test-results/` when tests fail. Check these for:

- Page snapshot at failure point
- DOM structure
- Console logs

### Test Isolation

Each test gets a fresh Convex database. Use unique `e2eTag` to avoid conflicts.

### Common Issues & Solutions

| Issue                   | Solution                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Auth failures           | Check `e2e/.auth/*.json` files exist. Use `setTestAuth(page, 'role')` as fallback        |
| Hydration not complete  | Use `await page.waitForSelector('body.hydrated')` before interacting                     |
| Data not appearing      | Don't use `waitForTimeout()` - use `await expect(locator).toBeVisible()`                 |
| Test times out          | Use web-first assertions with timeout: `expect(locator).toBeVisible({ timeout: 30000 })` |
| Wrong element found     | Use specific selectors: `page.getByRole('row', { name: 'Target' }).getByRole('button')`  |
| Convex subscription lag | Web-first assertions auto-retry - no reload needed                                       |

### Timing Issues with Convex

If Convex data isn't appearing:

1. **Wait for hydration first**:

   ```typescript
   await page.waitForSelector('body.hydrated');
   ```

2. **Use web-first assertions** (they auto-retry):

   ```typescript
   await expect(page.getByText('New Data')).toBeVisible({ timeout: 15000 });
   ```

3. **Avoid fixed timeouts** - they don't adapt to actual conditions and slow down tests.

## Adding New Test Utilities

### Step 1: Add to `src/lib/e2e-utils.ts`

```typescript
export function getE2EUtils(): E2EUtils {
	const client = new ConvexHttpClient(CONVEX_URL);
	return {
		// ... existing methods
		myNewMethod: async () => {
			// implementation
			return await client.mutation(api.myModule.myFunction, {});
		}
	};
}
```

### Step 2: Export from `e2e/convex-client.ts`

```typescript
export async function myNewMethod() {
	const utils = getUtils();
	return await utils.myNewMethod();
}
```

### Step 3: Use in Tests

```typescript
import { myNewMethod } from './convex-client';
await myNewMethod();
```

## Environment Variables

| Variable               | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `CONVEX_URL`           | Convex dev server (default: http://localhost:3210)     |
| `CONVEX_AUTH_TOKEN`    | Admin token for cleanup operations                     |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID (dev: from `auth.local.ts`)     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (dev: from `auth.local.ts`) |

## CI/CD Pipeline

Tests run on every PR:

1. **Unit tests** - Fast, no server needed

   ```bash
   npm run test:unit
   ```

2. **E2E tests** - Requires dev server

   ```bash
   npm run test:e2e
   ```

Full test suite:

```bash
npm run test:all
```

## Related Documentation

- [Playwright Documentation](https://playwright.dev/docs)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Convex Testing](https://docs.convex.dev/testing)
- [Better Auth](https://www.better-auth.com/docs)

---

**For AI Agents**: All tests should import utilities from `e2e/convex-client.ts` and follow the hydration + web-first assertion patterns described above.
