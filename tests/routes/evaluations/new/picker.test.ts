import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockStudents = [
	{
		_id: 'student-003',
		studentId: 'SE2024003',
		englishName: 'Alice Wonder',
		chineseName: '王五',
		classInfo: null,
		status: 'Enrolled' as const
	},
	{
		_id: 'student-002',
		studentId: 'SE2024002',
		englishName: 'Jane Smith',
		chineseName: '李四',
		classInfo: null,
		status: 'Enrolled' as const
	},
	{
		_id: 'student-001',
		studentId: 'SE2024001',
		englishName: 'John Doe',
		chineseName: '張三',
		classInfo: null,
		status: 'Enrolled' as const
	}
];

const mockCategories = [{ _id: 'cat-001' as const, name: 'Academic' }];

const { mockGoto, mockMutation } = vi.hoisted(() => ({
	mockGoto: vi.fn(),
	mockMutation: vi.fn().mockResolvedValue(undefined)
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
		mutation: mockMutation,
		query: vi.fn().mockResolvedValue({})
	}))
}));

import EvaluationFormPage from '$src/routes/evaluations/new/+page.svelte';

describe('Student Picker', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { useQuery } = await import('convex-svelte');
		// categories first, then students (call order in the page)
		vi.mocked(useQuery).mockReturnValueOnce({
			data: mockCategories,
			isLoading: false,
			isStale: false,
			error: undefined
		});
		vi.mocked(useQuery).mockReturnValueOnce({
			data: mockStudents,
			isLoading: false,
			isStale: false,
			error: undefined
		});
	});

	it('shows a selected count header that updates reactively', async () => {
		render(EvaluationFormPage);
		await expect.element(page.getByText('0 selected')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Select John Doe' }).click();
		await expect.element(page.getByText('1 selected')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Select Jane Smith' }).click();
		await expect.element(page.getByText('2 selected')).toBeInTheDocument();
	});

	it('shows a removable chip for each selected student', async () => {
		render(EvaluationFormPage);
		await page.getByRole('button', { name: 'Select John Doe' }).click();

		await expect.element(page.getByRole('button', { name: 'Remove John Doe' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Remove John Doe' }).click();
		await expect.element(page.getByText('0 selected')).toBeInTheDocument();
	});

	it('keeps selected students inline in alphabetical order with a checkmark and Deselect semantics', async () => {
		render(EvaluationFormPage);
		await page.getByRole('button', { name: 'Select John Doe' }).click();

		// Selected row stays in place (no clumping) and keeps toggling
		const row = page.getByRole('button', { name: 'Deselect John Doe' });
		await expect.element(row).toBeInTheDocument();
		await expect
			.element(page.getByTestId('evaluations-new.student-check-John Doe'))
			.toBeInTheDocument();

		await row.click();
		await expect.element(page.getByRole('button', { name: 'Select John Doe' })).toBeInTheDocument();
		await expect
			.element(page.getByTestId('evaluations-new.student-check-John Doe'))
			.not.toBeInTheDocument();
	});

	it('renders the roster in the alphabetical order of the backing query', async () => {
		render(EvaluationFormPage);
		// The students.list query sorts by englishName ascending; the picker
		// must preserve that order rather than clumping or re-sorting.
		const [list] = await page.getByRole('list', { name: 'Students' }).elements();
		const names = Array.from(list.querySelectorAll('[role="button"]'))
			.map((el) => el.getAttribute('aria-label'))
			.filter((label): label is string => label !== null);
		expect(names).toEqual(['Select Alice Wonder', 'Select Jane Smith', 'Select John Doe']);
	});

	it('adds all filtered results with one tap', async () => {
		render(EvaluationFormPage);
		await page.getByRole('button', { name: 'Add all 3 results' }).click();
		await expect.element(page.getByText('3 selected')).toBeInTheDocument();
	});

	it('smart-clears the search when every match is already selected', async () => {
		render(EvaluationFormPage);
		const search = page.getByPlaceholder('Filter by names (separated by commas) or ID...');
		await search.fill('John');
		await page.getByRole('button', { name: 'Select John Doe' }).click();

		await expect.element(search).toHaveValue('');
		// Unrelated student is visible again because the query was cleared
		await expect
			.element(page.getByRole('button', { name: 'Select Jane Smith' }))
			.toBeInTheDocument();
	});

	it('shows an empty state when nothing matches', async () => {
		render(EvaluationFormPage);
		await page
			.getByPlaceholder('Filter by names (separated by commas) or ID...')
			.fill('zzzznomatch');
		await expect.element(page.getByText('No students found')).toBeInTheDocument();
	});

	describe('Submit Behavior', () => {
		it('submits exactly the selected student IDs', async () => {
			render(EvaluationFormPage);
			await page.getByRole('button', { name: 'Select John Doe' }).click();
			await page.getByRole('button', { name: 'Select Jane Smith' }).click();

			await page.getByRole('button', { name: 'Select category' }).click();
			await page.getByRole('option', { name: 'Academic' }).click();

			await page.getByRole('button', { name: 'Submit evaluation' }).click();

			expect(mockGoto).toHaveBeenCalledWith('/evaluations');
			expect(mockMutation).toHaveBeenCalledOnce();
			const args = mockMutation.mock.calls[0][1] as { studentIds: string[] };
			expect(args.studentIds).toEqual(expect.arrayContaining(['student-001', 'student-002']));
			expect(args.studentIds).not.toContain('student-003');
		});
	});
});
