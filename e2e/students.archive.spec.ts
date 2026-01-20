import { test, expect } from '@playwright/test';
import { getTestSuffix, cleanupE2EData } from './students.shared';
import { seedBaseline, createStudent } from './convex-client';

test.describe('Archive & Reset Page', () => {
	test.beforeEach(async ({ page }) => {
		// Set test auth cookie with admin role
		await page.context().addCookies([
			{
				name: 'hwis_test_auth',
				value: 'admin',
				domain: 'localhost',
				path: '/',
				expires: -1,
				httpOnly: false,
				secure: false,
				sameSite: 'Lax'
			}
		]);

		// Wait for hydration
		await page.goto('http://localhost:5173/');
		await page.waitForSelector('body.hydrated');

		// Seed test data
		await seedBaseline();
	});

	test.afterEach(async ({ page }) => {
		await cleanupE2EData(page, 'archive');
	});

	test('page loads and shows correct heading', async ({ page }) => {
		await page.goto('http://localhost:5173/admin/academic');
		await page.waitForSelector('body.hydrated');

		const url = page.url();
		expect(url).toContain('/admin/academic');

		await expect(page.getByRole('heading', { name: /Year-End Reset/i })).toBeVisible();
	});

	test('shows advance academic year section', async ({ page }) => {
		await page.goto('http://localhost:5173/admin/academic');
		await page.waitForSelector('body.hydrated');

		// Check if we're on the right page
		await expect(page.getByRole('heading', { name: /Year-End Reset/i })).toBeVisible();

		await expect(page.getByText(/Advance Academic Year/i)).toBeVisible();
	});

	test('shows advance year button', async ({ page }) => {
		await page.goto('http://localhost:5173/admin/academic');
		await page.waitForSelector('body.hydrated');

		const advanceButton = page.getByRole('button', { name: /Advance/i });
		await expect(advanceButton.first()).toBeVisible();
	});

	test('can create student for archive testing', async ({ page }) => {
		const suffix = getTestSuffix('archiveCreate');
		const studentId = `S_${suffix}`;
		const englishName = `Archive_${suffix}`;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);
		await expect(page.getByRole('row', { name: englishName })).toBeVisible();
	});

	test('can set student to Not Enrolled', async ({ page }) => {
		const suffix = getTestSuffix('disableCheck');
		const studentId = `S_${suffix}`;
		const englishName = `DisableCheck_${suffix}`;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');

		await createStudent({
			studentId,
			englishName,
			grade: 10,
			status: 'Enrolled',
			e2eTag: `e2e-test_${suffix}`
		});

		await page.getByPlaceholder('Search by name or student ID...').fill(englishName);

		await page
			.getByRole('row', { name: englishName })
			.getByRole('button', { name: new RegExp(`^Set ${englishName} to not enrolled$`) })
			.click();
		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect(
			page.getByRole('row', { name: englishName }).getByText('Not Enrolled')
		).toBeVisible();
	});
});
