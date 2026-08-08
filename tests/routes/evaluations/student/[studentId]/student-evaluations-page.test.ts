import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createMockEvaluationSet } from '../../../../fixtures/evaluations';

const mockAdminUser = {
	_id: 'admin-001',
	name: 'Admin User',
	email: 'admin@school.edu',
	role: 'admin',
	status: 'active'
};

const mockEvalData = createMockEvaluationSet();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockEvalData,
		isLoading: false,
		isStale: false,
		error: undefined
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

import StudentEvaluationsPage from '$src/routes/evaluations/student/[studentId]/+page.svelte';

describe('Student Evaluations Page', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		// The page makes multiple useQuery calls. The first is userQuery:
		// it must return an object with a `role` property (not an array)
		// so that isAdmin/isTeacher/isStudent resolve and the main content
		// area renders. Remaining calls (categories, student, evaluations)
		// fall through to the module-level default (mockEvalData).
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValueOnce({
			data: mockAdminUser,
			isLoading: false,
			isStale: false,
			error: undefined
		});
	});

	describe('Static Structure', () => {
		it('renders teacher filter input', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'test-student' } });
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
				.toBeInTheDocument();
		});

		it('renders evaluations timeline', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'test-student' } });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});

	describe('Filter Functionality', () => {
		it('teacher filter input accepts text', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'test-student' } });
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await teacherFilter.fill('Johnson');
			await expect.element(teacherFilter).toHaveValue('Johnson');
		});
	});

	describe('Accessibility', () => {
		it('filter input has accessible label', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'test-student' } });
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
				.toBeInTheDocument();
		});

		it('timeline region has aria-label', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'test-student' } });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});
});

describe('Student Evaluations Page — student branch', () => {
	const mockStudentUser = {
		_id: 'student-001',
		name: 'Student One',
		email: 's888001@std.hwhs.tc.edu.tw',
		role: 'student',
		status: 'active',
		studentId: '888001',
		enrollmentStatus: 'Enrolled',
		englishName: 'Student One',
		house: 'Wukong'
	};

	async function mockViewer(viewer: object) {
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValueOnce({
			data: viewer,
			isLoading: false,
			isStale: false,
			error: undefined
		});
	}

	it('renders the timeline for an enrolled student', async () => {
		await mockViewer(mockStudentUser);
		render(StudentEvaluationsPage, { data: { studentId: 'ignored' } });
		await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
	});

	it('hides the teacher filter for students', async () => {
		await mockViewer(mockStudentUser);
		render(StudentEvaluationsPage, { data: { studentId: 'ignored' } });
		await expect
			.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
			.not.toBeInTheDocument();
	});

	it('shows the access denied screen for a not-enrolled student', async () => {
		await mockViewer({ ...mockStudentUser, enrollmentStatus: 'Not Enrolled' });
		render(StudentEvaluationsPage, { data: { studentId: 'ignored' } });
		await expect.element(page.getByText('Access Denied')).toBeInTheDocument();
	});
});
