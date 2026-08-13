import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Id } from '$convex/_generated/dataModel';

const mockStudents = [
	{
		_id: 'student-001' as Id<'students'>,
		studentId: 'SE2024001',
		englishName: 'John Doe',
		chineseName: '張三',
		classInfo: null,
		status: 'Enrolled' as const
	},
	{
		_id: 'student-002' as Id<'students'>,
		studentId: 'SE2024002',
		englishName: 'Jane Smith',
		chineseName: '李四',
		classInfo: null,
		status: 'Enrolled' as const
	}
];

const mockCategories = [{ _id: 'cat-001' as const, name: 'Academic' }];

const { mockGoto } = vi.hoisted(() => ({
	mockGoto: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: mockGoto
}));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		isLoading: false,
		isStale: false,
		error: undefined
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

import EvaluationFormPage from '$src/routes/evaluations/new/+page.svelte';

describe('Evaluation Form', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { useQuery } = await import('convex-svelte');
		// First query: categories
		vi.mocked(useQuery).mockReturnValueOnce({
			data: mockCategories,
			isLoading: false,
			isStale: false,
			error: undefined
		});
		// Second query: students
		vi.mocked(useQuery).mockReturnValueOnce({
			data: mockStudents,
			isLoading: false,
			isStale: false,
			error: undefined
		});
	});

	it('shows search input for filtering students', async () => {
		render(EvaluationFormPage);
		await expect
			.element(page.getByPlaceholder('Filter by names (separated by commas) or ID...'))
			.toBeInTheDocument();
	});

	it('renders submit button', async () => {
		render(EvaluationFormPage);
		await expect
			.element(page.getByRole('button', { name: 'Submit Evaluation' }))
			.toBeInTheDocument();
	});

	it('shows student count indicator', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByText('0 selected')).toBeInTheDocument();
	});

	it('shows lock notice at the top of the Evaluation Details card, before the Submit button', async () => {
		render(EvaluationFormPage);
		const lockNotice = page.getByText(/locks for edits on/i);
		const submitButton = page.getByRole('button', { name: 'Submit evaluation' });
		await expect.element(lockNotice).toBeInTheDocument();

		const lockEl = await lockNotice.element();
		const submitEl = await submitButton.element();
		// Lock notice should precede the Submit button in DOM order
		expect(
			lockEl.compareDocumentPosition(submitEl) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	describe('Submit Behavior', () => {
		it('calls goto on successful submit', async () => {
			render(EvaluationFormPage);

			// Select a student
			const student = page.getByRole('button', { name: 'Select John Doe' });
			await student.click();

			// Select a category
			await page.getByRole('button', { name: 'Select category' }).click();
			await page.getByRole('option', { name: 'Academic' }).click();

			// Submit the evaluation
			await page.getByRole('button', { name: 'Submit evaluation' }).click();

			expect(mockGoto).toHaveBeenCalledWith('/evaluations');
		});

		it('shows validation error when no student is selected', async () => {
			render(EvaluationFormPage);

			// Submit without selecting any student
			await page.getByRole('button', { name: 'Submit evaluation' }).click();

			await expect
				.element(page.getByText('Please select at least one student'))
				.toBeInTheDocument();
			expect(mockGoto).not.toHaveBeenCalled();
		});

		it('shows validation error when no category is selected', async () => {
			render(EvaluationFormPage);

			// Select a student but no category
			await page.getByRole('button', { name: 'Select John Doe' }).click();

			// Submit
			await page.getByRole('button', { name: 'Submit evaluation' }).click();

			await expect.element(page.getByText('Please select a category')).toBeInTheDocument();
			expect(mockGoto).not.toHaveBeenCalled();
		});
	});
});
