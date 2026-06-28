import { page } from 'vitest/browser';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createMockEvaluationSet } from '../../../../fixtures/evaluations';

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
		data: { user: { name: 'Test Teacher', role: 'teacher' } }
	}))
}));

import StudentEvaluationsPage from '$src/routes/evaluations/student/[studentId]/+page.svelte';

describe('Student Evaluations Page', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Demo Mode', () => {
		it('shows demo mode badge when in demo mode', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'teacher', studentId: 'test-student' } });
			await expect.element(page.getByText('DEMO MODE (TEACHER)')).toBeInTheDocument();
		});

		it('shows admin demo badge for admin role', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'admin', studentId: 'test-student' } });
			await expect.element(page.getByText('DEMO MODE (ADMIN)')).toBeInTheDocument();
		});

		it('shows demo evaluations in demo mode', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'admin', studentId: 'test-student' } });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});

	describe('Static Structure', () => {
		it('renders teacher filter input', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'admin', studentId: 'test-student' } });
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
				.toBeInTheDocument();
		});

		it('renders evaluations timeline', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'admin', studentId: 'test-student' } });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});

	describe('Filter Functionality', () => {
		it('teacher filter input accepts text', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'admin', studentId: 'test-student' } });
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await teacherFilter.fill('Johnson');
			await expect.element(teacherFilter).toHaveValue('Johnson');
		});
	});

	describe('Accessibility', () => {
		it('filter input has accessible label', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'admin', studentId: 'test-student' } });
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
				.toBeInTheDocument();
		});

		it('timeline region has aria-label', async () => {
			render(StudentEvaluationsPage, { data: { demo: 'admin', studentId: 'test-student' } });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});
});
