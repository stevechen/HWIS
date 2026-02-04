import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin', role: 'admin' } }
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

	it('shows import and add student buttons', async () => {
		render(StudentsPage);
		await expect
			.element(page.getByRole('button', { name: 'Import students from file' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add new student' })).toBeInTheDocument();
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
		const statusFilter = page.getByRole('combobox', { name: /filter by status/i });
		await expect.element(statusFilter).toBeInTheDocument();
	});

	it('shows empty state when no students exist', async () => {
		render(StudentsPage);
		await expect
			.element(page.getByText('No students yet. Add one or import from Excel!'))
			.toBeInTheDocument();
	});

	it('shows filtered empty state when filters match no results', async () => {
		render(StudentsPage);
		// Set a filter that won't match any students
		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await searchInput.fill('nonexistent');
		await expect.element(page.getByText('No students match your filters')).toBeInTheDocument();
	});
});
