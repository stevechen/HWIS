# Component Test Plan for HWIS (Revised)

## Executive Summary

This document outlines a strategic approach to component-level testing using **vitest-browser-svelte** as the primary testing framework. After evaluating Svelte Testing Library (jsdom-based) and vitest-browser-svelte (browser-based), we recommend **vitest-browser-svelte** for its superior mocking capabilities, more realistic browser environment, and alignment with the existing Playwright E2E infrastructure.

## Why vitest-browser-svelte Over Svelte Testing Library

### Technical Comparison

| Aspect                     | Svelte Testing Library (jsdom) | vitest-browser-svelte (Playwright)       |
| -------------------------- | ------------------------------ | ---------------------------------------- |
| **Environment**            | jsdom (simulated DOM)          | Real Chromium browser                    |
| **Mocking**                | Manual mocking required        | Native Playwright mocking                |
| **Convex Integration**     | Requires complex mock setup    | Playwright page mocking works seamlessly |
| **Svelte 5 Compatibility** | Partial support                | Full native support                      |
| **Test Speed**             | ~50-100ms per test             | ~100-300ms per test                      |
| **CI Overhead**            | Lower (no browser)             | Higher (browser startup)                 |

### Key Advantage: Less Brittle Mocking

**Problem with Svelte Testing Library:**

```typescript
// Svelte Testing Library - requires manual mocking
vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockStudents,
		loading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined)
	}))
}));

// Brittle - any change to hook structure breaks tests
```

**Solution with vitest-browser-svelte:**

```typescript
// vitest-browser-svelte - uses Playwright's native mocking
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';

test('renders students from Convex', async () => {
	// Mock Convex responses at the page level
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.args?.studentId) {
			return route.fulfill({
				body: JSON.stringify({ data: mockStudent })
			});
		}
	});

	render(StudentsPage);

	// More realistic - tests actual component behavior
	await expect.element(page.getByText('Alice')).toBeInTheDocument();
});
```

### Why Mocking is Less Brittle

1. **Playwright's network-level mocking** - Intercepts requests at the HTTP level
2. **No internal API knowledge required** - Mock the Convex API, not internal hooks
3. **Matches E2E patterns** - Same mocking strategy as Playwright tests
4. **Easier to update** - When Convex hooks change, mock at the API level still works

## Testing Pyramid Reconfiguration

### Current State

```
        E2E Tests (Playwright)
        250 tests | 15 min | ~3.6s each
       /          |         |          \
Server Tests      |         |         Component Tests
30 tests | 1 min | 2 sec each |      0 tests
```

### Proposed State

```
        E2E Tests (Playwright)
        200 tests | 12 min | ~3.6s each
       /          |         |          \
Server Tests      |         |         Component Tests
30 tests | 1 min | 2 sec each |      80 tests | 2 min | ~1.5s each
```

### Test Distribution

| Layer         | Tool                  | Count | Time   | Purpose                               |
| ------------- | --------------------- | ----- | ------ | ------------------------------------- |
| **E2E**       | Playwright            | 200   | 12 min | Full user flows, cross-user scenarios |
| **Component** | vitest-browser-svelte | 80    | 2 min  | Component logic, state, rendering     |
| **Server**    | convex-test           | 30    | 1 min  | Database operations, auth logic       |

### Migration Impact

- **E2E Tests:** Reduce by 50 (move CRUD details to component tests)
- **Component Tests:** Add 80 tests
- **Total Test Time:** Increase by 1-2 minutes (worth it for better coverage)
- **Coverage Improvement:** +40% unique component coverage

## Recommended Test Categories

### Tier 1: High-Value Component Tests (Focus Here First)

#### 1.1 Convex Query Integration

Test how components handle Convex query states with Playwright mocking:

