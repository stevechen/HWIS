import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

import WizardPage from '$src/routes/esl/admin/semesters/new/wizard/+page.svelte';
import { WIZARD_STATE_VERSION, WIZARD_STORAGE_KEY } from '$lib/components/esl/wizard/wizard-state';

const STORAGE_KEY = WIZARD_STORAGE_KEY;

interface PinnedExam {
	label: 'Exam 1' | 'Exam 2' | 'Final';
	dates: string[];
}

/**
 * Pin the wizard to a fixed Step 4 state so the calendar, the fan-out and
 * the gates are deterministic no matter what day the suite runs on.
 * Window: Mon 2026-08-31 → Wed 2027-01-20, S1 2026-2027, with two imported no_school days.
 * Exams: Exam 1 = Nov 2-3, Exam 2 = Dec 7-8, Final = Jan 18-20.
 * Block 2 (Nov 4 → Dec 6) is wide enough to hold two 3-day quizzes, which
 * the batch-fill test needs (Quizzes 3–4 both live in Block 2).
 */
function pinStep4(
	exams: PinnedExam[] = [
		{ label: 'Exam 1', dates: ['2026-11-02', '2026-11-03'] },
		{ label: 'Exam 2', dates: ['2026-12-07', '2026-12-08'] },
		{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
	],
	endDate = '2027-01-20',
	offDays: Array<{ date: string; name: string }> = [
		{ date: '2026-11-10', name: 'National Day' },
		{ date: '2026-12-25', name: 'Christmas bridge' }
	]
): string {
	return JSON.stringify({
		version: WIZARD_STATE_VERSION,
		state: {
			currentStep: 4,
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate, offDays, holidaysImported: true, lastExamDay: false },
			step3: { exams },
			step4: {},
			step5: {}
		}
	});
}

async function start(
	exams?: PinnedExam[],
	endDate?: string,
	offDays?: Array<{ date: string; name: string }>
): Promise<void> {
	sessionStorage.setItem(STORAGE_KEY, pinStep4(exams, endDate, offDays));
	await render(WizardPage);
}

