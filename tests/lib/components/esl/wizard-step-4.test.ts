import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args),
	beforeNavigate: vi.fn()
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
			step2: { endDate, offDays, holidaysImported: true },
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
				.toMatchTextContent('Periods 1–2 have no class');
		});

		it('shows Off days accordion with imported holidays (read-only)', async () => {
			await start();

			await expect.element(page.getByTestId('wizard-step4.group-offdays')).toBeInTheDocument();
			await page.getByTestId('wizard-step4.group-offdays').click();
			await expect.element(page.getByTestId('wizard-step4.offdays-list')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.offdays-list'))
				.toMatchTextContent('National Day');
			await expect
				.element(page.getByTestId('wizard-step4.offdays-list'))
				.toMatchTextContent('Christmas bridge');
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
				.toMatchTextContent('2 days in a row');
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
				.toMatchTextContent('Placing Sports Day');
		});

		it('clicking a calendar date sets Sports Day and clears armed state', async () => {
			await start();

			await page.getByTestId('wizard-step4.sports-arm').click();
			// Pick a valid class day (not weekend, not off, not exam)
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();
			await expect.element(page.getByTestId('wizard-step4.placing-banner')).not.toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.row-sports'))
				.toMatchTextContent('2026-10-05');
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
							holidaysImported: true
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
				.toMatchTextContent('2027-03-01');

			// Setting Anniversary auto-suggests the makeup as the next class
			// day (F52 pairing), so the row holds 2027-03-02, not 'unset'.
			await expect
				.element(page.getByTestId('wizard-step4.row-makeup'))
				.toMatchTextContent('2027-03-02');

			// Try to set Makeup to same date — should be refused
			await page.getByTestId('wizard-step4.makeup-arm').click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2027-03-01'))
				.toBeDisabled();
			await page.getByTestId('wizard-step4-calendar.date-2027-03-01').click({ force: true });
			await expect
				.element(page.getByTestId('wizard-step4.row-makeup'))
				.toMatchTextContent('2027-03-02');
			await expect
				.element(page.getByTestId('wizard-step4.row-makeup'))
				.not.toMatchTextContent('2027-03-01');
		});
	});

	describe('ESL tab', () => {
		it('shows CLIL Quizzes ×6 rows, each placed manually', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await expect.element(page.getByTestId('wizard-step4.block-1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.block-3')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-q1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-q6')).toBeInTheDocument();
			// Every row offers the same manual "Set window" control.
			await expect
				.element(
					page.getByTestId('wizard-step4.row-q1').getByRole('button', { name: 'Set window' })
				)
				.toBeInTheDocument();
			await expect
				.element(
					page.getByTestId('wizard-step4.row-q6').getByRole('button', { name: 'Set window' })
				)
				.toBeInTheDocument();
		});

		it('groups ESL rows under block headers with a remaining count', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			const block1 = page.getByTestId('wizard-step4.block-1');
			await expect.element(block1).toMatchTextContent('4 left');
			await expect.element(page.getByTestId('wizard-step4.row-q1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd1')).toBeInTheDocument();

			// Block 3 holds its own quiz + dues rows plus both end-of-term checks.
			await expect.element(page.getByTestId('wizard-step4.block-3')).toMatchTextContent('6 left');
		});

		it('shows Passport Dues ×3 in S1 (×2 in S2)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await expect.element(page.getByTestId('wizard-step4.block-1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd2')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pd3')).toBeInTheDocument();
		});

		it('shows Recording Dues ×3 in S1 (×2 in S2)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await expect.element(page.getByTestId('wizard-step4.row-rd1')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-rd2')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-rd3')).toBeInTheDocument();
		});

		it('shows Passport Check and Workbook Check (5-school-day windows)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await expect.element(page.getByTestId('wizard-step4.block-3')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-pcheck')).toBeInTheDocument();
			await expect.element(page.getByTestId('wizard-step4.row-wcheck')).toBeInTheDocument();
			await expect
				.element(page.getByTestId('wizard-step4.row-pcheck'))
				.toMatchTextContent('Communication');
			await expect.element(page.getByTestId('wizard-step4.row-wcheck')).toMatchTextContent('CLIL');
		});

		it('a quiz window spans 3 classes, reaching past a Friday holiday', async () => {
			// Block 3 runs 2026-12-09 .. 2027-01-17. Christmas (Fri 12-25) takes
			// that week's Friday class, so the window must reach into the next
			// week for its third class: 12-21, 12-23, then 12-28.
			await start(undefined, undefined, [
				{ date: '2026-12-25', name: 'Christmas' },
				{ date: '2027-01-01', name: 'New Year' }
			]);

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page
				.getByTestId('wizard-step4.row-q5')
				.getByRole('button', { name: 'Set window' })
				.click();

			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-12-21'))
				.not.toBeDisabled();
			await page.getByTestId('wizard-step4-calendar.date-2026-12-21').click();

			// 3 classes: Mon 12-21, Wed 12-23, and Mon 12-28 (past the holiday).
			await expect
				.element(page.getByTestId('wizard-step4.row-q5'))
				.toMatchTextContent('2026-12-21 → 2026-12-28');
		});

		it('the highlighted classes match exactly what gets saved', async () => {
			await start(undefined, undefined, [{ date: '2026-12-25', name: 'Christmas' }]);

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page
				.getByTestId('wizard-step4.row-q5')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-12-22').hover();

			// Hovering Tue 12-22 previews the same three classes the click saves.
			for (const date of ['2026-12-21', '2026-12-23', '2026-12-28']) {
				await expect
					.element(page.getByTestId(`wizard-step4-calendar.date-${date}`))
					.toHaveClass(/ring-emerald-600/);
			}
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-12-25'))
				.not.toHaveClass(/ring-emerald-600/);

			await page.getByTestId('wizard-step4-calendar.date-2026-12-22').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q5'))
				.toMatchTextContent('2026-12-21 → 2026-12-28');
		});

		it('manual placement: setting Quiz 1 stores that week 3 CLIL classes', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			// Click Tue 2026-10-06; the week is Mon 10-05 .. Fri 10-09, so the
			// window is its Mon/Wed/Fri classes.
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-06').click();

			// The row renders the window as first → last (Mon 10-05 → Fri 10-09);
			// the Wednesday class between them is implied.
			const q1 = page.getByTestId('wizard-step4.row-q1');
			await expect.element(q1).toMatchTextContent('2026-10-05');
			await expect.element(q1).toMatchTextContent('2026-10-09');
			await expect.element(q1).not.toMatchTextContent('unset');
		});

		it('every school day of a week selects the same window', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			// Clicking Mon, then Thu of the SAME week must give the same result.
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q1'))
				.toMatchTextContent('2026-10-05');

			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-08').click();

			const q1 = page.getByTestId('wizard-step4.row-q1');
			// Same week ⇒ identical window, still anchored on the Monday.
			await expect.element(q1).toMatchTextContent('2026-10-05');
			await expect.element(q1).toMatchTextContent('2026-10-09');
		});

		it('a quiz window that loses one class to a holiday reaches for a third', async () => {
			// National Day 2026-10-10 is a Saturday, so the observed day off is
			// Friday 2026-10-09 — a CLIL class day inside the week of Mon 10-05.
			// The window still covers three classes: 10-05, 10-07, then 10-12.
			await start(undefined, undefined, [{ date: '2026-10-09', name: 'National Day (observed)' }]);

			await page.getByTestId('wizard-step4.tab-esl').click();

			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();

			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-05'))
				.not.toBeDisabled();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			await expect
				.element(page.getByTestId('wizard-step4.row-q1'))
				.toMatchTextContent('2026-10-05 → 2026-10-12');
		});

		it('a quiz is not blocked by a sibling that merely ends later', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			// Quiz 2 is already set in Block 1.
			await page
				.getByTestId('wizard-step4.row-q2')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q2'))
				.toMatchTextContent('2026-10-05');

			// Quiz 1 gets placed LATER in the same block than Quiz 2. It shares
			// no day with Quiz 2, so it must not disable Quiz 2's dates.
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-19').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q1'))
				.toMatchTextContent('2026-10-19');

			// REGRESSION: with Quiz 1 later and sharing no day, Quiz 2 must still
			// be movable within Block 1. The overlap check used a one-sided test
			// that refused any window ending before its sibling ended, which
			// greyed out every Block 1 date for Quiz 2.
			await page
				.getByTestId('wizard-step4.row-q2')
				.getByRole('button', { name: 'Set window' })
				.click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-05'))
				.not.toBeDisabled();

			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q2'))
				.toMatchTextContent('2026-10-05');
		});

		it('a later quiz in the same block can be moved after its neighbour', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			// Quiz 1 first, at 2026-09-14 (fans out to 09-14..09-18).
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-09-14').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q1'))
				.toMatchTextContent('2026-09-14');

			// Quiz 2 next, at 2026-10-02 (fans out to 10-02..10-08) — the state
			// the admin reported.
			await page
				.getByTestId('wizard-step4.row-q2')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-02').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q2'))
				.toMatchTextContent('2026-10-02');

			// REGRESSION: q2 must be able to move LATER to 10-05..10-09. The
			// order gate compared the candidate against q1's window, but q2's
			// OWN committed dates still sat in `ranges`, so every date from
			// 10-02 onward was refused and the row looked locked.
			await page
				.getByTestId('wizard-step4.row-q2')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			const q2 = page.getByTestId('wizard-step4.row-q2');
			await expect.element(q2).toMatchTextContent('2026-10-05');
			await expect.element(q2).not.toMatchTextContent('2026-10-02');
		});

		it('manual placement: a placed quiz can be moved to another date', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			// Place Quiz 1 on 2026-10-05, then re-arm and move it.
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-q1'))
				.toMatchTextContent('2026-10-05');

			// Re-arm and pick a different Block 1 start.
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-09-14').click();

			const q1 = page.getByTestId('wizard-step4.row-q1');
			await expect.element(q1).toMatchTextContent('2026-09-14');
			await expect.element(q1).not.toMatchTextContent('2026-10-05');
		});

		it('manual placement: setting Passport Due 1 places only that due', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			// Arm Passport Due 1 and pick a date in Block 1
			await page
				.getByTestId('wizard-step4.row-pd1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			// Only Due 1 is placed — the rest stay unset.
			await expect
				.element(page.getByTestId('wizard-step4.row-pd1'))
				.toMatchTextContent('2026-10-05');
			await expect.element(page.getByTestId('wizard-step4.row-pd2')).toMatchTextContent('unset');
			await expect.element(page.getByTestId('wizard-step4.row-pd3')).toMatchTextContent('unset');
		});

		it('places a short due week before an exam and keeps post-exam days out', async () => {
			// Exam 1 cuts the week of Mon 10-12 short: only 10-12 and 10-13
			// are Block 1 school days, and 10-16 belongs to Block 2.
			await start([
				{ label: 'Exam 1', dates: ['2026-10-14', '2026-10-15'] },
				{ label: 'Exam 2', dates: ['2026-12-07', '2026-12-08'] },
				{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
			]);

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page
				.getByTestId('wizard-step4.row-pd1')
				.getByRole('button', { name: 'Set window' })
				.click();

			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-12'))
				.not.toBeDisabled();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-16'))
				.toBeDisabled();

			await page.getByTestId('wizard-step4-calendar.date-2026-10-12').click();

			// The short week collects the previous school week (10-05 .. 10-09)
			// plus 10-12 and 10-13 — never 10-16, which is past Exam 1.
			await expect
				.element(page.getByTestId('wizard-step4.row-pd1'))
				.toMatchTextContent('2026-10-05 → 2026-10-13');
		});

		it('reminder ranges exclude exam days (5-day window skips exams)', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

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
				.not.toMatchTextContent('unset');
		});

		it('places a check on a school week that contains an off day', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();

			// Block 3 week Mon 12-21 .. Fri 12-25: Christmas removes the Friday
			// class, but the four remaining school days are still a full week.
			await page
				.getByTestId('wizard-step4.row-pcheck')
				.getByRole('button', { name: 'Set window' })
				.click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-12-21'))
				.not.toBeDisabled();
			await page.getByTestId('wizard-step4-calendar.date-2026-12-21').click();
			await expect
				.element(page.getByTestId('wizard-step4.row-pcheck'))
				.toMatchTextContent('2026-12-21 → 2026-12-24');
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
				.toMatchTextContent('2026-10-05');
			await expect
				.element(page.getByTestId('wizard-step4.row-mock1'))
				.toMatchTextContent('2026-10-06');

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
				.toMatchTextContent('2026-10-05');

			// Re-arming the row highlights its set date on the calendar.
			await page.getByTestId('wizard-step4.sports-arm').click();
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-05'))
				.toHaveClass(/ring-emerald-200/);
		});

		it('shows a confirm toast naming what the calendar click set', async () => {
			await start();

			await page.getByTestId('wizard-step4.sports-arm').click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			const toast = page.getByTestId('wizard-step4.confirm-toast');
			await expect.element(toast).toBeInTheDocument();
			await expect.element(toast).toMatchTextContent('Sports Day set');
			await expect.element(toast).toMatchTextContent('2026-10-05');
		});

		it('hovering a quiz date highlights that week 3 CLIL classes', async () => {
			await start();

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set window' })
				.click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-06').hover();

			// A quiz week highlights exactly the 3 CLIL class days (Mon/Wed/Fri)
			// of the hovered week — not every school day.
			for (const date of ['2026-10-05', '2026-10-07', '2026-10-09']) {
				await expect
					.element(page.getByTestId(`wizard-step4-calendar.date-${date}`))
					.toHaveClass(/ring-emerald-600/);
			}
			// The non-class days of that week are NOT part of the window.
			for (const date of ['2026-10-06', '2026-10-08']) {
				await expect
					.element(page.getByTestId(`wizard-step4-calendar.date-${date}`))
					.not.toHaveClass(/ring-emerald-600/);
			}
			await expect
				.element(page.getByTestId('wizard-step4-calendar.date-2026-10-12'))
				.not.toHaveClass(/ring-emerald-600/);
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
							holidaysImported: true
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
			// Anniversary + Sports Day. The makeup follows Anniversary, so it
			// does not count as separate work.
			await expect
				.element(page.getByTestId('wizard-step4.group-fest'))
				.toMatchTextContent('2 left');
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
							holidaysImported: true
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
							holidaysImported: true
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
							holidaysImported: true
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

			const summary = page.getByTestId('wizard-step4.summary');
			await expect.element(summary).toBeInTheDocument();
			await expect.element(summary).toMatchTextContent('Rows you set will appear here.');

			await page.getByTestId('wizard-step4.sports-arm').click();
			await page.getByTestId('wizard-step4-calendar.date-2026-10-05').click();

			await expect.element(summary).toMatchTextContent('Sports Day');
			await expect.element(summary).not.toMatchTextContent('Rows you set will appear here.');
		});
	});
});
