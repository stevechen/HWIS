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
import type { EslWeekday } from '../src/lib/e2e-utils';
import { getTestSuffix } from './helpers';

/**
 * Full wizard flow (ticket #225, spec #215): admin drives the real 5-step
 * wizard to create a semester, then a teacher sees the events in the list
 * and calendar views.
 *
 * Date strategy: the wizard flow NEVER hardcodes dates — the suggested
 * term/year are read from Step 1 and every pick targets enabled calendar
 * cells (gates are refuse-by-construction, so any enabled pick is valid).
 * The backend probes below use fixed 2026-2027 fixtures instead: they
 * bypass the wizard UI entirely, so wall-clock independence holds by
 * construction there too.
 *
 * Run targeted: `bun run test:ai -- e2e/wizard-flow.spec.ts`
 */

test.describe('ESL Semester Setup Wizard - Admin to Teacher Flow @esl-wizard @sequential @hwis @esl', () => {
	// The end-to-end walk (five steps, a teacher pass, list + calendar) runs
	// well past the global 30s budget on CI hardware; a timeout mid-save is
	// worse than slow, because the semester it wrote then blocks the retry
	// with "already exists".
	test.describe.configure({ timeout: 120_000 });

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
		const row = page.getByTestId(`wizard.step-3-exam-${slot}`);
		await expect(row).toBeVisible({ timeout: 5000 });
		// Fan-out: 2 class days for Exam 1/2, 3 for Final.
		const commas = ((await row.textContent()) ?? '').split(',').length - 1;
		expect(commas).toBe(slot === 'final' ? 2 : 1);
	}

	/**
	 * Arm a Step 4 row and click enabled dates until the row shows a date.
	 * `arm` is either a button testid or a {row, button name} pair;
	 * `fromEnd` walks the calendar backwards (for Block 3 rows).
	 */
	async function placeRow(
		page: Page,
		rowTestId: string,
		arm: { testid: string } | { row: string; button: string },
		fromEnd = false,
		budget = 60
	): Promise<boolean> {
		const row = page.getByTestId(rowTestId);
		const banner = page.getByTestId('wizard-step4.placing-banner');
		const armIt = async () => {
			if ('testid' in arm) {
				await page.getByTestId(arm.testid).click();
			} else {
				await page.getByTestId(arm.row).getByRole('button', { name: arm.button }).click();
			}
		};
		for (let round = 0; round < 3; round++) {
			const text = (await row.textContent()) ?? '';
			if (!text.includes('unset')) return true;
			if (!(await banner.isVisible())) {
				await armIt();
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
			schoolYear = (
				(await page.getByTestId('wizard.step-1-school-year').textContent()) ?? ''
			).trim();
			expect(schoolYear).toMatch(/^\d{4}-\d{4}$/);

			const startDateText = await page.getByTestId('wizard.step-1-start-date').textContent();
			expect(startDateText).not.toContain('—');

			await page.getByTestId('wizard.step-1-confirm').click();
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 2 of 5');
		});
		const dueCount = term === 'S1' ? 3 : 2;
		const mockCount = term === 'S1' ? 2 : 3;

		// --- Step 2: end date + one-click holiday import (staged, not written) ---
		let stagedOffDate = '';
		await test.step('Step 2: end date, holiday import stages off days', async () => {
			const endDateText = await page.getByTestId('wizard.step-2-end-summary').textContent();
			expect(endDateText).not.toContain('—');

			// The Step-2 "last exam day" toggle was retired; the Final range is derived.

			await page.getByTestId('wizard.step-2-holiday.gov-preview').click();
			await expect(page.getByTestId('wizard.step-2-holiday.gov-preview-result')).toBeVisible({
				timeout: 30000
			});

			await page.getByTestId('wizard.step-2-holiday.gov-import').click();
			const staged = page.getByTestId('wizard.step-2-holiday.gov-staged');
			await expect(staged).toBeVisible({ timeout: 5000 });
			// At least one off day staged (a bare "0 off days" would be vacuous).
			await expect(staged).toContainText(/[1-9][0-9]* off day/);
			await expect(page.getByTestId('wizard.step-2-event-list')).toContainText('Off day');

			// Remember one staged off day for the Step 4 collision check
			// (the -list container shares the prefix, so anchor on the year).
			const firstItem = page.locator('[data-testid^="wizard.step-2-event-2"]').first();
			stagedOffDate = ((await firstItem.getAttribute('data-testid')) ?? '').split(
				'wizard.step-2-event-'
			)[1] as string;
			expect(stagedOffDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

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

			// Collision refused in form: the staged off day is unclickable.
			await page.getByTestId('wizard-step4.sports-arm').click();
			await expect(page.getByTestId(`wizard-step4-calendar.date-${stagedOffDate}`)).toBeDisabled();

			expect(
				await placeRow(page, 'wizard-step4.row-sports', { testid: 'wizard-step4.sports-arm' })
			).toBe(true);
			for (let m = 1; m <= mockCount; m++) {
				expect(
					await placeRow(page, `wizard-step4.row-mock${m}`, {
						row: `wizard-step4.row-mock${m}`,
						button: 'Set dates'
					})
				).toBe(true);
			}

			await page.getByTestId('wizard-step4.tab-esl').click();
			for (let q = 1; q <= 6; q++) {
				const rowId = `wizard-step4.row-q${q}`;
				expect(await placeRow(page, rowId, { row: rowId, button: 'Set window' }, q > 4)).toBe(true);
			}

			for (let d = 1; d <= dueCount; d++) {
				for (const prefix of ['pd', 'rd'] as const) {
					const rowId = `wizard-step4.row-${prefix}${d}`;
					// Use late placement for pd2+ and all rd to avoid windows crossing exams
					const late = prefix === 'rd' || d >= 2;
					expect(await placeRow(page, rowId, { row: rowId, button: 'Set window' }, late)).toBe(
						true
					);
				}
			}

			expect(
				await placeRow(
					page,
					'wizard-step4.row-pcheck',
					{ row: 'wizard-step4.row-pcheck', button: 'Set window' },
					true
				)
			).toBe(true);
			expect(
				await placeRow(
					page,
					'wizard-step4.row-wcheck',
					{ row: 'wizard-step4.row-wcheck', button: 'Set window' },
					true
				)
			).toBe(true);

			if (term === 'S2') {
				expect(
					await placeRow(page, 'wizard-step4.row-anniv', { testid: 'wizard-step4.anniv-arm' })
				).toBe(true);
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

			// ESL row counts: 6 quizzes + dues + 2 checks in every term.
			await expect(page.locator('[data-testid^="wizard-step4.row-q"]')).toHaveCount(6);
			await expect(
				page.locator('[data-testid^="wizard-step4.row-pd"], [data-testid^="wizard-step4.row-rd"]')
			).toHaveCount(dueCount * 2);

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
			// Rows are one line now, so the note is not printed in the list;
			// reopen the row and read the note back from the popover.
			await page.getByRole('button', { name: /^Edit Sports Day/ }).click();
			await expect(page.getByPlaceholder('Optional detail')).toHaveValue('E2E field day');
			await page
				.getByTestId('wizard.step-5-edit-popover')
				.getByRole('button', { name: 'Cancel' })
				.click();

			await page.getByRole('button', { name: 'Save semester' }).click();
			await expect(page.getByTestId('wizard.step-5-save-success')).toBeVisible({
				timeout: 30000
			});
			const href = await page.getByTestId('wizard.step-5-semester-link').getAttribute('href');
			expect(href).toMatch(/\/esl\/admin\/semesters\/(.+)/);
			semesterId = href!.split('/').pop()!;
		});
		expect(semesterId).not.toBe('');

		// --- Teacher setup: CLIL from cohort 1 + Comm from cohort 2 ---
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
				// Day rows prove the class linkage; banners prove due collapse.
				const rows = teacherPage.getByTestId('esl-schedule.row');
				await expect(rows.first()).toBeVisible({ timeout: 15000 });
				expect(await rows.count()).toBeGreaterThan(0);
				const banners = teacherPage.getByTestId('esl-schedule.banner');
				expect(await banners.count()).toBeGreaterThanOrEqual(2);
				await expect(teacherPage.getByText('Exam 1').first()).toBeVisible();
				await expect(teacherPage.getByText('Exam 2').first()).toBeVisible();
				await expect(teacherPage.getByText(/Quiz 1/).first()).toBeVisible();

				await teacherPage.goto('/esl/schedule/calendar');
				await teacherPage.waitForSelector('body.hydrated');
				await expect(teacherPage.getByTestId('teacher-calendar.root')).toBeVisible({
					timeout: 15000
				});
				await expect(teacherPage.getByText(`${term} ${schoolYear}`)).toBeVisible();
				await expect(teacherPage.getByText('Exam 1').first()).toBeVisible();
				await expect(teacherPage.getByText(/Quiz 1/).first()).toBeVisible();
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
			year: '2098-2099',
			term: 'S1',
			startDate: '2098-08-31',
			e2eTag: tag
		})) as unknown as string;
		await createEslEvent({
			semesterId: created,
			type: 'no_school',
			title: 'Off',
			target: 'all',
			date: '2098-10-05',
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
				date: '2098-10-05',
				note: 'Collision probe',
				e2eTag: tag
			})
		).rejects.toThrow(/already holds a no-school day/);
	});

	test('Exam move shifts the derived end, and an S2 cross stays advisory', async ({
		page
	}: {
		page: Page;
	}) => {
		expect(useRole('admin')).toBe(true);
		const tag = `e2e-wizard-exammove-${getTestSuffix('examMove')}`;
		testE2eTag = tag;

		// A late year keeps this semester in the first page of `semesters.list`
		// (ordered newest-first) even when the suite has created many fixtures.
		const year = '2099-2100';
		const created = (await createEslSemester({
			year,
			term: 'S1',
			startDate: '2099-08-31',
			e2eTag: tag
		})) as unknown as string;
		await createEslSemester({
			year,
			term: 'S2',
			startDate: '2100-02-11',
			e2eTag: tag
		});
		const finalIds = (await createEslEvent({
			semesterId: created,
			type: 'exam',
			title: 'Final Exam',
			target: 'all',
			date: '2100-01-18',
			e2eTag: tag
		})) as unknown as string[];
		const lastRow = finalIds[finalIds.length - 1] as string;

		// The edit wizard is the semester detail page: it should load the saved
		// events for the friendly slug.
		await page.goto(`/esl/admin/semesters/${year}-S1`);
		await page.waitForSelector('body.hydrated');
		const eventList = page.getByTestId('wizard.step-5-event-list');
		await expect(eventList).toBeVisible({ timeout: 20000 });
		// Exams render under their short label ("Final 1/18–1/20").
		await expect(eventList.getByRole('button', { name: /Edit Final on/ })).toBeVisible({
			timeout: 15000
		});

		const before = (await getEslSemester(created)) as unknown as { derivedEnd: string | null };
		expect(before.derivedEnd).not.toBeNull();

		// Moving Exam 1 inside the window never moves the derived end.
		const exam1Ids = (await createEslEvent({
			semesterId: created,
			type: 'exam',
			title: 'Exam 1',
			target: 'all',
			date: '2099-11-02',
			e2eTag: tag
		})) as unknown as string[];
		const exam1Last = exam1Ids[exam1Ids.length - 1] as string;
		await updateEslEvent({ eventId: exam1Last, date: '2099-11-20' });
		const mid = (await getEslSemester(created)) as unknown as { derivedEnd: string };
		expect(mid.derivedEnd).toBe(before.derivedEnd);

		// Moving the final exam past the S1/S2 boundary is advisory only: the
		// move lands (no refusal) and drags the derived end out with it.
		await updateEslEvent({ eventId: lastRow, date: '2100-02-15' });
		const after = (await getEslSemester(created)) as unknown as { derivedEnd: string };
		expect(after.derivedEnd).toBe('2100-02-15');
	});

	test('S2 setup shows 2 passport/recording dues with Graduation + Anniversary', async ({
		page
	}: {
		page: Page;
	}) => {
		const tag = `e2e-wizard-s2-${getTestSuffix('s2Flow')}`;
		testE2eTag = tag;

		// S2 comes after a real S1 (sibling context for windows + gates).
		await createEslSemester({
			year: '2097-2098',
			term: 'S1',
			startDate: '2097-08-31',
			e2eTag: tag
		});

		await page.goto(`/esl/admin/semesters/new/wizard?e2eTag=${tag}`);
		await page.waitForSelector('body.hydrated');

		await page.getByTestId('wizard.step-1-term-S2').click();
		await page.getByTestId('wizard.step-1-confirm').click();
		await expect(page.getByTestId('wizard.progress')).toContainText('Step 2 of 5');

		await page.getByTestId('wizard.next').click();
		await expect(page.getByTestId('wizard.progress')).toContainText('Step 3 of 5');

		// Last-exam-day stays checked: only Exam 1 + Exam 2 required.
		await ensureExam(page, 'exam-1', 0.25);
		await ensureExam(page, 'exam-2', 0.5);
		await page.getByTestId('wizard.step-3-confirm').click();
		await expect(page.getByTestId('wizard.progress')).toContainText('Step 4 of 5');

		await expect(page.getByTestId('wizard-step4.row-anniv-pair')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-grad')).toBeVisible();

		await page.getByTestId('wizard-step4.tab-esl').click();
		await expect(page.getByTestId('wizard-step4.row-pd1')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-pd2')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-pd3')).not.toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-rd1')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-rd2')).toBeVisible();
		await expect(page.getByTestId('wizard-step4.row-rd3')).not.toBeVisible();
		await expect(
			page.locator('[data-testid^="wizard-step4.row-pd"], [data-testid^="wizard-step4.row-rd"]')
		).toHaveCount(4);
	});
});
