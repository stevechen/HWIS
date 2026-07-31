import { test, expect } from '@playwright/test';
import { getUniqueTag } from '../helpers';
import { cleanupByTag, cleanupAll, useRole, createStudent } from '../convex-client';
import { AdminHousesPage } from '../pages';

test.describe('House Management - Integration', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('houses');
	let housesPage: AdminHousesPage;

	test.beforeEach(async ({ page }) => {
		housesPage = new AdminHousesPage(page);
		useRole('admin');

		await cleanupAll();

		await housesPage.goto();
	});

	test.afterEach(async () => {
		await cleanupByTag('all', e2eTag);
	});

	test('displays house logos and student counts', async () => {
		const heraclesHeader = housesPage.page
			.getByRole('region', { name: 'Heracles House' })
			.locator('div')
			.first();
		await expect(heraclesHeader).toContainText('Heracles');
		await expect(heraclesHeader).toContainText(/\d+/);

		const wukongHeader = housesPage.page
			.getByRole('region', { name: 'Wukong House' })
			.locator('div')
			.first();
		await expect(wukongHeader).toContainText('Wukong');
		await expect(wukongHeader).toContainText(/\d+/);
	});

	test('displays newly created student in unassigned section', async () => {
		const unassignedSection = housesPage.page.getByRole('region', {
			name: 'Unassigned Students'
		});

		const studentName = `HouseTest_${Date.now()}`;
		await createStudent({
			studentId: `999${Date.now()}`,
			englishName: studentName,
			chineseName: '測試生',
			grade: 9,
			e2eTag
		});

		const studentCard = unassignedSection.getByRole('button', {
			name: new RegExp(`Move ${studentName} to a house`)
		});
		await expect(studentCard).toBeVisible();
	});
});
