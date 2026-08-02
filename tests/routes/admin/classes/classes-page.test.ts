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

		it('only grade 7 is visible by default', async () => {
			render(ClassesPage);

			// Grade 7 checkbox should be checked by default
			await expect.element(page.getByRole('checkbox', { name: '7' })).toBeChecked();

			// Other grades should be unchecked
			for (const grade of [8, 9, 10, 11, 12]) {
				await expect.element(page.getByRole('checkbox', { name: String(grade) })).not.toBeChecked();
			}

			// Only grade 7 header should be visible
			await expect.element(page.getByText('G7')).toBeInTheDocument();

			// Other grade headers should not be visible
			for (const grade of [8, 9, 10, 11, 12]) {
				await expect.element(page.getByText(`G${grade}`)).not.toBeInTheDocument();
			}
		});

		it('can show and hide grades using checkboxes', async () => {
			render(ClassesPage);

			const grade7Checkbox = page.getByRole('checkbox', { name: '7' });

			// Initially G7 should be visible
			await expect.element(page.getByText('G7')).toBeInTheDocument();

			// Uncheck grade 7
			await grade7Checkbox.click();

			// Grade 7 classes should be hidden
			await expect.element(page.getByText('G7')).not.toBeInTheDocument();

			// Check grade 7 again
			await grade7Checkbox.click();

			// Grade 7 should be visible again
			await expect.element(page.getByText('G7')).toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('renders error message when classes query fails', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValueOnce({
				data: null,
				isLoading: false,
				error: new Error('Failed to load')
			} as unknown as ReturnType<typeof useQuery>);

			render(ClassesPage);
			await expect.element(page.getByText('Error loading classes')).toBeInTheDocument();
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
		it('does not open dialog when student is clicked outside select mode', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: mockClassWithStudents,
				isLoading: false,
				error: null
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(ClassesPage);

			// Clicking a student outside select mode should not open a dialog
			await page.getByRole('button', { name: /Move Alice/ }).click();

			// No dialog should appear
			await expect.element(page.getByText('Move Alice')).not.toBeInTheDocument();
			await expect.element(page.getByText(/Currently in/)).not.toBeInTheDocument();
		});
	});

	describe('Multi-Select', () => {
		it('renders Select button in grade 7 header', async () => {
			render(ClassesPage);

			await expect
				.element(page.getByRole('button', { name: 'Select grade 7' }))
				.toBeInTheDocument();
		});

		it('enters selection mode when grade Select is clicked', async () => {
			render(ClassesPage);

			await page.getByRole('button', { name: 'Select grade 7' }).click();
			await expect
				.element(page.getByRole('button', { name: 'Done selecting in grade 7' }))
				.toBeInTheDocument();
		});

		it('exits selection mode when Done is clicked', async () => {
			render(ClassesPage);

			await page.getByRole('button', { name: 'Select grade 7' }).click();
			await page.getByRole('button', { name: 'Done selecting in grade 7' }).click();
			await expect
				.element(page.getByRole('button', { name: 'Select grade 7' }))
				.toBeInTheDocument();
		});

		it('selects and deselects a student in selection mode', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: mockClassWithStudents,
				isLoading: false,
				error: null
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(ClassesPage);

			await page.getByRole('button', { name: 'Select grade 7' }).click();

			// Click student to select
			await page.getByRole('button', { name: /Select Alice/ }).click();

			// Bulk action bar should appear with action buttons
			await expect.element(page.getByRole('toolbar')).toBeInTheDocument();
			await expect.element(page.getByText('Move 1 student to:')).toBeInTheDocument();

			// Deselect
			await page.getByRole('button', { name: /Select Alice/ }).click();
			await expect.element(page.getByText('Move 1 student to:')).not.toBeInTheDocument();
		});

		it('shows class action buttons for the selected grade excluding source class', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: mockClassWithStudents,
				isLoading: false,
				error: null
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(ClassesPage);

			await page.getByRole('button', { name: 'Select grade 7' }).click();
			await page.getByRole('button', { name: /Select Alice/ }).click();

			// Should show "Move to:" label - wait for bulk action bar to appear
			await expect.element(page.getByRole('toolbar')).toBeInTheDocument();

			// Source class (7-1) should NOT appear as a target
			await expect
				.element(page.getByRole('button', { name: '7-1', exact: true }))
				.not.toBeInTheDocument();

			// Other classes in the grade should appear
			await expect
				.element(page.getByRole('button', { name: '7-2', exact: true }))
				.toBeInTheDocument();
		});
	});
});
