import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createMockEvaluationSet } from '../../../../fixtures/evaluations';

// Mock convex-svelte
const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: createMockEvaluationSet(),
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: mockQuery
	}))
}));

// Import after mocks
import StudentEvaluationsPage from '$src/routes/evaluations/student/[studentId]/+page.svelte';

describe('Student Evaluations Page', () => {
	beforeEach(() => {
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
			render(StudentEvaluationsPage, { data: { demo: 'teacher', studentId: 'test-student' } });
			// Demo evaluations should be visible
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});

	describe('Static Structure', () => {
		it('renders teacher filter input', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'SE2024001' } });
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
				.toBeInTheDocument();
		});

		it('renders evaluations timeline', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'SE2024001' } });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});

	describe('Filter Functionality', () => {
		it('teacher filter input accepts text', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'SE2024001' } });
			const teacherFilter = page.getByRole('textbox', { name: 'Filter by teacher' });
			await teacherFilter.fill('Johnson');
			await expect.element(teacherFilter).toHaveValue('Johnson');
		});
	});

	describe('Accessibility', () => {
		it('filter input has accessible label', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'SE2024001' } });
			await expect
				.element(page.getByRole('textbox', { name: 'Filter by teacher' }))
				.toBeInTheDocument();
		});

		it('timeline region has aria-label', async () => {
			render(StudentEvaluationsPage, { data: { studentId: 'SE2024001' } });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});
	});
});
