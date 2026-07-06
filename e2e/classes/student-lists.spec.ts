import { test, expect } from '@playwright/test';
import { getTestSuffix, getUniqueTag } from '../helpers';
import { cleanupByTag, useRole, createStudent } from '../convex-client';

test.describe('Student List Visibility', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('studentLists');
	let testDataCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/classes');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testDataCreated) {
			await cleanupByTag('students', e2eTag);
		}
	});

	test('student lists visible by default', async ({ page }) => {
		// The toggle should show "Hide Students" since lists are visible by default
		const toggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await expect(toggleBtn).toBeVisible();
		await expect(toggleBtn).toContainText('Hide Students');

		// Grade 7 classes should show student list regions
		const classRegions = page.getByRole('region', { name: /Class 7/ });
		await expect(classRegions.first()).toBeVisible();
	});

	test('can toggle global student list visibility', async ({ page }) => {
		const toggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await expect(toggleBtn).toBeVisible();

		const initialText = await toggleBtn.textContent();

		await toggleBtn.click();
		await page.waitForTimeout(200);

		const newText = await toggleBtn.textContent();
		expect(newText).not.toBe(initialText);
	});

	test('student names displayed in list when visible', async ({ page }) => {
		const suffix = getTestSuffix('list');
		await createStudent({
			studentId: '7001001',
			englishName: `ListTest_${suffix}`,
			grade: 7,
			class: '1',
			e2eTag
		});
		testDataCreated = true;

		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Students are already visible by default
		await expect(page.getByText(`ListTest_${suffix}`)).toBeVisible({ timeout: 15000 });
	});
});
