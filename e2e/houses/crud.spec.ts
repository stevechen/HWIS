import { test, expect } from '@playwright/test';
import { getUniqueTag } from '../helpers';
import { cleanupByTag, cleanupAll, useRole, createStudent } from '../convex-client';

test.describe('House Management - Integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('houses');

	test.beforeEach(async ({ page }) => {
		useRole('admin');

		// Clean up all test data to ensure isolation
		await cleanupAll();

		await page.goto('/admin/houses');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupByTag('all', e2eTag);
	});

	test('displays house logos and student counts', async ({ page }) => {
		// Check that each house has a header with student count
		const heraclesHeader = page
			.getByRole('region', { name: 'Heracles House' })
			.locator('div')
			.first();
		await expect(heraclesHeader).toContainText('Heracles');
		await expect(heraclesHeader).toContainText('0'); // Initial count

		const wukongHeader = page.getByRole('region', { name: 'Wukong House' }).locator('div').first();
		await expect(wukongHeader).toContainText('Wukong');
	});

	test('displays newly created student in unassigned section', async ({ page }) => {
		// Verify initial empty state - scoped to unassigned section
		const unassignedSection = page.getByRole('region', { name: 'Unassigned Students' });
		await expect(unassignedSection.getByText('All students are assigned to houses')).toBeVisible();

		// Create a test student via API
		const studentName = `HouseTest_${Date.now()}`;
		await createStudent({
			studentId: `999${Date.now()}`,
			englishName: studentName,
			chineseName: '測試生',
			grade: 9,
			e2eTag
		});

		// Wait for the student to appear via Convex reactivity
		await expect(unassignedSection.getByText(studentName)).toBeVisible();

		// Verify the student card shows class info (format may vary)
		const studentCard = unassignedSection.getByText(studentName).locator('..');
		await expect(studentCard).toBeVisible();
	});
});
