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

const BASE_OFF_DAYS = [
	{ date: '2026-11-10', name: 'National Day' },
	{ date: '2026-12-25', name: 'Christmas bridge' }
];

interface PinnedExam {
	label: 'Exam 1' | 'Exam 2' | 'Final';
	dates: string[];
}

/**
 * Pin the wizard to a fixed Step 3 state so the calendar, the fan-out and
 * the gates are deterministic no matter what day the suite runs on (the
 * shell seeds from the real clock otherwise). Window: Mon 2026-08-31 →
 * Wed 2027-01-20, S1 2026-2027, with two imported no_school days.
 */
function pin(
	exams: PinnedExam[] = [],
	endDate = '2027-01-20',
	offDays: Array<{ date: string; name: string }> = BASE_OFF_DAYS
): string {
	return JSON.stringify({
		version: WIZARD_STATE_VERSION,
		state: {
			currentStep: 3,
			step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
			step2: { endDate, offDays, holidaysImported: true },
			step3: { exams },
			step4: {},
			step5: {}
		}
	});
}

function stored(): string | null {
	return sessionStorage.getItem(STORAGE_KEY);
}

async function start(
	exams: PinnedExam[] = [],
	endDate?: string,
	offDays?: Array<{ date: string; name: string }>
): Promise<void> {
	sessionStorage.setItem(STORAGE_KEY, pin(exams, endDate, offDays));
	await render(WizardPage);
}