```typescript
// src/routes/admin/students/+page.spec.ts
import { test, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import StudentsPage from './+page.svelte';

test('displays loading state while query is loading', async () => {
	// Mock Convex to return loading state
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === 'students.list') {
			// Simulate slow response
			await new Promise((r) => setTimeout(r, 1000));
			return route.fulfill({ body: JSON.stringify({ data: [] }) });
		}
	});

	render(StudentsPage);

	await expect.element(page.getByText(/loading/i)).toBeInTheDocument();
});

test('displays error state when query fails', async () => {
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === 'students.list') {
			return route.fulfill({
				status: 500,
				body: JSON.stringify({ error: 'Database error' })
			});
		}
	});

	render(StudentsPage);

	await expect.element(page.getByText(/error/i)).toBeInTheDocument();
});

test('renders student list from Convex response', async () => {
	const mockStudents = [
		{ _id: '1', englishName: 'Alice', grade: 10 },
		{ _id: '2', englishName: 'Bob', grade: 10 }
	];

	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === 'students.list') {
			return route.fulfill({
				body: JSON.stringify({ data: mockStudents })
			});
		}
	});

	render(StudentsPage);

	await expect.element(page.getByText('Alice')).toBeInTheDocument();
	await expect.element(page.getByText('Bob')).toBeInTheDocument();
});
```

#### 1.2 Filter and Search State Combinations

Test filter interactions (tedious in E2E):

```typescript
test('filters students by grade', async () => {
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === 'students.list') {
			// Return different data based on grade filter
			const grade = json.args?.grade;
			const filtered =
				grade === '10'
					? [{ _id: '1', englishName: 'Alice', grade: 10 }]
					: [{ _id: '2', englishName: 'Bob', grade: 9 }];
			return route.fulfill({ body: JSON.stringify({ data: filtered }) });
		}
	});

	render(StudentsPage);

	// Apply grade filter
	const gradeSelect = page.getByRole('combobox', { name: /filter by grade/i });
	await gradeSelect.selectOption('10');

	await expect.element(page.getByText('Alice')).toBeInTheDocument();
	await expect.element(page.getByText('Bob')).not.toBeInTheDocument();
});

test('combines grade filter with search', async () => {
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === 'students.list') {
			// Return filtered data
			return route.fulfill({
				body: JSON.stringify({
					data: [{ _id: '1', englishName: 'Alice', grade: 10 }]
				})
			});
		}
	});

	render(StudentsPage);

	const searchInput = page.getByPlaceholder(/search by name/i);
	await searchInput.fill('Alice');

	const gradeSelect = page.getByRole('combobox', { name: /filter by grade/i });
	await gradeSelect.selectOption('10');

	await expect.element(page.getByText('Alice')).toBeInTheDocument();
});
```

#### 1.3 Form Validation

Test client-side validation before Convex mutation:

```typescript
test('shows error for empty category name', async () => {
  render(CategoriesPage);

  const saveButton = page.getByRole('button', { name: /save/i });
  await saveButton.click();

  await expect.element(page.getByText(/name is required/i)).toBeInTheDocument();
});

test('disables submit button while submitting', async () => {
  let resolveMutation: () => void;
  const mutationPromise = new Promise(r => resolveMutation = r);

  await page.route('/api/convex', async (route) => {
    const json = await route.request().postDataJSON();
    if (json.function === 'categories.create') {
      await mutationPromise;
      return route.fulfill({ body: JSON.stringify({ data: { _id: '1' } } }) });
    }
  });

  render(CategoriesPage);

  await page.getByLabel('Category Name').fill('Test');
  await page.getByRole('button', { name: /save/i }).click();

  // Button should be disabled during submission
  await expect(page.getByRole('button', { name: /saving/i })).toBeDisabled();

  resolveMutation!();
});
```

### Tier 2: Medium-Value Component Tests

#### 2.1 Pagination

```typescript
test('shows correct pagination info', async () => {
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === 'students.list') {
			return route.fulfill({
				body: JSON.stringify({
					data: Array.from({ length: 25 }, (_, i) => ({
						_id: String(i),
						englishName: `Student${i}`
					}))
				})
			});
		}
	});

	render(StudentsPage);

	await expect.element(page.getByText(/showing 1-10 of 25/i)).toBeInTheDocument();
});
```

#### 2.2 Dialog Interactions

```typescript
test('opens add student dialog', async () => {
	render(StudentsPage);

	const addButton = page.getByRole('button', { name: /add student/i });
	await addButton.click();

	await expect.element(page.getByRole('dialog')).toBeInTheDocument();
});

test('closes dialog on escape', async () => {
	render(StudentsPage);

	await page.getByRole('button', { name: /add student/i }).click();
	await expect.element(page.getByRole('dialog')).toBeInTheDocument();

	await page.keyboard.press('Escape');
	await expect.element(page.getByRole('dialog')).not.toBeVisible();
});
```

## Integration Test Migration Mapping

