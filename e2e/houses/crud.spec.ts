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
		const heraclesHeader = page
			.getByRole('region', { name: 'Heracles House' })
			.locator('div')
			.first();
		await expect(heraclesHeader).toContainText('Heracles');
		await expect(heraclesHeader).toContainText(/\d+/);

		const wukongHeader = page.getByRole('region', { name: 'Wukong House' }).locator('div').first();
		await expect(wukongHeader).toContainText('Wukong');
		await expect(wukongHeader).toContainText(/\d+/);
	});

	test('displays newly created student in unassigned section', async ({ page }) => {
		const unassignedSection = page.getByRole('region', { name: 'Unassigned Students' });

		const studentName = `HouseTest_${Date.now()}`;
		await createStudent({
			studentId: `999${Date.now()}`,
			englishName: studentName,
			chineseName: '測試生',
			grade: 9,
			e2eTag
		});

		const studentCard = unassignedSection.getByRole('button', {
			name: new RegExp(`Drag ${studentName} to assign to a house`)
		});
		await expect(studentCard).toBeVisible();
	});
});
