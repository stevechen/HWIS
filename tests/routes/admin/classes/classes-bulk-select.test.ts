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

const mockClassesWithMultipleStudents = [
	{
		_id: 'c1',
		_creationTime: 0,
		grade: 7,
		class: '1',
		homeroomTeacherId: undefined,
		homeroomTeacherName: null,
		studentCount: 3,
		students: [
			{ _id: 's1', name: 'Alice', studentId: 'S001', status: 'Enrolled' },
			{ _id: 's2', name: 'Bob', studentId: 'S002', status: 'Enrolled' },
			{ _id: 's3', name: 'Charlie', studentId: 'S003', status: 'Enrolled' }
		]
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
	},
	{
		_id: 'c3',
		_creationTime: 0,
		grade: 7,
		class: '3',
		homeroomTeacherId: undefined,
		homeroomTeacherName: null,
		studentCount: 1,
		students: [{ _id: 's4', name: 'Diana', studentId: 'S004', status: 'Enrolled' }]
	}
];

const mockTeachers = [{ _id: 't1', name: 'Teacher One', role: 'teacher', status: 'active' }];

describe('Classes Page - Bulk Select and Move', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('enters selection mode when clicking Select button', async () => {
		const { useConvexClient } = await import('convex-svelte');
		vi.mocked(useConvexClient).mockReturnValue({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		});

		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery)
			.mockReturnValueOnce({
				data: mockClassesWithMultipleStudents,
				isLoading: false,
				error: null
			})
			.mockReturnValueOnce({
				data: mockTeachers,
				isLoading: false,
				error: null
			});

		render(ClassesPage);

		await page.getByRole('button', { name: 'Select grade 7' }).click();

		// Should show Done button
		await expect
			.element(page.getByRole('button', { name: 'Done selecting in grade 7' }))
			.toBeInTheDocument();

		// Student rows should show checkboxes
		await expect.element(page.getByRole('button', { name: /Select Alice/ })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /Select Bob/ })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /Select Charlie/ })).toBeInTheDocument();
	});

	it('selects and deselects students in selection mode', async () => {
		const { useConvexClient } = await import('convex-svelte');
		vi.mocked(useConvexClient).mockReturnValue({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		});

		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery)
			.mockReturnValueOnce({
				data: mockClassesWithMultipleStudents,
				isLoading: false,
				error: null
			})
			.mockReturnValueOnce({
				data: mockTeachers,
				isLoading: false,
				error: null
			});

		render(ClassesPage);

		await page.getByRole('button', { name: 'Select grade 7' }).click();

		// Select Alice
		await page.getByRole('button', { name: /Select Alice/ }).click();

		// Bulk action bar should appear
		await expect.element(page.getByRole('toolbar')).toBeInTheDocument();
		await expect.element(page.getByText('Move 1 student to:')).toBeInTheDocument();

		// Deselect Alice
		await page.getByRole('button', { name: /Select Alice/ }).click();
		await expect.element(page.getByText('Move 1 student to:')).not.toBeInTheDocument();
	});

	it('shows target class buttons excluding source class in bulk mode', async () => {
		const { useConvexClient } = await import('convex-svelte');
		vi.mocked(useConvexClient).mockReturnValue({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		});

		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery)
			.mockReturnValueOnce({
				data: mockClassesWithMultipleStudents,
				isLoading: false,
				error: null
			})
			.mockReturnValueOnce({
				data: mockTeachers,
				isLoading: false,
				error: null
			});

		render(ClassesPage);

		await page.getByRole('button', { name: 'Select grade 7' }).click();
		await page.getByRole('button', { name: /Select Alice/ }).click();

		// Should show "Move X students to:" label
		await expect.element(page.getByText('Move 1 student to:')).toBeInTheDocument();

		// Source class (7-1) should NOT appear
		await expect
			.element(page.getByRole('button', { name: '7-1', exact: true }))
			.not.toBeInTheDocument();

		// Other classes in same grade should appear
		await expect
			.element(page.getByRole('button', { name: '7-2', exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: '7-3', exact: true }))
			.toBeInTheDocument();
	});

	it('excludes IB class for grades below 11', async () => {
		const { useConvexClient } = await import('convex-svelte');
		vi.mocked(useConvexClient).mockReturnValue({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		});

		const classesWithIB = [
			...mockClassesWithMultipleStudents,
			{
				_id: 'c4',
				_creationTime: 0,
				grade: 7,
				class: 'IB',
				homeroomTeacherId: undefined,
				homeroomTeacherName: null,
				studentCount: 0,
				students: []
			}
		];

		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery)
			.mockReturnValueOnce({
				data: classesWithIB,
				isLoading: false,
				error: null
			})
			.mockReturnValueOnce({
				data: mockTeachers,
				isLoading: false,
				error: null
			});

		render(ClassesPage);

		await page.getByRole('button', { name: 'Select grade 7' }).click();
		await page.getByRole('button', { name: /Select Alice/ }).click();

		// IB should NOT appear for grade 7
		await expect
			.element(page.getByRole('button', { name: '7-IB', exact: true }))
			.not.toBeInTheDocument();
	});

	it('includes IB class for grades 11-12', async () => {
		const { useConvexClient } = await import('convex-svelte');
		vi.mocked(useConvexClient).mockReturnValue({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		});

		const classesGrade11 = [
			{
				_id: 'c1',
				_creationTime: 0,
				grade: 11,
				class: '1',
				homeroomTeacherId: undefined,
				homeroomTeacherName: null,
				studentCount: 1,
				students: [{ _id: 's1', name: 'Alice', studentId: 'S001', status: 'Enrolled' }]
			},
			{
				_id: 'c2',
				_creationTime: 0,
				grade: 11,
				class: 'IB',
				homeroomTeacherId: undefined,
				homeroomTeacherName: null,
				studentCount: 0,
				students: []
			}
		];

		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery)
			.mockReturnValueOnce({
				data: classesGrade11,
				isLoading: false,
				error: null
			})
			.mockReturnValueOnce({
				data: mockTeachers,
				isLoading: false,
				error: null
			});

		render(ClassesPage);

		// Need to show grade 11 first
		await page.getByRole('checkbox', { name: '11' }).click();
		await page.getByRole('button', { name: 'Select grade 11' }).click();
		await page.getByRole('button', { name: /Select Alice/ }).click();

		// IB SHOULD appear for grade 11
		await expect
			.element(page.getByRole('button', { name: '11-IB', exact: true }))
			.toBeInTheDocument();
	});

	it('exits selection mode when Done is clicked', async () => {
		const { useConvexClient } = await import('convex-svelte');
		vi.mocked(useConvexClient).mockReturnValue({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		});

		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery)
			.mockReturnValueOnce({
				data: mockClassesWithMultipleStudents,
				isLoading: false,
				error: null
			})
			.mockReturnValueOnce({
				data: mockTeachers,
				isLoading: false,
				error: null
			});

		render(ClassesPage);

		await page.getByRole('button', { name: 'Select grade 7' }).click();
		await page.getByRole('button', { name: 'Done selecting in grade 7' }).click();

		await expect.element(page.getByRole('button', { name: 'Select grade 7' })).toBeInTheDocument();
		await expect.element(page.getByRole('toolbar')).not.toBeInTheDocument();
	});
});
