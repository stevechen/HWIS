You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

## Testing

### Browser Unit Tests (vitest-browser-svelte)

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

**Key principles:**

1. Use semantic locators: `getByRole()`, `getByPlaceholder()`, `getByText()`
2. Always await assertions: `await expect.element(locator).toBeInTheDocument()`
3. Test static structure only (headers, buttons, forms) - not Convex-dynamic content
4. Mock Convex with `loading: false` to prevent hydration issues
5. Use `isLoading: true` for pages with auth redirects

**Running:**

```bash
bunx vitest run --config vite.config.ts
```

### Server Unit Tests (convex-test)

Unit tests use `convex-test` library for fast, deterministic testing of Convex functions without network calls.

```bash
# Run all unit tests
bunx vitest run

# Run only students tests
bunx vitest run src/convex/students.test.ts

# Run only categories tests
bunx vitest run src/convex/categories.test.ts
```

**Test files location:** `src/convex/{students,categories}.test.ts`

**Key patterns:**

- Each test gets a fresh mock database
- Use `t.mutation()` to call mutations
- Use `t.query()` to call queries
- Use `t.run()` to directly insert data into the mock database
- Foreign keys (like `teacherId`) need valid IDs created via `t.run()`

### E2E Tests (Playwright)

E2E tests run against a live Convex dev server.

```bash
# Run all e2e tests
bunx playwright test e2e

# Run specific test file
bunx playwright test e2e/students.spec.ts

# Run with single worker (more stable)
bunx playwright test e2e/students.spec.ts --workers=1
```

**Recommended patterns:**

1. Import data helpers from `e2e/convex-client.ts`:
   - `createStudent()`, `createCategory()`, `cleanupTestData()`, etc.

2. Always wait for hydration:

   ```typescript
   await page.waitForSelector('body.hydrated');
   ```

3. Use web-first assertions (auto-retry for Convex reactivity):
   ```typescript
   await expect(page.getByText('New Data')).toBeVisible();
   ```

**Avoid:**

- `page.waitForTimeout()` - use web-first assertions instead
- `page.reload()` - web-first assertions handle Convex updates automatically
- `window.e2e.*` - use imports from `convex-client.ts`

### Running All Tests

```bash
# Run browser unit tests (locator pattern, real Chromium)
bunx vitest run --config vite.config.ts

# Run server unit tests (convex-test)
bunx vitest run src/convex/*.test.ts

# Run e2e tests (requires dev server running)
bun run test:e2e

# Run unit tests then e2e tests
bun run test:all
```
