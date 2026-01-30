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
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await expect
			.element(page.getByRole('heading', { name: 'Student Management' }))
			.toBeInTheDocument();
	});

	it('shows back to admin button', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('renders search input', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		const searchInput = page.getByPlaceholder('Search by name or student ID...');
		await expect.element(searchInput).toBeInTheDocument();
	});

	it('renders filter dropdowns', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		const gradeFilter = page.getByRole('combobox', { name: 'Filter by grade' });
		await expect.element(gradeFilter).toBeInTheDocument();
		const statusFilter = page.getByRole('combobox', { name: 'Filter by status' });
		await expect.element(statusFilter).toBeInTheDocument();
	});

	it('shows add student button', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Add new student' })).toBeInTheDocument();
	});

	it('opens add student form dialog', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Add New Student' }))
			.toBeInTheDocument();
	});

	it('shows form fields in add dialog', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect.element(page.getByRole('textbox', { name: 'Student ID *' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'English Name *' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Chinese Name' })).toBeInTheDocument();
	});

	it('shows cancel and create buttons in form', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Create' })).toBeInTheDocument();
	});

	it('closes dialog when cancel is clicked', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await page.getByRole('button', { name: 'Add new student' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Add New Student' }))
			.toBeInTheDocument();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect
			.element(page.getByRole('heading', { name: 'Add New Student' }))
			.not.toBeInTheDocument();
	});

	it('shows import button', async () => {
		render(StudentsPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Import' })).toBeInTheDocument();
	});

	describe('Form Validation', () => {
		it('shows error when student ID is empty', async () => {
			render(StudentsPage, { props: { data: { testRole: 'admin' } } });
			await page.getByRole('button', { name: 'Add new student' }).click();
			await page.getByRole('textbox', { name: 'English Name *' }).fill('Test Student');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect.element(page.getByText('Student ID is required')).toBeInTheDocument();
		});

		it('shows error when English name is empty', async () => {
			render(StudentsPage, { props: { data: { testRole: 'admin' } } });
			await page.getByRole('button', { name: 'Add new student' }).click();
			await page.getByRole('textbox', { name: 'Student ID *' }).fill('S12345');
			await page.getByRole('button', { name: 'Create' }).click();
			await expect.element(page.getByText('English name is required')).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('shows empty state message when no students exist', async () => {
			render(StudentsPage, { props: { data: { testRole: 'admin' } } });
			await expect
				.element(page.getByText('No students yet. Add one or import from Excel!'))
				.toBeInTheDocument();
		});
	});
});
