import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
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

const COHORT_B = {
	_id: 'cohort_g7_b',
	year: '2025-2026',
	grade: 7,
	level: 'Advanced',
	classNumber: '2',
	status: 'active' as const,
	createdAt: 0,
	label: '2025-2026 G7 Advanced 2',
	classes: []
};

const TRANSFER_HIT = {
	_id: 'student_alice',
	englishName: 'Alice Chan',
	chineseName: '陳小美',
	schoolStudentId: '7001001',
	chineseClass: '01',
	homeroom: 'J101',
	cohortId: 'cohort_g7',
	cohortLabel: '2025-2026 G7 Basic 1',
	grade: 7
};

function withTransfers() {
	mockQueries({
		'esl/cohorts:list': [COHORTS[0], COHORT_B],
		'esl/students:listByCohort': ROSTER,
		'esl/transfers:search': [TRANSFER_HIT],
		'esl/transfers:history': [],
		'esl/bands:bandCohorts': [COHORTS[0], COHORT_B]
	});
}

describe('ESL admin students page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		withRoster();
	});

	describe('cohort selection', () => {
		it('prompts for a cohort before showing a roster', async () => {
			await render(StudentsPage);

			await expect.element(page.getByTestId('esl-admin-students.no-class')).toBeInTheDocument();
		});

		it('lists the cohorts to choose from', async () => {
			await render(StudentsPage);

			await expect
				.element(page.getByRole('option', { name: '2025-2026 G7 Basic 1' }))
				.toBeInTheDocument();
		});

		it('shows the empty state for a cohort with no students', async () => {
			withRoster([]);
			await render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.empty')).toBeInTheDocument();
		});
	});

	describe('roster table', () => {
		it('renders each student with their status and reason', async () => {
			await render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.row').first()).toBeInTheDocument();
			await expect.element(page.getByText('Alice Chan')).toBeInTheDocument();
			await expect.element(page.getByText('7001001')).toBeInTheDocument();
			await expect.element(page.getByText('Transferred to Kaohsiung')).toBeInTheDocument();
		});

		it('counts only active students', async () => {
			await render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect
				.element(page.getByTestId('esl-admin-students.active-count'))
				.toMatchTextContent('(1 active)');
		});

		it('offers a re-enrol action for a transferred-out student', async () => {
			await render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.reactivate')).toBeInTheDocument();
		});
	});

	describe('enrolment form', () => {
		it('blocks enrolment until a cohort is chosen', async () => {
			await render(StudentsPage);

			await expect.element(page.getByTestId('esl-admin-students.form.submit')).toBeDisabled();
			await expect
				.element(page.getByTestId('esl-admin-students.form.hint'))
				.toMatchTextContent('Choose a class first');
			expect(mockMutation).not.toHaveBeenCalled();
		});

		it('enables enrolment once a cohort is chosen', async () => {
			await render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');

			await expect.element(page.getByTestId('esl-admin-students.form.submit')).toBeEnabled();
		});

		it('submits the student fields to the enrolment mutation', async () => {
			await render(StudentsPage);

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
			await render(StudentsPage);

			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');
			await page.getByTestId('esl-admin-students.form.englishName').fill('Carol Ho');
			await page.getByTestId('esl-admin-students.form.chineseName').fill('何家明');
			await page.getByTestId('esl-admin-students.form.schoolStudentId').fill('100234');
			await page.getByTestId('esl-admin-students.form.chineseClass').fill('J101');
			await page.getByTestId('esl-admin-students.form.submit').click();

			await expect
				.element(page.getByTestId('esl-admin-students.form.error'))
				.toMatchTextContent('already enrolled in this class');
		});
	});

	describe('roster import', () => {
		// The CSV/TSV paste path is gone (#140). A pasted list of names has no class
		// column, so it cannot say the one thing the workbook does — and the
		// workbook importer now lives here, beside the roster it fills.
		beforeEach(async () => {
			await render(StudentsPage);
		});

		it('offers no paste box', async () => {
			await expect
				.element(page.getByTestId('esl-admin-students.import.textarea'))
				.not.toBeInTheDocument();
		});

		it('hosts the workbook importer and opens its year picker', async () => {
			const toggle = page.getByTestId('esl-admin-students.import.toggle');
			await expect.element(toggle).toMatchTextContent('Import a roster');
			await expect.element(page.getByTestId('esl-import.year')).not.toBeInTheDocument();

			await toggle.click();

			await expect.element(page.getByTestId('esl-import.year')).toBeInTheDocument();
		});

		it('shows the year readiness checklist beside the importer', async () => {
			await expect.element(page.getByTestId('esl-admin-students.readiness')).toBeInTheDocument();
		});
	});

	describe('transfer moves', () => {
		beforeEach(async () => {
			mockMutation.mockResolvedValue({ success: true, bandChanged: false });
			withTransfers();
			await render(StudentsPage);
		});

		it('searches this year and moves a student to another level', async () => {
			await page.getByTestId('esl-admin-students.move.search').fill('Alice');

			await expect
				.element(page.getByTestId('esl-admin-students.move.result').first())
				.toMatchTextContent('Alice Chan');
			await expect
				.element(page.getByTestId('esl-admin-students.move.result').first())
				.toMatchTextContent('2025-2026 G7 Basic 1');

			await page.getByTestId('esl-admin-students.move.level').click();
			await expect.element(page.getByTestId('esl-admin-students.move-dialog')).toBeInTheDocument();

			await selectOption(page.getByTestId('esl-admin-students.move-dialog.target'), 'cohort_g7_b');
			await page.getByTestId('esl-admin-students.move-dialog.reason').fill('Re-levelled');
			await page.getByTestId('esl-admin-students.move-dialog.confirm').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.transfers.transferLevel, {
					studentId: 'student_alice',
					toCohortId: 'cohort_g7_b',
					reason: 'Re-levelled'
				})
			);
		});

		it('corrects a Chinese homeroom', async () => {
			await page.getByTestId('esl-admin-students.move.search').fill('Alice');
			await page.getByTestId('esl-admin-students.move.homeroom').click();

			await selectOption(page.getByTestId('esl-admin-students.move-dialog.homeroom'), 'J102');
			await page.getByTestId('esl-admin-students.move-dialog.confirm').click();

			await vi.waitFor(() =>
				expect(mockMutation).toHaveBeenCalledWith(api.esl.transfers.transferHomeroom, {
					studentId: 'student_alice',
					chineseClass: 'J102'
				})
			);
		});
	});

	describe('transfer status', () => {
		beforeEach(async () => {
			await render(StudentsPage);
			await selectOption(page.getByTestId('esl-admin-students.class'), 'cohort_g7');
		});

		it('prompts for a reason before recording a transfer', async () => {
			await page.getByTestId('esl-admin-students.transfer').first().click();

			await page.getByTestId('esl-admin-students.transfer.confirm').click();

			await expect
				.element(page.getByTestId('esl-admin-students.transfer.error'))
				.toMatchTextContent('A status reason is required when disabling a student');
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
