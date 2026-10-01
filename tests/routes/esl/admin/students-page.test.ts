import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';
import { selectOption } from '../../../lib/select';

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
import StudentsPage from '$src/routes/esl/admin/students/+page.svelte';

const COHORTS = [
	{
		_id: 'cohort_g7',
		year: '2025-2026',
		grade: 7,
		level: 'Basic',
		classNumber: '1',
		status: 'active' as const,
		createdAt: 0,
		label: '2025-2026 G7 Basic 1',
		classes: []
	}
];

const ROSTER = [
	{
		_id: 'student_alice',
		cohortId: 'cohort_g7',
		englishName: 'Alice Chan',
		chineseName: '陳小美',
		schoolStudentId: '7001001',
		status: 'active' as const,
		enrolledAt: 0
	},
	{
		_id: 'student_bob',
		cohortId: 'cohort_g7',
		englishName: 'Bob Lee',
		chineseName: '李大文',
		schoolStudentId: '8123456',
		status: 'disabled' as const,
		enrolledAt: 0,
		disabledAt: 1,
		statusReason: 'Transferred to Kaohsiung'
	}
];

/** Routes each `useQuery` call to canned data by its Convex function name. */
function mockQueries(data: Record<string, unknown>) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const value = data[getFunctionName(reference as never)];
		return { data: Array.isArray(value) ? value : [], isLoading: false, error: null };
	}) as never);
}

function withRoster(students: unknown[] = ROSTER) {
	mockQueries({ 'esl/cohorts:list': COHORTS, 'esl/students:listByCohort': students });
}

describe('ESL admin students page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		withRoster();
	});

	describe('cohort selection', () => {
		it('prompts for a cohort before showing a roster', async () => {
			render(StudentsPage);

			await expect.element(page.getByTestId('esl-admin-students.no-class')).toBeInTheDocument();
		});

		it('lists the cohorts to choose from', async () => {
			render(StudentsPage);

			await expect
				.element(page.getByRole('option', { name: '2025-2026 G7 Basic 1' }))
				.toBeInTheDocument();
		});

		it('shows the empty state for a cohort with no students', async () => {
			withRoster([]);
			render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.empty')).toBeInTheDocument();
		});
	});

	describe('roster table', () => {
		it('renders each student with their status and reason', async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.row').first()).toBeInTheDocument();
			await expect.element(page.getByText('Alice Chan')).toBeInTheDocument();
			await expect.element(page.getByText('7001001')).toBeInTheDocument();
			await expect.element(page.getByText('Transferred to Kaohsiung')).toBeInTheDocument();
		});

		it('counts only active students', async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect
				.element(page.getByTestId('esl-admin-students.active-count'))
				.toHaveTextContent('(1 active)');
		});

		it('offers a re-enrol action for a transferred-out student', async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.reactivate')).toBeInTheDocument();
		});
	});

	describe('enrolment form', () => {
		it('blocks enrolment until a cohort is chosen', async () => {
			render(StudentsPage);

			await expect.element(page.getByTestId('esl-admin-students.form.submit')).toBeDisabled();
			await expect
				.element(page.getByTestId('esl-admin-students.form.hint'))
				.toHaveTextContent('Choose a class first');
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('enables enrolment once a cohort is chosen', async () => {
			render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.form.submit')).toBeEnabled();
		});

		it('submits the student fields to the enrolment mutation', async () => {
			render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');
			await page.getByTestId('esl-admin-students.form.englishName').fill('Carol Ho');
			await page.getByTestId('esl-admin-students.form.chineseName').fill('何家明');
			await page.getByTestId('esl-admin-students.form.schoolStudentId').fill('100234');
			await page.getByTestId('esl-admin-students.form.chineseClass').fill('J101');
			await page.getByTestId('esl-admin-students.form.submit').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.students.create, {
					cohortId: 'cohort_g7',
					englishName: 'Carol Ho',
					chineseName: '何家明',
					schoolStudentId: '100234',
					chineseClass: 'J101'
				})
			);
		});

		it('surfaces a rejected enrolment', async () => {
			mockMutation.mockRejectedValueOnce(
				new Error('Student 100234 is already enrolled in this class')
			);
			render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');
			await page.getByTestId('esl-admin-students.form.englishName').fill('Carol Ho');
			await page.getByTestId('esl-admin-students.form.chineseName').fill('何家明');
			await page.getByTestId('esl-admin-students.form.schoolStudentId').fill('100234');
			await page.getByTestId('esl-admin-students.form.chineseClass').fill('J101');
			await page.getByTestId('esl-admin-students.form.submit').click();

			await expect
				.element(page.getByTestId('esl-admin-students.form.error'))
				.toHaveTextContent('already enrolled in this class');
		});
	});

	describe('roster import', () => {
		// The CSV/TSV paste path is gone (#140). A pasted list of names has no class
		// column, so it cannot say the one thing the workbook does, and the page now
		// points at the importer instead of offering a worse version of it.
		beforeEach(() => {
			render(StudentsPage);
		});

		it('offers no paste box', async () => {
			await expect
				.element(page.getByTestId('esl-admin-students.import.textarea'))
				.not.toBeInTheDocument();
		});

		it('sends the admin to the workbook importer for rosters', async () => {
			const link = page.getByTestId('esl-admin-students.import.link');
			await expect.element(link).toHaveAttribute('href', '/esl/admin/import');
		});

		it('explains why a pasted list of names cannot stand in', async () => {
			await expect
				.element(page.getByTestId('esl-admin-students.import'))
				.toHaveTextContent('from the sheet they are on');
		});
	});

	describe('transfer status', () => {
		beforeEach(async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');
		});

		it('prompts for a reason before recording a transfer', async () => {
			await page.getByTestId('esl-admin-students.transfer').first().click();

			await page.getByTestId('esl-admin-students.transfer.confirm').click();

			await expect
				.element(page.getByTestId('esl-admin-students.transfer.error'))
				.toHaveTextContent('A status reason is required when disabling a student');
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('records the transfer with the reason once supplied', async () => {
			await page.getByTestId('esl-admin-students.transfer').first().click();
			await page.getByTestId('esl-admin-students.transfer.reason').fill('Transferred to Kaohsiung');
			await page.getByTestId('esl-admin-students.transfer.confirm').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.students.updateStatus, {
					id: 'student_alice',
					status: 'disabled',
					statusReason: 'Transferred to Kaohsiung'
				})
			);
		});

		it('closes the prompt without a write when cancelled', async () => {
			await page.getByTestId('esl-admin-students.transfer').first().click();
			await page.getByTestId('esl-admin-students.transfer-dialog.dismiss').click();

			await expect
				.element(page.getByTestId('esl-admin-students.transfer-dialog'))
				.not.toBeInTheDocument();
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('re-enrols a transferred student', async () => {
			await page.getByTestId('esl-admin-students.reactivate').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.students.updateStatus, {
					id: 'student_bob',
					status: 'active'
				})
			);
		});
	});
});
