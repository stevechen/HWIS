import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { selectOption } from '../../../lib/select';
import { useQuery } from 'convex-svelte';

const mockMutation = vi.fn().mockResolvedValue(undefined);

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true }))
}));

import { api } from '$convex/_generated/api';
import ClassesPage from '$src/routes/esl/admin/classes/+page.svelte';

const G7_COHORT = {
	_id: 'cohort_g7',
	year: '2025-2026',
	grade: 7,
	level: 'Basic',
	classNumber: '1',
	code: 'G7-Basic-1',
	status: 'active' as const,
	createdAt: 0,
	label: '2025-2026 G7 Basic 1',
	classes: [
		{
			_id: 'class_clil',
			cohortId: 'cohort_g7',
			type: 'CLIL' as const,
			name: 'G7 Basic 1 CLIL',
			status: 'active' as const,
			createdAt: 0
		},
		{
			_id: 'class_comm',
			cohortId: 'cohort_g7',
			type: 'Comm' as const,
			name: 'G7 Basic 1 Comm',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

const G9_COHORT = {
	_id: 'cohort_g9',
	year: '2026-2027',
	grade: 9,
	level: 'Intermediate',
	classNumber: '1',
	code: 'G9-Intermediate-1',
	status: 'archived' as const,
	createdAt: 0,
	label: '2026-2027 G9 Intermediate 1',
	classes: [
		{
			_id: 'class_g9',
			cohortId: 'cohort_g9',
			type: 'G9' as const,
			name: 'G9 Intermediate 1',
			teacherId: 'user_t1',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

/** Grade 10 is levelled A/B: one Chinese class at one level is one cohort, one class. */
const G10_COHORT_A = {
	_id: 'cohort_g10a',
	year: '2025-2026',
	grade: 10,
	level: 'A',
	classNumber: '01',
	code: 'G10-01A',
	status: 'active' as const,
	createdAt: 0,
	label: '2025-2026 G10 H101A',
	classes: [
		{
			_id: 'class_h10a',
			cohortId: 'cohort_g10a',
			type: 'H10A' as const,
			name: 'H101A',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

const G10_COHORT_B = {
	...G10_COHORT_A,
	_id: 'cohort_g10b',
	level: 'B',
	code: 'G10-01B',
	label: '2025-2026 G10 H101B',
	classes: [
		{
			_id: 'class_h10b',
			cohortId: 'cohort_g10b',
			type: 'H10B' as const,
			name: 'H101B',
			status: 'active' as const,
			createdAt: 0
		}
	]
};

const ASSIGNABLE = [
	{ _id: 'user_t1', name: 'Alice Teacher' },
	{ _id: 'user_t2', name: 'Bob Teacher' }
];

/** Routes each `useQuery` call to canned data by its Convex function name. */
function mockQueries(data: Record<string, unknown>) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const value = data[getFunctionName(reference as never)];
		return { data: Array.isArray(value) ? value : [], isLoading: false, error: null };
	}) as never);
}

function withCohorts() {
	mockQueries({
		'esl/cohorts:list': [G7_COHORT, G9_COHORT, G10_COHORT_A, G10_COHORT_B],
		'esl/staff:listAssignable': ASSIGNABLE
	});
}

/** Only the levelled cohorts, for tests that count or filter on them. */
function withLevelledCohortsOnly() {
	mockQueries({
		'esl/cohorts:list': [G7_COHORT, G9_COHORT],
		'esl/staff:listAssignable': ASSIGNABLE
	});
}

describe('ESL admin cohorts page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
	});

	describe('cohort creation form', () => {
		it('renders every grade the programme runs', async () => {
			withCohorts();
			render(ClassesPage);

			await expect.element(page.getByTestId('esl-admin-classes.form.year')).toBeInTheDocument();
			// Scoped to one select: the filters repeat the same grade options.
			const gradeSelect = page.getByTestId('esl-admin-classes.form.grade');
			await expect.element(gradeSelect).toBeInTheDocument();
			for (const value of ['G7', 'G8', 'G9', 'G10']) {
				await expect.element(gradeSelect.getByRole('option', { name: value })).toBeInTheDocument();
			}
		});

		it('renders every ability level', async () => {
			withCohorts();
			render(ClassesPage);

			const levelSelect = page.getByTestId('esl-admin-classes.form.level');
			for (const level of ['Pre-Elementary', 'Elementary', 'Basic', 'Intermediate', 'Advanced']) {
				await expect
					.element(levelSelect.getByRole('option', { name: level, exact: true }))
					.toBeInTheDocument();
			}
		});

		it('previews a paired CLIL and Comm class for a grade 7 cohort', async () => {
			withCohorts();
			render(ClassesPage);

			const preview = page.getByTestId('esl-admin-classes.form.preview');
			await expect.element(preview).toHaveTextContent('G7 Basic 1 CLIL + G7 Basic 1 Comm');
			await expect.element(preview).toHaveTextContent('sharing one roster');
		});

		it('previews a single class with its own roster for a grade 9 cohort', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '9');

			await expect
				.element(page.getByTestId('esl-admin-classes.form.preview'))
				.toHaveTextContent('with its own roster');
		});

		it('submits the composed cohort key', async () => {
			withCohorts();
			render(ClassesPage);

			await page.getByTestId('esl-admin-classes.form.year').fill('2027-2028');
			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '8');
			await selectOption(page.getByTestId('esl-admin-classes.form.level'), 'Advanced');
			await selectOption(page.getByTestId('esl-admin-classes.form.classNumber'), '2');
			await page.getByTestId('esl-admin-classes.form.submit').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.cohorts.create, {
					year: '2027-2028',
					grade: 8,
					level: 'Advanced',
					classNumber: '2'
				})
			);
		});

		it('surfaces a rejected cohort without clearing the form', async () => {
			withCohorts();
			mockMutation.mockRejectedValueOnce(new Error('Cohort already exists in this year'));
			render(ClassesPage);

			// The default is the current school year, so read it rather than hard-code it.
			const year = page.getByTestId('esl-admin-classes.form.year');
			await expect.element(year).toBeInTheDocument();
			const original = ((await year.element()) as HTMLInputElement).value;

			await page.getByTestId('esl-admin-classes.form.submit').click();

			await expect
				.element(page.getByTestId('esl-admin-classes.form.error'))
				.toHaveTextContent('Cohort already exists in this year');
			await expect.element(year).toHaveValue(original);
		});
	});

	describe('cohort list', () => {
		it('shows the paired CLIL and Comm classes of a grade 7 class', async () => {
			withCohorts();
			render(ClassesPage);

			await expect.element(page.getByTestId('esl-admin-classes.class.CLIL')).toBeInTheDocument();
			await expect.element(page.getByTestId('esl-admin-classes.class.Comm')).toBeInTheDocument();
		});

		it('filters by year', async () => {
			withLevelledCohortsOnly();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.filter.year'), '2026-2027');

			await expect.element(page.getByTestId('esl-admin-classes.count')).toHaveTextContent('(1)');
			await expect
				.element(page.getByTestId('esl-admin-classes.cohort.G9-Intermediate-1'))
				.toBeInTheDocument();
		});

		it('filters by grade', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.filter.grade'), '7');

			await expect.element(page.getByTestId('esl-admin-classes.count')).toHaveTextContent('(1)');
		});

		it('shows the empty state when the filters match nothing', async () => {
			withLevelledCohortsOnly();
			render(ClassesPage);

			// 2026-2027 only has a G9 cohort, so adding a G7 filter empties the list.
			await selectOption(page.getByTestId('esl-admin-classes.filter.year'), '2026-2027');
			await selectOption(page.getByTestId('esl-admin-classes.filter.grade'), '7');

			await expect.element(page.getByTestId('esl-admin-classes.empty')).toBeInTheDocument();
		});

		it('shows each grade 10 level as its own cohort with one class', async () => {
			withCohorts();
			render(ClassesPage);

			// Two cohorts, not one row showing two classes over a shared roster: A and B
			// are ability bands holding different students (ADR-0023).
			const a = page.getByTestId('esl-admin-classes.cohort.G10-01A');
			const b = page.getByTestId('esl-admin-classes.cohort.G10-01B');
			await expect.element(a).toBeInTheDocument();
			await expect.element(b).toBeInTheDocument();
			// Matched on the row's own text: the name appears in both the
			// label and the class cell, so a nested getByText
			// would hit a strict-mode violation.
			await expect.element(a).toHaveTextContent('H101A');
			await expect.element(b).toHaveTextContent('H101B');
		});

		it('labels a grade 10 cohort by its base class and level, not a level name', async () => {
			withCohorts();
			render(ClassesPage);

			const g10 = page.getByTestId('esl-admin-classes.cohort.G10-01A');
			await expect.element(g10).toHaveTextContent('2025-2026 G10 H101A');
			expect(g10.getByText(/Basic|Intermediate|Advanced/)).not.toBeInTheDocument();
		});
	});

	describe('grade 10 form', () => {
		it('offers an A or B level for grade 10, because its levels identify the cohort', async () => {
			withCohorts();
			render(ClassesPage);

			// Grade 10 is levelled, just not by name (ADR-0023). The control is here
			// because the level is part of which cohort this is.
			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');
			const level = page.getByTestId('esl-admin-classes.form.level');
			await expect.element(level).toBeInTheDocument();
			await expect.element(level).toHaveTextContent('A');
			await expect.element(level).toHaveTextContent('B');
		});

		it('takes the grade 10 base class as a typed number, not a fixed list', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');
			const baseClass = page.getByTestId('esl-admin-classes.form.classNumber');

			// A number input, so a year with more or fewer base classes is not
			// blocked by a dropdown built from last year's list.
			await expect.element(baseClass).toHaveAttribute('type', 'number');
			await expect
				.element(page.getByTestId('esl-admin-classes.form.classNumberHint'))
				.toHaveTextContent('varies by year');
		});

		it('accepts a base class number the old fixed list would not have offered', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');
			await page.getByTestId('esl-admin-classes.form.classNumber').fill('12');
			await page.getByTestId('esl-admin-classes.form.submit').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.cohorts.create, {
					year: expect.any(String),
					grade: 10,
					level: 'A',
					classNumber: '12'
				})
			);
		});

		it('blocks submission for a base class outside the name-format bound', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');
			// Set the value directly and fire the `input` event Svelte's
			// `bind:value` listens for, so the bound state really holds 100
			// even though the input carries `max=99`.
			const baseClass = page.getByTestId('esl-admin-classes.form.classNumber');
			const element = (await baseClass.element()) as HTMLInputElement;
			element.value = '100';
			element.dispatchEvent(new Event('input', { bubbles: true }));

			// The submit button is disabled, so the invalid base class can
			// never reach the mutation.
			await expect.element(page.getByTestId('esl-admin-classes.form.submit')).toBeDisabled();
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('previews the class name the picked level will get', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');
			await page.getByTestId('esl-admin-classes.form.classNumber').fill('1');

			const preview = page.getByTestId('esl-admin-classes.form.preview');
			await expect.element(preview).toHaveTextContent('H101A');
			await expect.element(preview).toHaveTextContent('with its own roster');
		});

		it('submits a grade 10 cohort with the level it picked', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');
			await selectOption(page.getByTestId('esl-admin-classes.form.level'), 'B');
			await page.getByTestId('esl-admin-classes.form.classNumber').fill('3');
			await page.getByTestId('esl-admin-classes.form.submit').click();

			await vi.waitFor(() => {
				expect(mockMutation).toHaveBeenCalledWith(api.esl.cohorts.create, {
					year: expect.any(String),
					grade: 10,
					// The level identifies which cohort this is, so it is always sent.
					level: 'B',
					classNumber: '3'
				});
			});
		});

		it('keeps a valid base class when switching to grade 10, and re-renders as a number', async () => {
			withCohorts();
			render(ClassesPage);

			// 2 is a valid grade 10 base class (H102), so switching grades keeps
			// the number and the field swaps from a select to a number input.
			await selectOption(page.getByTestId('esl-admin-classes.form.classNumber'), '2');
			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');

			await expect.element(page.getByTestId('esl-admin-classes.form.classNumber')).toHaveValue(2);
			await expect
				.element(page.getByTestId('esl-admin-classes.form.preview'))
				.toHaveTextContent('H102A');
		});

		it('resets a class number that grade 10 cannot use', async () => {
			withCohorts();
			render(ClassesPage);

			// Switching the other way first leaves an empty value, which is not
			// a valid base class; it falls back to base class 1.
			await selectOption(page.getByTestId('esl-admin-classes.form.grade'), '10');
			await page.getByTestId('esl-admin-classes.form.classNumber').fill('');

			await expect.element(page.getByTestId('esl-admin-classes.form.classNumber')).toHaveValue(1);
			await expect
				.element(page.getByTestId('esl-admin-classes.form.preview'))
				.toHaveTextContent('H101A');
		});
	});

	describe('class teacher assignment', () => {
		it('offers the assignable staff and shows the current teacher', async () => {
			withCohorts();
			render(ClassesPage);

			const select = page.getByTestId('esl-admin-classes.teacher.G9');
			await expect.element(select).toHaveValue('user_t1');
			await expect
				.element(select.getByRole('option', { name: 'Alice Teacher' }))
				.toBeInTheDocument();
			await expect.element(select.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
		});

		it('assigns a teacher to an unassigned class', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.teacher.CLIL'), 'user_t2');

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.assignTeacher, {
					id: 'class_clil',
					teacherId: 'user_t2'
				})
			);
		});

		it('clears a teacher when the empty option is chosen', async () => {
			withCohorts();
			render(ClassesPage);

			await selectOption(page.getByTestId('esl-admin-classes.teacher.G9'), '');

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.classes.assignTeacher, {
					id: 'class_g9',
					teacherId: undefined
				})
			);
		});
	});

	describe('cohort maintenance', () => {
		it('archives an active cohort', async () => {
			withCohorts();
			render(ClassesPage);

			await page.getByTestId('esl-admin-classes.archive.G7-Basic-1').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.cohorts.update, {
					id: 'cohort_g7',
					status: 'archived'
				})
			);
		});

		it('restores an archived cohort', async () => {
			withCohorts();
			render(ClassesPage);

			await page.getByTestId('esl-admin-classes.restore.G9-Intermediate-1').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.cohorts.update, {
					id: 'cohort_g9',
					status: 'active'
				})
			);
		});

		it('surfaces a failed maintenance action', async () => {
			withCohorts();
			mockMutation.mockRejectedValueOnce(new Error('Cohort not found'));
			render(ClassesPage);

			await page.getByTestId('esl-admin-classes.archive.G7-Basic-1').click();

			await expect
				.element(page.getByTestId('esl-admin-classes.error'))
				.toHaveTextContent('Cohort not found');
		});
	});
});
