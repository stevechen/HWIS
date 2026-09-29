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

const TSV_HEADER = 'School Student ID\tEnglish Name\tChinese Name';

describe('ESL admin students page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		withRoster();
	});

	describe('cohort selection', () => {
		it('prompts for a cohort before showing a roster', async () => {
			render(StudentsPage);

			await expect.element(page.getByTestId('esl-admin-students.no-cohort')).toBeInTheDocument();
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

			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.empty')).toBeInTheDocument();
		});
	});

	describe('roster table', () => {
		it('renders each student with their status and reason', async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.row').first()).toBeInTheDocument();
			await expect.element(page.getByText('Alice Chan')).toBeInTheDocument();
			await expect.element(page.getByText('7001001')).toBeInTheDocument();
			await expect.element(page.getByText('Transferred to Kaohsiung')).toBeInTheDocument();
		});

		it('counts only active students', async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');

			await expect
				.element(page.getByTestId('esl-admin-students.active-count'))
				.toHaveTextContent('(1 active)');
		});

		it('offers a re-enrol action for a transferred-out student', async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.reactivate')).toBeInTheDocument();
		});
	});

	describe('enrolment form', () => {
		it('blocks enrolment until a cohort is chosen', async () => {
			render(StudentsPage);

			await expect.element(page.getByTestId('esl-admin-students.form.submit')).toBeDisabled();
			await expect
				.element(page.getByTestId('esl-admin-students.form.hint'))
				.toHaveTextContent('Choose a cohort first');
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('enables enrolment once a cohort is chosen', async () => {
			render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.form.submit')).toBeEnabled();
		});

		it('submits the student fields to the enrolment mutation', async () => {
			render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');
			await page.getByTestId('esl-admin-students.form.englishName').fill('Carol Ho');
			await page.getByTestId('esl-admin-students.form.chineseName').fill('何家明');
			await page.getByTestId('esl-admin-students.form.schoolStudentId').fill('100234');
			await page.getByTestId('esl-admin-students.form.submit').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.students.create, {
					cohortId: 'cohort_g7',
					englishName: 'Carol Ho',
					chineseName: '何家明',
					schoolStudentId: '100234'
				})
			);
		});

		it('surfaces a rejected enrolment', async () => {
			mockMutation.mockRejectedValueOnce(
				new Error('Student 100234 is already enrolled in this cohort')
			);
			render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');
			await page.getByTestId('esl-admin-students.form.englishName').fill('Carol Ho');
			await page.getByTestId('esl-admin-students.form.chineseName').fill('何家明');
			await page.getByTestId('esl-admin-students.form.schoolStudentId').fill('100234');
			await page.getByTestId('esl-admin-students.form.submit').click();

			await expect
				.element(page.getByTestId('esl-admin-students.form.error'))
				.toHaveTextContent('already enrolled in this cohort');
		});
	});

	describe('bulk import', () => {
		beforeEach(async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');
		});

		it('previews how many pasted rows are importable', async () => {
			await page
				.getByTestId('esl-admin-students.import.textarea')
				.fill(`${TSV_HEADER}\n7002001\tDana Wu\t吳大美`);

			await expect
				.element(page.getByTestId('esl-admin-students.import.preview'))
				.toHaveTextContent('1 valid row(s) ready to import');
		});

		it('lists rejected rows with their reason', async () => {
			await page
				.getByTestId('esl-admin-students.import.textarea')
				.fill('English Name\tChinese Name\tStudent ID\nDana Wu\t吳大美\t12');

			await expect
				.element(page.getByTestId('esl-admin-students.import.rejected'))
				.toHaveTextContent('Row 2: School student ID must be a 6- or 7-digit number');
		});

		it('disables the import button when there is nothing to send', async () => {
			await expect.element(page.getByTestId('esl-admin-students.import.submit')).toBeDisabled();
		});

		it('sends only the valid rows to the backend', async () => {
			await page
				.getByTestId('esl-admin-students.import.textarea')
				.fill(`${TSV_HEADER}\n7002001\tDana Wu\t吳大美\nBad Row\t李大文\t12`);
			await page.getByTestId('esl-admin-students.import.submit').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.students.bulkImport, {
					cohortId: 'cohort_g7',
					students: [{ englishName: 'Dana Wu', chineseName: '吳大美', schoolStudentId: '7002001' }]
				})
			);
		});

		it('reports the backend rejection count', async () => {
			mockMutation.mockResolvedValueOnce({
				imported: 1,
				ids: ['student_dana'],
				rejected: [{ index: 0, schoolStudentId: '7002001', reason: 'Already enrolled' }]
			});

			await page
				.getByTestId('esl-admin-students.import.textarea')
				.fill(`${TSV_HEADER}\n7002001\tDana Wu\t吳大美`);
			await page.getByTestId('esl-admin-students.import.submit').click();

			await expect
				.element(page.getByTestId('esl-admin-students.import.summary'))
				.toHaveTextContent('Imported 1 student(s), 1 row(s) rejected by the server');
		});
	});

	describe('transfer status', () => {
		beforeEach(async () => {
			render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.cohort'), 'cohort_g7');
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
