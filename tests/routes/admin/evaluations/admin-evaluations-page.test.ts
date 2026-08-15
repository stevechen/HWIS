import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

// Mock convex-svelte with proper data structure for both queries
const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn();

// The admin evaluations page uses two queries:
// 1. nonPaginatedQuery - returns an array directly
// 2. paginatedQuery - returns { page: [...], isDone: boolean, continueCursor: string | null }
// We need to mock both properly by making data both an array and an object with page property

// Create a mock data structure that works for both query types
const createMockQueryData = () => {
	const data = [] as unknown[];
	(data as unknown as { page: unknown[]; isDone: boolean; continueCursor: null }).page = [];
	(data as unknown as { page: unknown[]; isDone: boolean; continueCursor: null }).isDone = true;
	(data as unknown as { page: unknown[]; isDone: boolean; continueCursor: null }).continueCursor =
		null;
	return data as unknown[] & { page: unknown[]; isDone: boolean; continueCursor: null };
};

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: createMockQueryData(),
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: mockQuery
	}))
}));

// Import after mocks
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';
import { api } from '$convex/_generated/api';
import AdminEvaluationsPage from '$src/routes/admin/evaluations/+page.svelte';

describe('Admin Evaluations Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Query Gating', () => {
		function invokeQueryArgsFor(queryFn: unknown): unknown {
			const calls = vi.mocked(useQuery).mock.calls;
			const address = getFunctionName(queryFn as never);
			const call = calls.find(([apiFn]) => getFunctionName(apiFn as never) === address);
			expect(call, `expected useQuery to be called for ${address}`).toBeDefined();
			const argsClosure = call![1] as () => unknown;
			return argsClosure();
		}

		it('skips the non-paginated query when no filters are active', async () => {
			render(AdminEvaluationsPage);

			const args = invokeQueryArgsFor(api.evaluations.listAllEvaluations);
			expect(args).toBe('skip');
		});

		it('skips the paginated query when filters are active', async () => {
			render(AdminEvaluationsPage);
			const studentFilter = page.getByRole('textbox', { name: 'Filter by student name' });
			await studentFilter.fill('Alice');

			const args = invokeQueryArgsFor(api.evaluations.listAllEvaluationsPaginated);
			expect(args).toBe('skip');
		});

		it('uses real args for the paginated query when no filters are active', async () => {
			render(AdminEvaluationsPage);

			const args = invokeQueryArgsFor(api.evaluations.listAllEvaluationsPaginated);
			expect(args).not.toBe('skip');
		});

		it('uses real args for the non-paginated query when filters are active', async () => {
			render(AdminEvaluationsPage);
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await teacherFilter.fill('Johnson');

			const args = invokeQueryArgsFor(api.evaluations.listAllEvaluations);
			expect(args).not.toBe('skip');
		});
	});

	describe('Static Structure', () => {
		it('renders student filter input with correct aria-label', async () => {
			render(AdminEvaluationsPage);
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by student name' }))
				.toBeInTheDocument();
		});

		it('renders teacher filter input with correct aria-label', async () => {
			render(AdminEvaluationsPage);
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
				.toBeInTheDocument();
		});

		it('renders sort toggle button', async () => {
			render(AdminEvaluationsPage);
			await expect.element(page.getByRole('button', { name: 'Newest First' })).toBeInTheDocument();
		});

		it('renders show unenrolled toggle', async () => {
			render(AdminEvaluationsPage);
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.toBeInTheDocument();
		});

		it('renders show details toggle', async () => {
			render(AdminEvaluationsPage);
			await expect.element(page.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
		});
	});

	describe('Filter Functionality', () => {
		it('student filter input accepts text', async () => {
			render(AdminEvaluationsPage);
			const studentFilter = page.getByRole('textbox', { name: 'Filter by student name' });
			await studentFilter.fill('Alice');
			await expect.element(studentFilter).toHaveValue('Alice');
		});

		it('teacher filter input accepts text', async () => {
			render(AdminEvaluationsPage);
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await teacherFilter.fill('Johnson');
			await expect.element(teacherFilter).toHaveValue('Johnson');
		});
	});

	describe('Toggle Controls', () => {
		it('sort toggle changes aria-label', async () => {
			render(AdminEvaluationsPage);
			const sortButton = page.getByRole('button', { name: 'Newest First' });
			await sortButton.click();
			await expect.element(page.getByRole('button', { name: 'Oldest First' })).toBeInTheDocument();
		});

		it('show unenrolled toggle changes aria-label', async () => {
			render(AdminEvaluationsPage);
			const toggleButton = page.getByRole('button', { name: 'Show unenrolled students' });
			await toggleButton.click();
			await expect
				.element(page.getByRole('button', { name: 'Hide unenrolled students' }))
				.toBeInTheDocument();
		});

		it('show details toggle changes aria-label', async () => {
			render(AdminEvaluationsPage);
			const detailsButton = page.getByRole('button', { name: 'Show Details' });
			await detailsButton.click();
			await expect.element(page.getByRole('button', { name: 'Hide Details' })).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('shows empty state when no evaluations', async () => {
			render(AdminEvaluationsPage);
			// With empty data, should show empty state
			await expect.element(page.getByText('No evaluations found')).toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('renders error state when the paginated query fails', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery)
				.mockReturnValueOnce({
					data: createMockQueryData(),
					isLoading: false,
					error: null
				} as unknown as ReturnType<typeof useQuery>)
				.mockReturnValueOnce({
					data: null,
					isLoading: false,
					error: new Error('Failed to load')
				} as unknown as ReturnType<typeof useQuery>);

			render(AdminEvaluationsPage);
			await expect.element(page.getByText(/Error loading evaluations/)).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('all filter inputs have accessible labels', async () => {
			render(AdminEvaluationsPage);
			const studentFilter = page.getByRole('textbox', { name: 'Filter by student name' });
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await expect.element(studentFilter).toBeInTheDocument();
			await expect.element(teacherFilter).toBeInTheDocument();
		});
	});
});
