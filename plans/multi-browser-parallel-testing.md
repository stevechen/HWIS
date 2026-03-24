# Multi-Browser Parallel Testing Implementation Plan

## Overview

This plan implements a hybrid parallel testing strategy that:

1. Prevents cross-browser data collisions
2. Categorizes tests by parallel-safety for speed optimization
3. Documents patterns for future test development

## Problem Statement

Current issues:

- Tests run with `workers: 1` per project, but **projects run in parallel**
- Chromium and WebKit projects share `PLAYWRIGHT_WORKER_INDEX = '0'`
- Test data can collide across browser projects
- No categorization of parallel-safe vs sequential-required tests

## Solution Architecture

```mermaid
graph TD
    subgraph "Cross-Browser Isolation"
        A[getTestSuffix with Browser ID]
        A --> A1[CR for Chromium]
        A --> A2[WK for WebKit]
        A --> A3[FF for Firefox]
    end

    subgraph "Test Categorization"
        B[Test Annotations]
        B --> B1[@parallel - workers=4]
        B --> B2[@sequential - workers=1]
    end

    A1 --> C[Safe Multi-Browser Parallel Testing]
    A2 --> C
    A3 --> C
    B1 --> C
    B2 --> C
```

## Implementation Steps

### Step 1: Update e2e/helpers.ts

Add browser short name helper and update `getTestSuffix()`:

```typescript
/**
 * Get short browser name for test data isolation.
 * Prevents cross-browser data collisions when projects run in parallel.
 */
export function getBrowserShortName(): string {
	const project = process.env.PROJECT_NAME || '';
	if (project.includes('webkit') || project.includes('WK')) return 'WK';
	if (project.includes('firefox') || project.includes('FF')) return 'FF';
	return 'CR'; // Default to Chromium
}

/**
 * Generate unique test suffix with browser ID for cross-browser isolation.
 * Format: {testName}_{browser}_{worker}_{timestamp}_{random}
 * Example: addCat_CR_0_123456_abc
 */
export function getTestSuffix(testName: string): string {
	const workerId = process.env.PLAYWRIGHT_WORKER_INDEX || '0';
	const browserId = getBrowserShortName();
	const timestamp = Date.now().toString().slice(-6);
	const random = Math.random().toString(36).substring(2, 6);
	return `${testName}_${browserId}_${workerId}_${timestamp}_${random}`;
}

/**
 * Generate unique e2e tag for test data cleanup.
 * Format: e2e-test_{browser}_{worker}_{timestamp}_{random}
 */
export function getUniqueTag(prefix: string = 'test'): string {
	const workerId = process.env.PLAYWRIGHT_WORKER_INDEX || '0';
	const browserId = getBrowserShortName();
	const timestamp = Date.now().toString().slice(-6);
	const random = Math.random().toString(36).substring(2, 6);
	return `${prefix}_${browserId}_${workerId}_${timestamp}_${random}`;
}
```

### Step 2: Update playwright.config.ts

Split projects into parallel and sequential:

```typescript
import { type PlaywrightTestConfig, devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 1,
	reporter: 'html',
	webServer: {
		command: 'bash scripts/start-dev-servers.sh',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 120000
	},
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry'
	},
	projects: [
		// Setup
		{
			name: 'setup',
			testMatch: 'e2e/setup.spec.ts'
		},

		// Chromium - Parallel-safe tests
		{
			name: 'chromium-parallel',
			use: { ...devices['Desktop Chrome'] },
			testMatch: '**/*.spec.ts',
			testIgnore: [/@sequential/, '**/setup.spec.ts', '**/cleanup.spec.ts'],
			dependencies: ['setup'],
			workers: process.env.CI ? 2 : 4,
			env: {
				PROJECT_NAME: 'chromium-parallel'
			}
		},

		// Chromium - Sequential tests
		{
			name: 'chromium-sequential',
			use: { ...devices['Desktop Chrome'] },
			testMatch: '**/*.spec.ts',
			grep: /@sequential/,
			dependencies: ['setup'],
			workers: 1,
			env: {
				PROJECT_NAME: 'chromium-sequential'
			}
		},

		// WebKit - Parallel-safe tests
		{
			name: 'webkit-parallel',
			use: { ...devices['Desktop Safari'] },
			testMatch: '**/*.spec.ts',
			testIgnore: [/@sequential/, '**/setup.spec.ts', '**/cleanup.spec.ts'],
			dependencies: ['setup'],
			workers: process.env.CI ? 2 : 4,
			env: {
				PROJECT_NAME: 'webkit-parallel'
			}
		},

		// WebKit - Sequential tests
		{
			name: 'webkit-sequential',
			use: { ...devices['Desktop Safari'] },
			testMatch: '**/*.spec.ts',
			grep: /@sequential/,
			dependencies: ['setup'],
			workers: 1,
			env: {
				PROJECT_NAME: 'webkit-sequential'
			}
		},

		// Authenticated tests (if needed)
		...(hasTeacherAuth
			? [
					{
						name: 'authenticated',
						use: {
							...devices['Desktop Chrome'],
							storageState: 'e2e/.auth/teacher.json'
						},
						testMatch: 'e2e/evaluations.spec.ts',
						dependencies: ['setup'],
						workers: 1,
						env: {
							PROJECT_NAME: 'authenticated'
						}
					}
				]
			: []),

		// Cleanup
		{
			name: 'cleanup',
			testMatch: 'e2e/cleanup.spec.ts'
		}
	]
};

export default config;
```

