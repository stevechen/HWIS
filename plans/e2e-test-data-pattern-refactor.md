# E2E Test Data Pattern Refactor

## Goal

Refactor E2E tests to ensure reliable automatic cleanup of test data without manual intervention.

## Pattern

### Core Principles

1. **Each test that creates its own data must be in an isolated `test.describe()` block**
2. **Data seeding in `test.beforeEach()` (FIRST hook)** - API calls to create test data
3. **Cleanup in `test.afterEach()`** - Conditional cleanup based on boolean flag
4. **Page navigation in `test.beforeEach({ page })`** - Playwright page parameter

### Correct Structure

```typescript
test.describe('Test Feature - Specific Test Name', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// CONSTANTS - Define at top of describe
	const suffix = getTestSuffix('testId');
	const entityName = `Entity_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testEntity = false;

	// DATA SEEDING & Navigation
	test.beforeEach(async (page) => {
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

### For UI-Created Data

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

### For Delete Tests

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

## Helper Functions

### `createTestEntity(suffix: string)`

Helper function for tests that need data seeded:

```typescript
function createTestEntity(suffix: string) {
	const entityName = `Entity_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	return { entityName, e2eTag };
}
```

### Boolean Flag Convention

- Use `let testEntity = false;` at describe level
- Set to `true` after successful data creation
- Check in `afterEach()` before cleanup

## File Status

### Completed

- [x] `e2e/students.delete.spec.ts` - 8 tests, all passing
- [x] `e2e/students.list.spec.ts` - 11 tests, all passing
- [x] `e2e/categories.spec.ts` - 34 tests, all passing

### Pending

- [ ] `e2e/evaluations.spec.ts`
- [ ] Other test files

## Key Differences from Old Pattern

| Old Pattern                            | New Pattern                                   |
| -------------------------------------- | --------------------------------------------- |
| Shared `beforeEach` in parent describe | Each test in own describe with isolated hooks |
| Relied on `seedBaseline`               | Each test seeds its own data                  |
| Manual cleanup calls                   | Automatic cleanup via `afterEach()`           |
| No tagging                             | `e2eTag` for reliable cleanup                 |

## Running Tests

```bash
# Run specific test file
bun playwright test e2e/categories.spec.ts --workers=1

# Run with single worker for stability
bun playwright test e2e/categories.spec.ts --workers=1
```
