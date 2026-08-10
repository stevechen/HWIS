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
			status: 'Enrolled',
			note: ''
		},
		{
			_id: 'student-002',
			studentId: 'S67890',
			englishName: 'Jane Smith',
			chineseName: '李四',
			grade: 11,
			status: 'Enrolled',
			note: 'Has evaluations'
		}
	];

	let queryCallCount = 0;
	return {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
		useQuery: vi.fn((_api: any) => {
			queryCallCount += 1;
			// The students page calls the paginated student query first, followed by classes.
			if (queryCallCount % 2 === 1) {
				return {
					data: {
						page: mockStudents,
						isDone: true,
						continueCursor: 'done'
					},
					isLoading: false,
					error: null
				};
			}
			return { data: [], isLoading: false, error: null };
		}),
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
	beforeEach(() => {
		vi.clearAllMocks();
		// Each render invokes the student and classes queries in this order.
		// The mock implementation is reset by the test module between files.
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
