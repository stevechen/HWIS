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

import ClassesPage from '$src/routes/admin/classes/+page.svelte';

const mockClassWithStudents = [
	{
		_id: 'c1',
		_creationTime: 0,
		grade: 7,
		class: '1',
		homeroomTeacherId: undefined,
		homeroomTeacherName: null,
		studentCount: 1,
		students: [{ _id: 's1', name: 'Alice', studentId: 'S001', status: 'Enrolled' }]
	},
	{
		_id: 'c2',
		_creationTime: 0,
		grade: 7,
		class: '2',
		homeroomTeacherId: undefined,
		homeroomTeacherName: null,
		studentCount: 0,
		students: []
	}
];

describe('Classes Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Structure', () => {
		it('renders grade filter checkboxes', async () => {
			render(ClassesPage);

			for (const grade of [7, 8, 9, 10, 11, 12]) {
				await expect
					.element(page.getByRole('checkbox', { name: String(grade) }))
					.toBeInTheDocument();
			}
		});

		it('renders add class buttons for each grade', async () => {
			render(ClassesPage);

			// Check that add class buttons exist
			const addButtons = page.getByRole('button', { name: /add class/i });
			await expect.element(addButtons.first()).toBeInTheDocument();
		});

		it('renders IB toggle buttons for grade 11', async () => {
			render(ClassesPage);

			// Make grade 11 visible by clicking checkbox
			await page.getByRole('checkbox', { name: '11' }).click();

			// IB toggle button should exist for grades 11-12 (IB-DP program)
			await expect.element(page.getByAltText('IB')).toBeInTheDocument();
		});
	});

	describe('Accordion', () => {
		it('collapses and expands student list when class header is clicked', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: mockClassWithStudents,
				isLoading: false,
				error: null
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(ClassesPage);

			const student = page.getByText('Alice');
			await expect.element(student).toBeInTheDocument();

			const region = page.getByRole('region', { name: 'Class 7-1' });
			await region.getByRole('button').first().click();
			await expect.element(student).not.toBeInTheDocument();

			await region.getByRole('button').first().click();
			await expect.element(student).toBeInTheDocument();
		});
	});

	describe('Move Dialog', () => {
		it('opens dialog when student is clicked', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: mockClassWithStudents,
				isLoading: false,
				error: null
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(ClassesPage);

			await page.getByRole('button', { name: /Move Alice/ }).click();

			await expect.element(page.getByText('Move Alice')).toBeInTheDocument();
			await expect.element(page.getByText(/Currently in/)).toBeInTheDocument();
		});
	});
});