### What CAN Move to Component Tests

| Integration Test             | Lines | Component Test Equivalent   | New File                  |
| ---------------------------- | ----- | --------------------------- | ------------------------- |
| Student CRUD - Edit flow     | 20    | Edit dialog, status change  | `students-page.spec.ts`   |
| Student CRUD - Delete flow   | 15    | Delete dialog, confirmation | `students-page.spec.ts`   |
| Evaluation persists - Filter | 12    | Filter input, selection     | `evaluation-form.spec.ts` |
| Evaluation persists - Click  | 10    | Student row click, state    | `evaluation-form.spec.ts` |
| Category form - Validation   | 8     | Name required, sub-cat add  | `categories-page.spec.ts` |

### What MUST Stay in E2E

| Integration Test             | Lines | Reason                                  |
| ---------------------------- | ----- | --------------------------------------- |
| Student CRUD - Real DB ops   | 15    | Must test real Convex mutations         |
| Evaluation persists - Submit | 12    | Full form submission, DB verify         |
| Category→Teacher             | 76    | Cross-user data sharing (unique to E2E) |

### Migration Summary

```
e2e/integration.spec.ts (229 lines)
├─ Keep in E2E: ~100 lines (real DB ops, cross-user)
└─ Move to Component Tests: ~129 lines (UI interactions, state)

New Component Test Files:
├─ src/routes/admin/students/+page.spec.ts (~50 lines)
├─ src/routes/admin/categories/+page.spec.ts (~30 lines)
├─ src/routes/evaluations/new/+page.spec.ts (~40 lines)
└─ src/routes/admin/weekly-reports/+page.spec.ts (~20 lines)
```

## Convex Mocking in vitest-browser-svelte

### Approach 1: Route-based Mocking (Recommended)

```typescript
test('uses Convex query data', async () => {
	await page.route('/api/convex/**', async (route) => {
		const url = route.request().url();

		if (url.includes('students.list')) {
			return route.fulfill({
				body: JSON.stringify({
					data: [{ _id: '1', englishName: 'Alice', grade: 10 }]
				})
			});
		}

		if (url.includes('students.create')) {
			const request = await route.request().postDataJSON();
			return route.fulfill({
				body: JSON.stringify({ data: { _id: 'new-id', ...request.args } })
			});
		}

		return route.continue();
	});

	render(StudentsPage);
	await expect.element(page.getByText('Alice')).toBeInTheDocument();
});
```

### Approach 2: Handler-based Mocking

```typescript
test('handles Convex mutations', async () => {
	let createHandler: (data: any) => any = (data) => ({ _id: 'new', ...data });

	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();

		if (json.function === 'students.create') {
			const result = createHandler(json.args);
			return route.fulfill({ body: JSON.stringify({ data: result }) });
		}

		return route.continue();
	});

	render(StudentsPage);

	// Test create flow
	await page.getByRole('button', { name: /add student/i }).click();
	await page.getByLabel('Student ID').fill('S001');
	await page.getByLabel('English Name').fill('Test');
	await page.getByRole('button', { name: /create/i }).click();

	await expect.element(page.getByText('Test')).toBeInTheDocument();
});
```

### Approach 3: Test Data Helper

```typescript
// src/lib/test/convex-mock.ts
import { page } from 'vitest/browser';

interface MockResponse {
	data?: any[];
	error?: string;
}

export async function mockConvexQuery(functionName: string, response: MockResponse) {
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === functionName) {
			return route.fulfill({ body: JSON.stringify(response) });
		}
		return route.continue();
	});
}

export async function mockConvexMutation(functionName: string, response: any = { success: true }) {
	await page.route('/api/convex', async (route) => {
		const json = await route.request().postDataJSON();
		if (json.function === functionName) {
			return route.fulfill({ body: JSON.stringify({ data: response }) });
		}
		return route.continue();
	});
}

// Usage
test('renders students', async () => {
	await mockConvexQuery('students.list', {
		data: [{ _id: '1', englishName: 'Alice' }]
	});

	render(StudentsPage);
	await expect.element(page.getByText('Alice')).toBeInTheDocument();
});
```

## CI/CD Implications

### Test Execution Speed

| Test Type                  | Per Test | Total (250 tests) | Browser    |
| -------------------------- | -------- | ----------------- | ---------- |
| E2E (Playwright)           | ~3.6s    | 15 min            | 3 browsers |
| Component (vitest-browser) | ~1.5s    | 2 min             | 1 browser  |
| Server (convex-test)       | ~2s      | 1 min             | jsdom      |

