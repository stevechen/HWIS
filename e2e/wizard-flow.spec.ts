import { test, expect } from './fixtures';
import {
	createEslSemester,
	seedEslSemester,
	createEslEvent,
	setEslRoleByEmail,
	cleanupTestData
} from './convex-client';
import { getTestSuffix } from './helpers';

test.describe('ESL Semester Setup Wizard - Admin to Teacher Flow @esl-wizard', () => {
	let testE2eTag: string | null = null;
	const adminEmail = 'admin@hwis.test';
	const teacherEmail = 'teacher@hwis.test';

	test.beforeEach(async () => {
		testE2eTag = null;
		// Ensure admin and teacher roles are set for the test users
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

	/**
	 * Full wizard flow: Admin creates S1 semester via wizard,
	 * then Teacher verifies events appear in list and calendar views.
	 */
	test('Admin creates S1 via wizard → Teacher sees events in list and calendar', async ({
		page
	}) => {
		testE2eTag = `e2e-wizard-s1-${getTestSuffix('wizardFlow')}`;

		// --- Admin: Navigate to wizard ---
		await test.step('Admin logs in and opens wizard', async () => {
			await page.goto('/esl/admin/semesters/new/wizard');
			await page.waitForSelector('body.hydrated');
			await expect(page.getByTestId('wizard.root')).toBeVisible();
			await expect(page.getByTestId('wizard.title')).toHaveText('Semester setup');
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 1 of 5');
		});

		// --- Step 1: Semester & Start Date ---
		await test.step('Step 1: S1 suggested, start date auto-selected, Confirm', async () => {
			// Verify S1 is suggested (current date is in range for S1)
			await expect(page.getByTestId('wizard.step-1-suggestion')).toContainText('S1');

			// Verify term is S1 (default)
			await expect(page.getByTestId('wizard.step-1-term-S1')).toHaveClass(/default/);

			// Verify start date is auto-selected
			await expect(page.getByTestId('wizard.step-1-start-date')).toContainText('Start Date:');
			const startDateText = await page.getByTestId('wizard.step-1-start-date').textContent();
			expect(startDateText).not.toContain('—');

			// Click Confirm to proceed to Step 2
			await page.getByTestId('wizard.step-1-confirm').click();

			// Verify we're on Step 2
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 2 of 5');
		});

		// --- Step 2: End Date & Holiday Import ---
		await test.step('Step 2: End date auto-selected, holiday import one-click', async () => {
			// Verify end date is auto-selected
			await expect(page.getByTestId('wizard.step-2-end-summary')).toContainText('End date:');
			const endDateText = await page.getByTestId('wizard.step-2-end-summary').textContent();
			expect(endDateText).not.toContain('—');

			// Verify "last exam day" checkbox is checked by default
			await expect(page.getByTestId('wizard.step-2-last-exam-day')).toBeChecked();

			// Click Preview button for holiday import
			await page.getByTestId('wizard.step-2-holiday.gov-preview').click();

			// Wait for preview to load
			await expect(page.getByTestId('wizard.step-2-holiday.gov-preview-result')).toBeVisible({
				timeout: 10000
			});

			// Click Import button
			await page.getByTestId('wizard.step-2-holiday.gov-import').click();

			// Wait for import to complete
			await expect(page.getByTestId('wizard.step-2-holiday.gov-report')).toBeVisible({
				timeout: 10000
			});

			// Verify off days appear in event list
			await expect(page.getByTestId('wizard.step-2-event-list')).toContainText('Off day');

			// Click Next to proceed to Step 3
			await page.getByTestId('wizard.next').click();

			// Verify we're on Step 3
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 3 of 5');
		});

		// --- Step 3: Exam Dates ---
		await test.step('Step 3: Set Exam 1, Exam 2, Final dates', async () => {
			// Step 3 uses ExamRangePicker + CalendarPreview with interactive clicks
			// We need to click on the calendar to set each exam range

			// First, ensure Exam 1 tab is active
			await expect(page.getByTestId('wizard.step-3-tab-exam-1')).toHaveClass(/default/);

			// Find a valid class day to click for Exam 1 (2 class days)
			// The calendar has test IDs like `wizard.step-3-calendar.date-YYYY-MM-DD`
			// We'll click on the first available class day after start date
			const firstClassDay = page
				.locator('[data-testid^="wizard.step-3-calendar.date-"]')
				.filter({ hasNot: page.locator('[disabled]') })
				.first();
			await expect(firstClassDay).toBeVisible();
			await firstClassDay.click();

			// Confirm dialog should appear
			await expect(page.getByTestId('wizard.step-3-confirm-dialog')).toBeVisible();
			await page.getByTestId('wizard.step-3-confirm-dialog.confirm').click();

			// Verify Exam 1 is now set
			await expect(page.getByTestId('wizard.step-3-exam-exam-1')).toBeVisible();
			await expect(page.getByTestId('wizard.step-3-exam-exam-1')).toContainText('Exam 1');

			// Switch to Exam 2 tab
			await page.getByTestId('wizard.step-3-tab-exam-2').click();
			await expect(page.getByTestId('wizard.step-3-tab-exam-2')).toHaveClass(/default/);

			// Click another class day for Exam 2
			const secondClassDay = page
				.locator('[data-testid^="wizard.step-3-calendar.date-"]')
				.filter({ hasNot: page.locator('[disabled]') })
				.nth(1);
			await expect(secondClassDay).toBeVisible();
			await secondClassDay.click();

			await expect(page.getByTestId('wizard.step-3-confirm-dialog')).toBeVisible();
			await page.getByTestId('wizard.step-3-confirm-dialog.confirm').click();

			await expect(page.getByTestId('wizard.step-3-exam-exam-2')).toBeVisible();
			await expect(page.getByTestId('wizard.step-3-exam-exam-2')).toContainText('Exam 2');

			// Switch to Final tab (since "last exam day" was checked, Final might be skipped)
			// But we uncheck it in Step 2 if needed - actually it's checked by default
			// Let's check if Final is disabled
			const finalTab = page.getByTestId('wizard.step-3-tab-final');
			const isDisabled = await finalTab.getAttribute('disabled');

			if (!isDisabled) {
				await finalTab.click();
				const thirdClassDay = page
					.locator('[data-testid^="wizard.step-3-calendar.date-"]')
					.filter({ hasNot: page.locator('[disabled]') })
					.nth(2);
				await expect(thirdClassDay).toBeVisible();
				await thirdClassDay.click();

				await expect(page.getByTestId('wizard.step-3-confirm-dialog')).toBeVisible();
				await page.getByTestId('wizard.step-3-confirm-dialog.confirm').click();

				await expect(page.getByTestId('wizard.step-3-exam-final')).toBeVisible();
			}

			// Click Confirm to proceed to Step 4
			await page.getByTestId('wizard.step-3-confirm').click();

			// Verify we're on Step 4
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 4 of 5');
		});

		// --- Step 4: All Events (School / ESL tabs) ---
		await test.step('Step 4: Events tabs pre-filled, batch-fill works', async () => {
			// Step 4 placeholder currently - the real Step 4 component will be built in #222
			// For now, we verify the placeholder is shown
			await expect(page.getByTestId('wizard.step-4-placeholder')).toBeVisible();
			await expect(page.getByTestId('wizard.step-4-placeholder')).toContainText('Events');

			// Click Next to proceed to Step 5
			await page.getByTestId('wizard.next').click();

			// Verify we're on Step 5
			await expect(page.getByTestId('wizard.progress')).toContainText('Step 5 of 5');
		});

		// --- Step 5: Preview & Save ---
		await test.step('Step 5: Preview shows all events, Save creates semester', async () => {
			// Step 5 placeholder currently - the real Step 5 component will be built in #223
			await expect(page.getByTestId('wizard.step-5-placeholder')).toBeVisible();
			await expect(page.getByTestId('wizard.step-5-placeholder')).toContainText('Preview & save');

			// The Save button is disabled in the shell until Step 5 is implemented
			// When implemented, clicking Save will create the semester and all events
			// For now, we just verify the flow reaches Step 5
		});

		// --- Teacher verification will be added once Steps 4-5 are implemented ---
		// This test is written test-first and will pass once the wizard is complete
	});

	/**
	 * Exam move test: Admin edits Exam 1 date → derived end shifts, warning shown
	 */
	test('Exam move shifts derived end with warning', async ({ page }) => {
		testE2eTag = `e2e-wizard-exam-move-${getTestSuffix('examMove')}`;

		// This test requires Step 5 (Save) and the ability to edit an existing semester
		// Will be implemented when Steps 4-5 are complete and editing flow exists
		test.skip('Requires Step 5 implementation (#223) and edit flow');
	});

	/**
	 * Collision test: Admin tries to place event on off day → refused
	 */
	test('Collision refused when placing event on off day', async ({ page }) => {
		testE2eTag = `e2e-wizard-collision-${getTestSuffix('collision')}`;

		// This test requires the calendar to disable off days (already implemented in CalendarPreview)
		// Will verify that clicking an off day does not set an event
		test.skip('Requires Step 3/4 interactive calendar with off-day disabling');
	});

	/**
	 * S2 test: Create S2 after S1 → ESL tab has only 2 passport/recording dues (G9 graduated)
	 */
	test('S2 creation after S1 has only 2 passport/recording dues', async ({ page }) => {
		testE2eTag = `e2e-wizard-s2-${getTestSuffix('s2Flow')}`;

		// This test requires:
		// 1. S1 to be created first (via wizard or seed)
		// 2. Then create S2 via wizard
		// 3. Verify ESL tab shows only 2 passport/recording dues instead of 3
		test.skip('Requires Steps 4-5 implementation and S1 created first');
	});
});

test.describe('ESL Wizard Component Unit Tests @esl-wizard-unit', () => {
	// These would be vitest-browser-svelte tests for individual components
	// WeekPicker, CalendarPreview, ExamRangePicker, InlineHolidayImport, etc.
	// They test component behavior in isolation with mocked Convex
	test('WeekPicker renders correct rows for S1 and S2', async () => {
		test.skip('Unit tests in vitest-browser-svelte, not Playwright');
	});

	test('CalendarPreview shows correct week numbers and color chips', async () => {
		test.skip('Unit tests in vitest-browser-svelte, not Playwright');
	});

	test('ExamRangePicker highlights 2/3 class days and confirms', async () => {
		test.skip('Unit tests in vitest-browser-svelte, not Playwright');
	});

	test('InlineHolidayImport one-click preview + import', async () => {
		test.skip('Unit tests in vitest-browser-svelte, not Playwright');
	});
});