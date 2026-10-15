import { test, expect } from './fixtures';
import type { Page, Browser } from '@playwright/test';
import {
	useRole,
	setEslRoleByEmail,
	cleanupTestData,
	createEslCohort,
	setEslClassSchedule,
	assignEslTeacher,
	createEslSemester,
	createEslEvent,
	updateEslEvent,
	getEslSemester
} from './convex-client';
import { boundaryCrossWarning } from '../src/lib/esl-semesters';
import type { EslWeekday } from '../src/lib/e2e-utils';
import { getTestSuffix } from './helpers';

/**
 * Full wizard flow (ticket #225, spec #215): admin drives the real 5-step
 * wizard to create a semester, then a teacher sees the events in the list
 * and calendar views. Dates are NEVER hardcoded — the suggested term/year
 * are read from Step 1 and every pick targets enabled calendar cells, so
 * the flow holds no matter what day it runs on. Calendar gates are
 * refuse-by-construction, so any enabled pick is valid.
 *
 * Run targeted: `bun run test:ai -- e2e/wizard-flow.spec.ts`
 */

test.describe('ESL Semester Setup Wizard - Admin to Teacher Flow @esl-wizard', () => {
	test.use({ role: 'admin' });

	let testE2eTag: string | null = null;
	const adminEmail = 'admin@hwis.test';
	const teacherEmail = 'teacher@hwis.test';

	test.beforeEach(async () => {
		testE2eTag = null;
		// Explicit API identity (hooks run before the page fixture sets it).
		expect(useRole('admin')).toBe(true);
		await setEslRoleByEmail(adminEmail, 'admin');
		await setEslRoleByEmail(teacherEmail, 'teacher');
	});

	test.afterEach(async () => {
		try {
			if (testE2eTag) {
				await cleanupTestData(testE2eTag);
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	function stepCalendarCells(page: Page, prefix: string) {
		return page.locator(`[data-testid^="${prefix}.date-"]:not([disabled])`);
	}

	/**
	 * Ensure an exam range is set, picking the `fraction`al enabled start
	 * (0 = earliest block, 1 = latest). Skips slots that are already set —
	 * Step 3 auto-defaults Final, and re-picking would only move it.
	 */
	async function ensureExam(page: Page, slot: 'exam-1' | 'exam-2' | 'final', fraction: number) {
		if ((await page.getByTestId(`wizard.step-3-exam-${slot}`).count()) > 0) return;
		const tab = page.getByTestId(`wizard.step-3-tab-${slot}`);
		if (slot === 'final' && (await tab.getAttribute('disabled')) !== null) return;
		await tab.click();

		const cells = stepCalendarCells(page, 'wizard.step-3-calendar');
		await expect(cells.first()).toBeVisible({ timeout: 10000 });
		const count = await cells.count();
		expect(count).toBeGreaterThan(0);
		await cells.nth(Math.min(count - 1, Math.floor(count * fraction))).click();

		// Confirm dialog shows the computed range — every enabled start is
		// valid by construction (order/overflow gates disable the rest).
		await expect(page.getByTestId('wizard.step-3-confirm-dialog')).toBeVisible({
			timeout: 5000
		});
		await page.getByTestId('wizard.step-3-confirm-dialog.confirm').click();
		await expect(page.getByTestId(`wizard.step-3-exam-${slot}`)).toBeVisible({
			timeout: 5000
		});
	}

	/**
	 * Arm a Step 4 row and click enabled dates until the row shows a date.
	 * `fromEnd` walks the calendar backwards (for Block 3 rows). Returns
	 * true when the row is set.
	 */
	async function placeRow(
		page: Page,
		armTestId: string,
		rowTestId: string,
		fromEnd = false,
		budget = 60
	): Promise<boolean> {
		const row = page.getByTestId(rowTestId);
		const banner = page.getByTestId('wizard-step4.placing-banner');
		for (let round = 0; round < 3; round++) {
			const text = (await row.textContent()) ?? '';
			if (!text.includes('unset')) return true;
			if (!(await banner.isVisible())) {
				await page.getByTestId(armTestId).click();
			}
			const cells = await stepCalendarCells(page, 'wizard-step4-calendar').all();
			const seq = fromEnd ? [...cells].reverse() : cells;
			for (const cell of seq.slice(0, budget)) {
				await cell.click();
				const current = (await row.textContent()) ?? '';
				if (!current.includes('unset')) return true;
				if (!(await banner.isVisible())) break;
			}
		}
		const text = (await row.textContent()) ?? '';
		return !text.includes('unset');
	}

	async function placeRowByRole(
		page: Page,
		rowTestId: string,
		buttonName: string,
		fromEnd = false,
		budget = 60
	): Promise<boolean> {
		const row = page.getByTestId(rowTestId);
		const banner = page.getByTestId('wizard-step4.placing-banner');
		for (let round = 0; round < 3; round++) {
			const text = (await row.textContent()) ?? '';
			if (!text.includes('unset')) return true;
			if (!(await banner.isVisible())) {
				await row.getByRole('button', { name: buttonName }).click();
			}
			const cells = await stepCalendarCells(page, 'wizard-step4-calendar').all();
			const seq = fromEnd ? [...cells].reverse() : cells;
			for (const cell of seq.slice(0, budget)) {
				await cell.click();
				const current = (await row.textContent()) ?? '';
				if (!current.includes('unset')) return true;
				if (!(await banner.isVisible())) break;
			}
		}
		const text = (await row.textContent()) ?? '';
		return !text.includes('unset');
	}

	test('Admin creates suggested term via wizard → Teacher sees events in list and calendar', async ({
		page,
		browser
	}: {
		page: Page;
		browser: Browser;
	}) => {
		const tag = `e2e-wizard-s1-${getTestSuffix('wizardFlow')}`;
		testE2eTag = tag;

		// --- Admin: Navigate to wizard (tag travels in the URL for cleanup) ---
		await test.step('Admin logs in and opens wizard', async () => {
			await page.goto(`/esl/admin/semesters/new/wizard?e2eTag=${tag}`);
			await page.waitForSelector('body.hydrated');
			await expect(page.getByTestId('wizard.root')).toBeVisible();
			await expect(page.getByTestId('wizard.title')).toHaveText('Semester setup');
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 1 of 5');
		});

		// --- Step 1: read the suggestion (term + year are wall-clock derived) ---
		let term = 'S1';
		let schoolYear = '';
		await test.step('Step 1: suggested term, auto-selected start date, Confirm', async () => {
			const suggestion = await page.getByTestId('wizard.step-1-suggestion').textContent();
			term = suggestion?.includes('S2') ? 'S2' : 'S1';
			schoolYear = (await page.getByTestId('wizard.step-1-school-year').textContent()) ?? '';
			expect(schoolYear).toMatch(/\d{4}-\d{4}/);

			const startDateText = await page.getByTestId('wizard.step-1-start-date').textContent();
			expect(startDateText).not.toContain('—');

			await page.getByTestId('wizard.step-1-confirm').click();
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 2 of 5');
		});
		const dueCount = term === 'S1' ? 3 : 2;
		const mockCount = term === 'S1' ? 2 : 3;

		// --- Step 2: end date + one-click holiday import (staged, not written) ---
		await test.step('Step 2: end date, holiday import stages off days', async () => {
			const endDateText = await page.getByTestId('wizard.step-2-end-summary').textContent();
			expect(endDateText).not.toContain('—');

			// Uncheck "last exam day" so Step 3 exercises the Final range.
			await expect(page.getByTestId('wizard.step-2-last-exam-day')).toBeChecked();
			await page.getByTestId('wizard.step-2-last-exam-day').click();
			await expect(page.getByTestId('wizard.step-2-last-exam-day')).not.toBeChecked();

			await page.getByTestId('wizard.step-2-holiday.gov-preview').click();
			await expect(page.getByTestId('wizard.step-2-holiday.gov-preview-result')).toBeVisible({
				timeout: 30000
			});

			await page.getByTestId('wizard.step-2-holiday.gov-import').click();
			await expect(page.getByTestId('wizard.step-2-holiday.gov-staged')).toBeVisible({
				timeout: 5000
			});

			await page.getByTestId('wizard.next').click();
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 3 of 5');
		});

		// --- Step 3: exam ranges, spread across the term for roomy blocks ---
		await test.step('Step 3: set Exam 1, Exam 2, Final dates', async () => {
			await ensureExam(page, 'exam-1', 0.25);
			await ensureExam(page, 'exam-2', 0.5);
			await ensureExam(page, 'final', 0.75);

			await page.getByTestId('wizard.step-3-confirm').click();
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 4 of 5');
		});

		// --- Step 4: events tabs + batch-fill ---
		await test.step('Step 4: place school events and batch-fill ESL reminders', async () => {
			await expect(page.getByTestId('wizard-step4.tab-school')).toBeVisible();
			await expect(page.getByTestId('wizard-step4.tab-esl')).toBeVisible();

			expect(await placeRow(page, 'wizard-step4.sports-arm', 'wizard-step4.row-sports')).toBe(true);
			for (let m = 1; m <= mockCount; m++) {
				expect(await placeRowByRole(page, `wizard-step4.row-mock${m}`, 'Set dates')).toBe(true);
			}

			await page.getByTestId('wizard-step4.tab-esl').click();
			await page.getByTestId('wizard-step4.group-quiz').click();
			await page
				.getByTestId('wizard-step4.row-q1')
				.getByRole('button', { name: 'Set batch start' })
				.click();
			const quizCells = await stepCalendarCells(page, 'wizard-step4-calendar').all();
			expect(quizCells.length).toBeGreaterThan(0);
			await quizCells[0]!.click();
			for (let q = 1; q <= 6; q++) {
				const rowId = `wizard-step4.row-q${q}`;
				const text = (await page.getByTestId(rowId).textContent()) ?? '';
				if (text.includes('unset')) {
					expect(await placeRowByRole(page, rowId, 'Set window', q > 4)).toBe(true);
				}
			}

			await page.getByTestId('wizard-step4.group-dues').click();
			await page
				.getByTestId('wizard-step4.row-pd1')
				.getByRole('button', { name: 'Set batch start' })
				.click();
			const dueCells = await stepCalendarCells(page, 'wizard-step4-calendar').all();
			expect(dueCells.length).toBeGreaterThan(0);
			await dueCells[0]!.click();
			for (let d = 1; d <= dueCount; d++) {
				for (const prefix of ['pd', 'rd'] as const) {
					const rowId = `wizard-step4.row-${prefix}${d}`;
					const text = (await page.getByTestId(rowId).textContent()) ?? '';
					if (text.includes('unset')) {
						const late = prefix === 'rd' || d > 2;
						expect(await placeRowByRole(page, rowId, 'Set window', late)).toBe(true);
					}
				}
			}

			await page.getByTestId('wizard-step4.group-checks').click();
			expect(await placeRowByRole(page, 'wizard-step4.row-pcheck', 'Set window', true)).toBe(true);
			expect(await placeRowByRole(page, 'wizard-step4.row-wcheck', 'Set window', true)).toBe(true);

			if (term === 'S2') {
				expect(await placeRow(page, 'wizard-step4.anniv-arm', 'wizard-step4.row-anniv')).toBe(true);
				await expect(page.getByTestId('wizard-step4.row-makeup')).not.toContainText('unset');
				await page
					.getByTestId('wizard-step4.row-grad')
					.getByRole('button', { name: 'Pick date' })
					.click();
				const gradCells = await stepCalendarCells(page, 'wizard-step4-calendar').all();
				expect(gradCells.length).toBeGreaterThan(0);
				await gradCells[gradCells.length - 1]!.click();
				await expect(page.getByTestId('wizard-step4.row-grad')).not.toContainText('unset', {
					timeout: 5000
				});
			}

			await expect(page.getByTestId('wizard.next')).toBeEnabled({ timeout: 5000 });
			await page.getByTestId('wizard.next').click();
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 5 of 5');
		});

		// --- Step 5: preview, inline edit, save ---
		let semesterId = '';
		await test.step('Step 5: preview, inline edit, save', async () => {
			await expect(page.getByTestId('wizard.step-5-panel')).toBeVisible();
			const list = page.getByTestId('wizard.step-5-event-list');
			await expect(list).toContainText('Start of school');
			await expect(list).toContainText('Exam 1');
			await expect(list).toContainText('Quiz 1');

			// Inline edit: change a note, preview updates immediately.
			await page.getByRole('button', { name: /^Edit Sports Day/ }).click();
			await expect(page.getByTestId('wizard.step-5-edit-popover')).toBeVisible();
			await page.getByPlaceholder('Optional detail').fill('E2E field day');
			await page.getByRole('button', { name: 'Save changes' }).click();
			await expect(list).toContainText('E2E field day');

			await page.getByRole('button', { name: 'Save semester' }).click();
			await expect(page.getByTestId('wizard.step-5-save-success')).toBeVisible({
				timeout: 30000
			});
			const href = await page.getByTestId('wizard.step-5-semester-link').getAttribute('href');
			expect(href).toMatch(/\/esl\/admin\/semesters\/(.+)/);
			semesterId = href!.split('/').pop()!;
		});
		expect(semesterId).not.toBe('');

		// --- Teacher setup: one G7 cohort, both classes taught by the teacher ---
		await test.step('Give the teacher two classes in the new semester year', async () => {
			const teacher = (await setEslRoleByEmail(teacherEmail, 'teacher')) as unknown as {
				userId: string;
			};
			// CLIL meets 3x/week, Comm 2x/week, and the two classes of one
			// cohort need different teachers — so the teacher takes CLIL
			// from cohort 1 and Comm from cohort 2. Class order is unknown,
			// so classify each class by which schedule it accepts.
			const fullWeek: { day: EslWeekday; period: number }[] = [
				{ day: 'Monday', period: 1 },
				{ day: 'Wednesday', period: 2 },
				{ day: 'Friday', period: 3 }
			];
			const shortWeek: { day: EslWeekday; period: number }[] = [
				{ day: 'Tuesday', period: 5 },
				{ day: 'Thursday', period: 6 }
			];
			for (const [classNumber, want] of [
				['1', 'CLIL'],
				['2', 'Comm']
			] as const) {
				const cohort = await createEslCohort({
					year: schoolYear,
					grade: 7,
					level: 'Basic',
					classNumber,
					e2eTag: tag
				});
				for (const classId of cohort.classIds) {
					let kind: 'CLIL' | 'Comm';
					try {
						await setEslClassSchedule({ classId, year: schoolYear, meetings: fullWeek });
						kind = 'CLIL';
					} catch (cause) {
						if (!(cause instanceof Error) || !/2 periods a week/.test(cause.message)) {
							throw cause;
						}
						await setEslClassSchedule({ classId, year: schoolYear, meetings: shortWeek });
						kind = 'Comm';
					}
					if (kind === want) {
						await assignEslTeacher({ classId, teacherId: teacher.userId });
					}
				}
			}
		});

		// --- Teacher verification in a separate authenticated context ---
		await test.step('Teacher sees events in list and calendar', async () => {
			const teacherContext = await browser.newContext({
				storageState: 'e2e/.auth/teacher.json'
			});
			const teacherPage = await teacherContext.newPage();
			try {
				await teacherPage.goto('/esl/schedule');
				await teacherPage.waitForSelector('body.hydrated');
				const semesterPicker = teacherPage.getByTestId('esl-schedule.semester');
				if ((await semesterPicker.count()) > 0) {
					await semesterPicker.selectOption({ label: `${schoolYear} ${term}` });
				}
				await expect(teacherPage.getByTestId('esl-schedule.banner').first()).toBeVisible({
					timeout: 15000
				});
				await expect(teacherPage.getByText('Exam 1').first()).toBeVisible();
				await expect(teacherPage.getByText(/Quiz 1/).first()).toBeVisible();

				await teacherPage.goto('/esl/schedule/calendar');
				await teacherPage.waitForSelector('body.hydrated');
				await expect(teacherPage.getByTestId('teacher-calendar.root')).toBeVisible({
					timeout: 15000
				});
				await expect(teacherPage.getByText(`${term} ${schoolYear}`)).toBeVisible();
				await expect(teacherPage.getByText('Exam 1').first()).toBeVisible();
			} finally {
				await teacherContext.close();
			}
		});
	});

	test('Collision refused when placing an event on an off day', async () => {
		expect(useRole('admin')).toBe(true);
		const tag = `e2e-wizard-collision-${getTestSuffix('collision')}`;
		testE2eTag = tag;

		const created = (await createEslSemester({
			year: '2026-2027',
			term: 'S1',
			startDate: '2026-08-31',
			e2eTag: tag
		})) as unknown as string;
		await createEslEvent({
			semesterId: created,
			type: 'no_school',
			title: 'Off',
			target: 'all',
			date: '2026-10-05',
			note: 'Collision probe',
			e2eTag: tag
		});

		// NOTE: an exam create fans out *around* off days (it slides instead
		// of colliding), so the refusal case is a day-chip event on the off
		// day — the same guard the calendars enforce by disabling the cell.
		await expect(
			createEslEvent({
				semesterId: created,
				type: 'no_class',
				title: 'No class',
				target: 'all',
				date: '2026-10-05',
				note: 'Collision probe',
				e2eTag: tag
			})
		).rejects.toThrow(/already holds a no-school day/);
	});

	test('Exam move shifts the derived end, with a boundary warning past S2', async () => {
		expect(useRole('admin')).toBe(true);
		const tag = `e2e-wizard-exammove-${getTestSuffix('examMove')}`;
		testE2eTag = tag;

		const created = (await createEslSemester({
			year: '2026-2027',
			term: 'S1',
			startDate: '2026-08-31',
			e2eTag: tag
		})) as unknown as string;
		const finalIds = (await createEslEvent({
			semesterId: created,
			type: 'exam',
			title: 'Final Exam',
			target: 'all',
			date: '2027-01-18',
			e2eTag: tag
		})) as unknown as string[];
		const lastRow = finalIds[finalIds.length - 1] as string;

		const before = (await getEslSemester(created)) as unknown as { derivedEnd: string };
		expect(before.derivedEnd).toBe('2027-01-20');

		await updateEslEvent({ eventId: lastRow, date: '2027-02-15' });
		const after = (await getEslSemester(created)) as unknown as { derivedEnd: string };
		expect(after.derivedEnd).toBe('2027-02-15');

		const warning = boundaryCrossWarning({
			term: 'S1',
			type: 'exam',
			date: '2027-02-15',
			sibling: { year: '2026-2027', term: 'S2', startDate: '2027-02-11', derivedEnd: null }
		});
		expect(warning).toMatch(/stretch into S2/);
	});

	test('S2 setup shows 2 passport/recording dues with Graduation + Anniversary', async ({
		page
	}: {
		page: Page;
	}) => {
		const tag = `e2e-wizard-s2-${getTestSuffix('s2Flow')}`;
		testE2eTag = tag;

		await page.goto(`/esl/admin/semesters/new/wizard?e2eTag=${tag}`);
		await page.waitForSelector('body.hydrated');

		await page.getByTestId('wizard.step-1-term-S2').click();
		await page.getByTestId('wizard.step-1-confirm').click();
		await expect(page.getByTestId('wizard.progress')).toContainText('Step 2 of 5');

		await page.getByTestId('wizard.next').click();
		await expect(page.getByTestId('wizard.progress')).toContainText('Step 3 of 5');

		// Last-exam-day stays checked: only Exam 1 + Exam 2 required.
		await ensureExamInS2(page, 'exam-1', 0.25);
		await ensureExamInS2(page, 'exam-2', 0.5);
		await page.getByTestId('wizard.step-3-confirm').click();
		await expect(page.getByTestId('wizard.progress')).toContainText('Step 4 of 5');

		await expect(page.getByTestId('wizard-step4.row-anniv-pair')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-grad')).toBeVisible();

		await page.getByTestId('wizard-step4.tab-esl').click();
		await page.getByTestId('wizard-step4.group-dues').click();
		await expect(page.getByTestId('wizard-step4.row-pd1')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-pd2')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-pd3')).not.toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-rd1')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-rd2')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-rd3')).not.toBeVisible();
	});

	async function ensureExamInS2(page: Page, slot: 'exam-1' | 'exam-2', fraction: number) {
		const tab = page.getByTestId(`wizard.step-3-tab-${slot}`);
		await tab.click();
		const cells = stepCalendarCells(page, 'wizard.step-3-calendar');
		await expect(cells.first()).toBeVisible({ timeout: 10000 });
		const count = await cells.count();
		expect(count).toBeGreaterThan(0);
		await cells.nth(Math.min(count - 1, Math.floor(count * fraction))).click();
		await expect(page.getByTestId('wizard.step-3-confirm-dialog')).toBeVisible({
			timeout: 5000
		});
		await page.getByTestId('wizard.step-3-confirm-dialog.confirm').click();
		await expect(page.getByTestId(`wizard.step-3-exam-${slot}`)).toBeVisible({
			timeout: 5000
		});
	}
});