### Pipeline Configuration

```yaml
# .github/workflows/test.yml
jobs:
  component-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: bun install
      - run: bun run test:component # ~2 min

  server-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: bun install
      - run: bun run test:unit:convex # ~1 min

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: bun install
      - run: bun run test:e2e # ~15 min (with Playwright)
```

### Total CI Time

| Configuration         | Time            |
| --------------------- | --------------- |
| Current (E2E only)    | 15 min          |
| Proposed (all layers) | 18 min (+3 min) |

**Worth the investment:** +3 minutes for +40% component coverage and faster development feedback.

## Drawbacks and Migration Challenges

### Potential Drawbacks

1. **Browser Startup Overhead**
   - Each test file needs a browser instance
   - Solution: Run tests in parallel with Playwright workers

2. **Memory Usage**
   - Browser instances consume more memory
   - Solution: Limit concurrent workers

3. **Flaky Tests**
   - Browser-based tests can be less stable than jsdom
   - Solution: Use Playwright's auto-retry, proper waiting

4. **Learning Curve**
   - Team needs to learn vitest-browser-svelte API
   - Solution: Create example tests, documentation

### Migration Challenges

| Challenge                 | Mitigation                                                       |
| ------------------------- | ---------------------------------------------------------------- |
| Convex mocking complexity | Create helper utilities (`convex-mock.ts`)                       |
| Mocking async data flows  | Use Playwright's `waitForResponse` pattern                       |
| Component isolation       | Use `render(Component, { props })` for each test                 |
| Test file organization    | Mirror route structure: `+page.spec.ts` alongside `+page.svelte` |

## Implementation Roadmap

### Phase 1: Foundation (1-2 hours)

- [ ] Create `vitest.component.config.ts`
- [ ] Create `src/lib/test/convex-mock.ts` helpers
- [ ] Write first example test for StudentsPage loading state
- [ ] Verify CI integration works

### Phase 2: Students Page (2-3 hours)

- [ ] Test loading/error/empty states
- [ ] Test filter combinations (grade, search, status)
- [ ] Test pagination behavior
- [ ] Test dialog interactions (add, edit, delete)

### Phase 3: Categories Page (1-2 hours)

- [ ] Test form validation
- [ ] Test sub-category management
- [ ] Test delete confirmation

### Phase 4: Evaluation Form (2-3 hours)

- [ ] Test category/sub-category cascade
- [ ] Test student selection with bulk toggle
- [ ] Test form submission states

### Phase 5: Weekly Reports (1 hour)

- [ ] Test date range selection
- [ ] Test report aggregation display

## Success Metrics

- [ ] 80+ component tests passing
- [ ] Component test time under 3 minutes
- [ ] No regression in E2E coverage
- [ ] 50+ integration test lines moved to component tests
- [ ] CI pipeline total time under 20 minutes

## Concrete Recommendations

### 1. Start with StudentsPage

It has the most complex state management and will establish patterns for other components.

### 2. Create Convex Mock Utilities Early

Spend time on `src/lib/test/convex-mock.ts` to make all subsequent tests easier.

### 3. Mirror Route Structure

Place component tests alongside the pages they test:

```
src/routes/admin/students/
├── +page.svelte        (source)
├── +page.spec.ts       (NEW - component tests)
└── +page.ts            (types)
```

### 4. Keep Cross-User Tests in E2E

Only E2E can test admin→teacher data sharing. Don't try to mock this.

### 5. Reduce Integration Test Overlap

Once component tests exist, simplify `e2e/integration.spec.ts` to only test:

- Real database operations
- Cross-user scenarios
- Full user journeys

## Testing Strategy Summary

| Layer         | Tool                  | When to Write             | Examples                                        |
| ------------- | --------------------- | ------------------------- | ----------------------------------------------- |
| **Component** | vitest-browser-svelte | First, for all UI logic   | Filter combinations, validation, loading states |
| **Server**    | convex-test           | When adding DB operations | Query logic, mutation side effects              |
| **E2E**       | Playwright            | Last, for user journeys   | Cross-user flows, full submissions              |

This strategy provides **faster feedback** (component tests) while maintaining **confidence** (E2E tests) and **reliability** (server tests).
