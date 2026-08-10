import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockStudent = {
	_id: 'student-001',
	studentId: 'S12345',
	englishName: 'John Doe',
	chineseName: '張三',
	grade: 10,
	status: 'Enrolled',
	note: ''
};

vi.mock('convex-svelte', () => {
	const mockStudents = [
		{
			_id: 'student-001',
			studentId: 'S12345',
			englishName: 'John Doe',
			chineseName: '張三',
			grade: 10,
			classInfo: { grade: 10, class: '1' },
			status: 'Enrolled',
			note: ''
		},
		{
			_id: 'student-002',
			studentId: 'S67890',
			englishName: 'Jane Smith',
			chineseName: '李四',
			grade: 11,
			classInfo: { grade: 11, class: '1' },
			status: 'Enrolled',
			note: 'Has evaluations'
		}
	];

	const mockQueryData = Object.assign([...mockStudents], {
		page: mockStudents,
		isDone: true,
		continueCursor: 'done'
	});
	return {
		// Return data that supports both the paginated students query and the classes query.
		// This avoids coupling the fixture to the order or number of reactive query calls.
		useQuery: vi.fn(() => ({ data: mockQueryData, isLoading: false, error: null })),
		useConvexClient: vi.fn(() => ({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		}))
	};
});

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin' } }
	}))
}));

import StudentsPage from '$src/routes/admin/students/+page.svelte';

describe('Students Page - Edit and Delete Dialogs', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		// The student table's Actions column sits at the far right, which the default
		// mobile viewport (414px) clips off screen (the table container uses
		// overflow-x: clip, so it cannot be scrolled into view for clicking). Use a
		// desktop viewport so the row action buttons are clickable.
		await page.viewport(1280, 720);
	});

	describe('Edit Dialog', () => {
		it('opens edit student dialog', async () => {
			render(StudentsPage);
			await expect.element(page.getByText('John Doe')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Edit S12345' }).click();
			await expect.element(page.getByRole('heading', { name: 'Edit Student' })).toBeInTheDocument();
		});

		it('pre-fills form with student data', async () => {
			render(StudentsPage);
			await expect.element(page.getByText('John Doe')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Edit S12345' }).click();
			await expect
				.element(page.getByRole('textbox', { name: 'Student ID' }))
				.toHaveValue(mockStudent.studentId);
			await expect
				.element(page.getByRole('textbox', { name: 'English Name' }))
				.toHaveValue(mockStudent.englishName);
			await expect
				.element(page.getByRole('textbox', { name: 'Chinese Name' }))
				.toHaveValue(mockStudent.chineseName);
		});
	});

	describe('Delete Dialog', () => {
		it('opens delete confirmation dialog', async () => {
			render(StudentsPage);
			await expect.element(page.getByText('John Doe')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Delete S12345' }).click();
			await expect
				.element(page.getByRole('heading', { name: 'Delete Student' }))
				.toBeInTheDocument();
		});

		it('shows delete button for student without evaluations', async () => {
			render(StudentsPage);
			await expect.element(page.getByText('John Doe')).toBeInTheDocument();
			await page.getByRole('button', { name: 'Delete S12345' }).click();
			await expect
				.element(page.getByRole('button', { name: 'Delete', exact: true }))
				.toBeInTheDocument();
		});
	});
});