describe('wizard step 3 — exam dates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	it('renders the three exam tabs, the status picker and the semester calendar', async () => {
		await start();

		await expect.element(page.getByTestId('wizard.step-3-exam-tab-Exam 1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-3-exam-tab-Exam 2')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-3-exam-tab-Final')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-3-picker.title'))
			.toHaveTextContent('Exam 1 (2 class days)');
		await expect
			.element(page.getByTestId('wizard.step-3-calendar.date-2026-11-02'))
			.toBeInTheDocument();
	});

	it('auto-defaults Final to the last three class days of the term', async () => {
		await start();

		await page.getByTestId('wizard.step-3-exam-tab-Final').click();

		await expect
			.element(page.getByTestId('wizard.step-3-picker.current'))
			.toHaveTextContent('2027-01-18, 2027-01-19, 2027-01-20');
	});

	it('sets the range on click — no confirm dialog — and persists it as the Step 4 anchor', async () => {
		await start();

		await page.getByTestId('wizard.step-3-calendar.date-2026-11-02').click();

		await expect
			.element(page.getByTestId('wizard.step-3-picker.current'))
			.toHaveTextContent('2026-11-02, 2026-11-03');
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-3-exam-Exam 1'))
			.toHaveTextContent('Mon Nov 2 – Tue Nov 3');
		await vi.waitFor(() => {
			expect(stored()).toContain('"label":"Exam 1","dates":["2026-11-02","2026-11-03"]');
		});
	});

	it('fans out over weekends — a Friday start ends the next Monday', async () => {
		await start();

		await page.getByTestId('wizard.step-3-exam-tab-Exam 2').click();
		await page.getByTestId('wizard.step-3-calendar.date-2026-11-06').click();

		await expect
			.element(page.getByTestId('wizard.step-3-picker.current'))
			.toHaveTextContent('2026-11-06, 2026-11-09');
	});

	it('fans out over imported no_school days', async () => {
		await start();

		await page.getByTestId('wizard.step-3-calendar.date-2026-11-09').click();

		await expect
			.element(page.getByTestId('wizard.step-3-picker.current'))
			.toHaveTextContent('2026-11-09, 2026-11-11');
	});

	it('refuses off days themselves — the cell is disabled and a click sets nothing', async () => {
		await start();

		await expect.element(page.getByTestId('wizard.step-3-calendar.date-2026-11-10')).toBeDisabled();
		await page.getByTestId('wizard.step-3-calendar.date-2026-11-10').click({ force: true });

		await expect.element(page.getByTestId('wizard.step-3-picker.current')).not.toBeInTheDocument();
	});

	it('disables days taken by another exam in the sibling tabs', async () => {
		await start();

		await page.getByTestId('wizard.step-3-calendar.date-2026-11-02').click();
		await page.getByTestId('wizard.step-3-exam-tab-Exam 2').click();

		await expect.element(page.getByTestId('wizard.step-3-calendar.date-2026-11-02')).toBeDisabled();
		await expect.element(page.getByTestId('wizard.step-3-calendar.date-2026-11-03')).toBeDisabled();
		await page.getByTestId('wizard.step-3-calendar.date-2026-11-02').click({ force: true });

		await expect.element(page.getByTestId('wizard.step-3-picker.current')).not.toBeInTheDocument();
	});

	it('disables starts that would break the Exam 1 < Exam 2 order', async () => {
		await start();

		await page.getByTestId('wizard.step-3-calendar.date-2026-12-07').click();
		await expect
			.element(page.getByTestId('wizard.step-3-picker.current'))
			.toHaveTextContent('2026-12-07, 2026-12-08');

		await page.getByTestId('wizard.step-3-exam-tab-Exam 2').click();
		const early = page.getByTestId('wizard.step-3-calendar.date-2026-11-02');
		await expect.element(early).toBeDisabled();
		await expect
			.element(early)
			.toHaveAttribute(
				'title',
				'2026-11-02 would break the exam order — Exam 1 must end before Exam 2 starts'
			);
	});

	it('fans Final out to three class days', async () => {
		await start();

		await page.getByTestId('wizard.step-3-exam-tab-Final').click();
		await page.getByTestId('wizard.step-3-picker.clear').click();
		await page.getByTestId('wizard.step-3-calendar.date-2027-01-04').click();

		await expect
			.element(page.getByTestId('wizard.step-3-picker.current'))
			.toHaveTextContent('2027-01-04, 2027-01-05, 2027-01-06');
	});

	it('moves the range when the same tab is clicked again', async () => {
		await start();

		await page.getByTestId('wizard.step-3-calendar.date-2026-11-02').click();
		await page.getByTestId('wizard.step-3-calendar.date-2026-11-16').click();

		await expect
			.element(page.getByTestId('wizard.step-3-picker.current'))
			.toHaveTextContent('2026-11-16, 2026-11-17');
	});

	it('clears the range from the picker card', async () => {
		await start();

		await page.getByTestId('wizard.step-3-calendar.date-2026-11-02').click();
		await page.getByTestId('wizard.step-3-picker.clear').click();

		await expect.element(page.getByTestId('wizard.step-3-picker.current')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-3-exam-Exam 1-empty')).toBeInTheDocument();
	});

	it('keeps Next disabled until all three required exams are set, then advances to step 4', async () => {
		await start();

		// Final arrives auto-defaulted; clear it so the gate is observable.
		await page.getByTestId('wizard.step-3-exam-tab-Final').click();
		await page.getByTestId('wizard.step-3-picker.clear').click();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeDisabled();

		await page.getByTestId('wizard.step-3-exam-tab-Exam 1').click();
		await page.getByTestId('wizard.step-3-calendar.date-2026-11-02').click();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeDisabled();

		await page.getByTestId('wizard.step-3-exam-tab-Exam 2').click();
		await page.getByTestId('wizard.step-3-calendar.date-2026-11-06').click();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeDisabled();

		await page.getByTestId('wizard.step-3-exam-tab-Final').click();
		await page.getByTestId('wizard.step-3-calendar.date-2027-01-04').click();
		await expect.element(page.getByRole('button', { name: 'Next' })).toBeEnabled();

		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(page.getByTestId('wizard.step-4-placeholder')).toBeInTheDocument();
	});

	it('warns (advisory) when an exam lands in the sibling semester window', async () => {
		// An end date pushed past the sibling S2 start (2027-02-11) pulls the
		// Final auto-default into the next semester's window.
		await start([], '2027-02-15', []);

		await expect
			.element(page.getByTestId('wizard.step-3-boundary-warning'))
			.toHaveTextContent(/Final/);
		await expect
			.element(page.getByTestId('wizard.step-3-boundary-warning'))
			.toHaveTextContent(/S2/);
	});

	it('previews the fan-out on hover', async () => {
		await start();

		await page.getByTestId('wizard.step-3-calendar.date-2026-11-02').hover();

		await expect
			.element(page.getByTestId('wizard.step-3-calendar.date-2026-11-02'))
			.toHaveClass(/ring-emerald-500/);
		await expect
			.element(page.getByTestId('wizard.step-3-calendar.date-2026-11-03'))
			.toHaveClass(/ring-emerald-500/);
	});
});