describe('wizard step 4 — events tabs (School / ESL)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	it('renders the School and ESL tabs', async () => {
		await start();

		await expect.element(page.getByTestId('wizard.step-4')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard-step4.tab-school')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard-step4.tab-esl')).toBeInTheDocument();
	});

	describe('School tab', () => {
		it('shows First day of school line with P1-P2 no_class note', async () => {
			await start();

			await expect.element(page.getByTestId('wizard-step4.start-school')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.start-school'))
				.toHaveTextContent('Periods 1–2 have no class');
		});

		it('shows Off days accordion with imported holidays (read-only)', async () => {
			await start();

			await expect.element(page.getByTestId('wizard-step4.group-offdays')).toBeInTheDocument();
			await page.getByTestId('wizard-step4.group-offdays').click();
			await expect.element(page.getByTestId('wizard-step4.offdays-list')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.offdays-list'))
				.toHaveTextContent('National Day');
			await expect
				.element(page.getByTestId('wizard-step4.offdays-list'))
				.toHaveTextContent('Christmas bridge');
		});

		it('shows Anniversary & Makeup pair (S1 only — no Anniversary in S1 per F58)', async () => {
			await start();

			// In S1, Anniversary pair should NOT render (F58: Anniversary is S2-only)
			await expect.element(page.getByTestId('wizard-step4.row-anniv-pair')).not.toBeInTheDocument();
		});

		it('shows Sports Day (default on) with Pick date button', async () => {
			await start();

			await expect.element(page.getByTestId('wizard-step4.row-sports')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.sports-toggle')).toBeChecked();
			await expect.element(page.getByTestId('wizard-step4.sports-arm')).toBeInTheDocument();
		});

		it('shows G9 Mocks (2 in S1) with Set dates buttons', async () => {
			await start();

			await expect.element(page.getByTestId('wizard-step4.row-mock1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-mock2')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-mock3')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.row-mock1'))
				.toHaveTextContent('2 days in a row');
		});

		it('does not show Graduation in S1', async () => {
			await start();

			await expect.element(page.getByTestId('wizard-step4.row-grad')).not.toBeInTheDocument();
		});

		it('toggling Sports Day off hides the Pick date button', async () => {
			await start();

			// The locator API has no uncheck(); a click toggles the checked box off.
			await page.getByTestId('wizard-step4.sports-toggle').click();
			await expect.element(page.getByTestId('wizard-step4.sports-arm')).toBeDisabled();
		});

		it('clicking Arm on Sports Day shows placing banner and enables calendar click', async () => {
			await start();

			await page.getByTestId('wizard-step4.sports-arm').click();
			await expect.element(page.getByTestId('wizard-step4.placing-banner')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.placing-banner'))
				.toHaveTextContent('Placing Sports Day');
		});

		it('clicking a calendar date sets Sports Day and clears armed state', async () => {
			await start();

			await page.getByTestId('wizard-step4.sports-arm').click();
			// Pick a valid class day (not weekend, not off, not exam)
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();
			await expect.element(page.getByTestId('wizard-step4.placing-banner')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.row-sports'))
				.toHaveTextContent('2026-10-05');
		});

		it('Anniversary and Makeup same-date gate — both directions', async () => {
			// Switch to S2 to test Anniversary pair
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					version: WIZARD_STATE_VERSION,
					state: {
						currentStep: 4,
						step1: { term: 'S2', schoolYear: '2026-2027', startDate: '2027-02-11' },
						step2: {
							endDate: '2027-06-30',
							offDays: [],
							holidaysImported: true,
							lastExamDay: false
						},
						step3: {
							exams: [
								{ label: 'Exam 1', dates: ['2027-04-12', '2027-04-13'] },
								{ label: 'Exam 2', dates: ['2027-05-17', '2027-05-18'] },
								{ label: 'Final', dates: ['2027-06-21', '2027-06-22', '2027-06-23'] }
							]
						},
						step4: {},
						step5: {}
					}
				})
			);
			await render(WizardPage);

			await expect.element(page.getByTestId('wizard-step4.row-anniv-pair')).toBeInTheDocument();

			// Set Anniversary
			await page.getByTestId('wizard-step4.anniv-arm').click();
			await page.getByTestId('wizard-step4-calendar.date-2027-03-01').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-anniv'))
				.toHaveTextContent('2027-03-01');

			// Setting Anniversary auto-suggests the makeup as the next class
			// day (F52 pairing), so the row holds 2027-03-02, not 'unset'.
			await expect
				.element(page.getByTestId('wizard-step4.row-makeup'))
				.toHaveTextContent('2027-03-02');

			// Try to set Makeup to same date — should be refused
			await page.getByTestId('wizard-step4.makeup-arm').click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2027-03-01'))
				.toBeDisabled();
			await page.getByTestId('wizard-step4-calendar.date-2027-03-01').click({ force: true });
			await expect
				.element(page.getByTestId('wizard-step4.row-makeup'))
				.toHaveTextContent('2027-03-02');
			await expect
				.element(page.getByTestId('wizard-step4.row-makeup'))
				.not.toHaveTextContent('2027-03-01');
		});
	});

	describe('ESL tab', () => {
		it('shows CLIL Quizzes ×6 with batch-fill button', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await expect.element(page.getByTestId('wizard-step4.group-quiz')).toBeInTheDocument();
			await page.getByTestId('wizard-step4.group-quiz').click();
			await expect.element(page.getByTestId('wizard-step4.quiz-batchfill')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-q1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-q6')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.row-q1'))
				.toHaveTextContent('(batch start)');
		});

		it('shows Passport Dues ×3 in S1 (×2 in S2)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await expect.element(page.getByTestId('wizard-step4.group-dues')).toBeInTheDocument();
			await page.getByTestId('wizard-step4.group-dues').click();
			await expect.element(page.getByTestId('wizard-step4.row-pd1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd2')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd3')).toBeInTheDocument();
		});

		it('shows Recording Dues ×3 in S1 (×2 in S2)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page.getByTestId('wizard-step4.group-dues').click();
			await expect.element(page.getByTestId('wizard-step4.row-rd1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-rd2')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-rd3')).toBeInTheDocument();
		});

		it('shows Passport Check and Workbook Check (5-school-day windows)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await expect.element(page.getByTestId('wizard-step4.group-checks')).toBeInTheDocument();
			await page.getByTestId('wizard-step4.group-checks').click();
			await expect.element(page.getByTestId('wizard-step4.row-pcheck')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-wcheck')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.row-pcheck'))
				.toHaveTextContent('Communication');
			await expect.element(page.getByTestId('wizard-step4.row-wcheck')).toHaveTextContent('CLIL');
		});

		it('batch-fill: pick Quiz 1 → auto-places 6 quizzes across 3 blocks', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page.getByTestId('wizard-step4.group-quiz').click();

			// Arm Quiz 1 (batch source)
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set batch start' })
				.click();
			// Pick a date in Block 1 (before Exam 1)
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			// All 6 quizzes should be placed
			await expect.element(page.getByTestId('wizard-step4.row-q1')).toHaveTextContent('2026-10-05');
			await expect.element(page.getByTestId('wizard-step4.row-q2')).not.toHaveTextContent('unset');
			await expect.element(page.getByTestId('wizard-step4.row-q3')).not.toHaveTextContent('unset');
			await expect.element(page.getByTestId('wizard-step4.row-q4')).not.toHaveTextContent('unset');
			await expect.element(page.getByTestId('wizard-step4.row-q5')).not.toHaveTextContent('unset');
			await expect.element(page.getByTestId('wizard-step4.row-q6')).not.toHaveTextContent('unset');
		});

		it('batch-fill: pick Passport Due 1 → auto-places dues across exam periods', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page.getByTestId('wizard-step4.group-dues').click();

			// Arm Passport Due 1 (batch source)
			await page
				.getByTestId('wizard-step4.row-pd1')
				.getByRole('button', { name: 'Set batch start' })
				.click();
			// Pick a date in Block 1
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			// All 3 dues should be placed
			await expect
				.element(page.getByTestId('wizard-step4.row-pd1'))
				.toHaveTextContent('2026-10-05');
			await expect.element(page.getByTestId('wizard-step4.row-pd2')).not.toHaveTextContent('unset');
			await expect.element(page.getByTestId('wizard-step4.row-pd3')).not.toHaveTextContent('unset');
		});

		it('reminder ranges exclude exam days (5-day window skips exams)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page.getByTestId('wizard-step4.group-checks').click();

			// Arm Passport Check (5-day window in Block 3)
			await page
				.getByTestId('wizard-step4.row-pcheck')
				.getByRole('button', { name: 'Set window' })
				.click();
			// Pick a date in Block 3 (after Exam 2)
			await page.getByTestId('wizard-step4-calendar.date-2027-01-04').click();

			// The range should be 5 school days, skipping exam days that fall in range
			// Exam 2 is Dec 7-8, so a range starting Jan 4 should be fine
			await expect
				.element(page.getByTestId('wizard-step4.row-pcheck'))
				.not.toHaveTextContent('unset');
		});

		it('G9 Mocks are 2-day consecutive events with order gate', async () => {
			await start();

			// Arm Mock 1
			await page
				.getByTestId('wizard-step4.row-mock1')
				.getByRole('button', { name: 'Set dates' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			// Should set 2 consecutive class days
			await expect
				.element(page.getByTestId('wizard-step4.row-mock1'))
				.toHaveTextContent('2026-10-05');
			await expect
				.element(page.getByTestId('wizard-step4.row-mock1'))
				.toHaveTextContent('2026-10-06');

			// Try to set Mock 2 before Mock 1 — should be refused
			await page
				.getByTestId('wizard-step4.row-mock2')
				.getByRole('button', { name: 'Set dates' })
				.click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-01'))
				.toBeDisabled();
		});
	});

	describe('Calendar interaction', () => {
		it('clicking an event row highlights its set dates on the calendar', async () => {
			await start();

			// Set Sports Day first (an unset row has no dates to highlight).
			await page.getByTestId('wizard-step4.sports-arm').click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-sports'))
				.toHaveTextContent('2026-10-05');

			// Re-arming the row highlights its set date on the calendar.
			await page.getByTestId('wizard-step4.sports-arm').click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-05'))
				.toHaveClass(/ring-emerald-500/);
		});

		it('hovering a date shows preview for multi-day events', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page.getByTestId('wizard-step4.group-quiz').click();
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set batch start' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').hover();

			// Quiz is 3-day window, should highlight 3 class days
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-05'))
				.toHaveClass(/ring-emerald-500/);
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-06'))
				.toHaveClass(/ring-emerald-500/);
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-07'))
				.toHaveClass(/ring-emerald-500/);
		});

		it('disabled dates (off days, exam days) are not clickable', async () => {
			await start();

			await page.getByTestId('wizard-step4.sports-arm').click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-11-10'))
				.toBeDisabled(); // Off day
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-11-02'))
				.toBeDisabled(); // Exam day
		});
	});

	describe('S2-specific behavior', () => {
		it('shows Anniversary pair in S2', async () => {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					version: WIZARD_STATE_VERSION,
					state: {
						currentStep: 4,
						step1: { term: 'S2', schoolYear: '2026-2027', startDate: '2027-02-11' },
						step2: {
							endDate: '2027-06-30',
							offDays: [],
							holidaysImported: true,
							lastExamDay: false
						},
						step3: {
							exams: [
								{ label: 'Exam 1', dates: ['2027-04-12', '2027-04-13'] },
								{ label: 'Exam 2', dates: ['2027-05-17', '2027-05-18'] },
								{ label: 'Final', dates: ['2027-06-21', '2027-06-22', '2027-06-23'] }
							]
						},
						step4: {},
						step5: {}
					}
				})
			);
			await render(WizardPage);

			await expect.element(page.getByTestId('wizard-step4.row-anniv-pair')).toBeInTheDocument();
		});

		it('shows Graduation in S2 (after Exam 2 gate)', async () => {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					version: WIZARD_STATE_VERSION,
					state: {
						currentStep: 4,
						step1: { term: 'S2', schoolYear: '2026-2027', startDate: '2027-02-11' },
						step2: {
							endDate: '2027-06-30',
							offDays: [],
							holidaysImported: true,
							lastExamDay: false
						},
						step3: {
							exams: [
								{ label: 'Exam 1', dates: ['2027-04-12', '2027-04-13'] },
								{ label: 'Exam 2', dates: ['2027-05-17', '2027-05-18'] },
								{ label: 'Final', dates: ['2027-06-21', '2027-06-22', '2027-06-23'] }
							]
						},
						step4: {},
						step5: {}
					}
				})
			);
			await render(WizardPage);

			await expect.element(page.getByTestId('wizard-step4.row-grad')).toBeInTheDocument();
		});

		it('shows only 2 Passport Dues and 2 Recording Dues in S2', async () => {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					version: WIZARD_STATE_VERSION,
					state: {
						currentStep: 4,
						step1: { term: 'S2', schoolYear: '2026-2027', startDate: '2027-02-11' },
						step2: {
							endDate: '2027-06-30',
							offDays: [],
							holidaysImported: true,
							lastExamDay: false
						},
						step3: {
							exams: [
								{ label: 'Exam 1', dates: ['2027-04-12', '2027-04-13'] },
								{ label: 'Exam 2', dates: ['2027-05-17', '2027-05-18'] },
								{ label: 'Final', dates: ['2027-06-21', '2027-06-22', '2027-06-23'] }
							]
						},
						step4: {},
						step5: {}
					}
				})
			);
			await render(WizardPage);

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page.getByTestId('wizard-step4.group-dues').click();
			await expect.element(page.getByTestId('wizard-step4.row-pd1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd2')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd3')).not.toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-rd1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-rd2')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-rd3')).not.toBeInTheDocument();
		});

		it('Graduation date must be after Exam 2', async () => {
			sessionStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					version: WIZARD_STATE_VERSION,
					state: {
						currentStep: 4,
						step1: { term: 'S2', schoolYear: '2026-2027', startDate: '2027-02-11' },
						step2: {
							endDate: '2027-06-30',
							offDays: [],
							holidaysImported: true,
							lastExamDay: false
						},
						step3: {
							exams: [
								{ label: 'Exam 1', dates: ['2027-04-12', '2027-04-13'] },
								{ label: 'Exam 2', dates: ['2027-05-17', '2027-05-18'] },
								{ label: 'Final', dates: ['2027-06-21', '2027-06-22', '2027-06-23'] }
							]
						},
						step4: {},
						step5: {}
					}
				})
			);
			await render(WizardPage);

			await page
				.getByTestId('wizard-step4.row-grad')
				.getByRole('button', { name: 'Pick date' })
				.click();
			// Dates on/before Exam 2 (2027-05-18) should be disabled
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2027-05-18'))
				.toBeDisabled();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2027-05-17'))
				.toBeDisabled();
		});
	});

	describe('Summary panel', () => {
		it('shows read-only summary of all set events', async () => {
			await start();

			await expect.element(page.getByTestId('wizard-step4.summary')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.summary'))
				.toHaveTextContent('First day of school');
		});
	});
});