### Step 3: Update TESTING.md

Add new section after "Best Practices for Parallel Execution":

````markdown
## Multi-Browser Parallel Testing

### Browser ID in Test Data

All test data must include a browser identifier to prevent cross-project collisions:

| Browser  | Short ID | Example Suffix           |
| -------- | -------- | ------------------------ |
| Chromium | CR       | `addCat_CR_0_123456_abc` |
| WebKit   | WK       | `addCat_WK_0_123456_abc` |
| Firefox  | FF       | `addCat_FF_0_123456_abc` |

The `getTestSuffix()` function automatically includes the browser ID.

### Test Categorization: @parallel vs @sequential

Tests are categorized by their parallel-safety:

#### Parallel-Safe Tests (Default)

Tests that:

- Create unique data and assert on that specific data
- Do NOT assert on counts, totals, or "only" conditions
- Do NOT test empty states that depend on no data existing

```typescript
// No annotation needed - parallel by default
test.describe('CRUD Tests', () => {
	test('creates category', async ({ page }) => {
		const suffix = getTestSuffix('create'); // Includes browser ID
		await createCategory({ name: `Category_${suffix}` });
		await expect(page.getByText(`Category_${suffix}`)).toBeVisible();
	});
});
```
````

#### Sequential-Required Tests (@sequential)

Tests that:

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

### Creating New Tests: Checklist

When creating a new E2E test, follow this checklist:

1. **Use `getTestSuffix()` for all unique identifiers**

   ```typescript
   const suffix = getTestSuffix('myTest'); // Auto-includes browser ID
   const studentId = `STU_${suffix}`;
   const e2eTag = `e2e-test_${suffix}`;
   ```

2. **Determine if test is parallel-safe**
   - Does it assert on specific unique data? **Parallel-safe**
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

| Configuration            | Estimated Time (10 min baseline) |
| ------------------------ | -------------------------------- |
| Current (all sequential) | 10 min                           |
| Hybrid (75% parallel)    | ~5-6 min                         |

The exact improvement depends on the ratio of parallel-safe tests.

```

## Test Categorization Analysis

Based on analysis of existing tests:

### Parallel-Safe Tests (~75%)
- Most CRUD tests (create, update, delete with unique IDs)
- Form validation tests
- Navigation tests
- Access control tests
- Tests that assert on specific named elements

### Sequential-Required Tests (~25%)
- [`e2e/audit.spec.ts:226`](e2e/audit.spec.ts:226) - `toHaveCount(3)`
- [`e2e/students/list.spec.ts:267`](e2e/students/list.spec.ts:267) - Empty state test
- [`e2e/admin-evaluations-infinite-scroll.spec.ts:300`](e2e/admin-evaluations-infinite-scroll.spec.ts:300) - Empty state test
- Any test with `count()` assertions that expect specific values

## Migration Steps

1. **Phase 1: Update helpers.ts** (Low risk)
   - Add `getBrowserShortName()`
   - Update `getTestSuffix()` to include browser ID
   - Update `getUniqueTag()` to include browser ID

2. **Phase 2: Update playwright.config.ts** (Medium risk)
   - Split projects into parallel and sequential
   - Add PROJECT_NAME environment variable
   - Test with single browser first

3. **Phase 3: Categorize existing tests** (Medium risk)
   - Identify sequential-required tests
   - Add `@sequential` annotation to describe blocks
   - Run tests to verify categorization

4. **Phase 4: Update TESTING.md** (Low risk)
   - Document new patterns
   - Add checklist for new tests
   - Add decision tree for parallel-safety

## Rollback Plan

If issues arise:
1. Revert `playwright.config.ts` to `workers: 1` for all projects
2. The browser ID changes are backward compatible
3. Tests will still work, just slower

## Success Criteria

- [ ] All tests pass with new browser ID suffix
- [ ] Parallel tests run with `workers > 1` without data collisions
- [ ] Sequential tests run with `workers = 1` and pass reliably
- [ ] TESTING.md updated with clear instructions
- [ ] CI time reduced by at least 30%
```
