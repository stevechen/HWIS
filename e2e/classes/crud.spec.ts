import { test, expect } from '@playwright/test';
import { getTestSuffix, getUniqueTag } from '../helpers';
import { cleanupByTag, useRole, createStudent, createClass } from '../convex-client';

test.describe('Classes CRUD', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('classCrud');
	let testDataCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/classes');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('G7', { exact: true })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testDataCreated) {
			await cleanupByTag('all', e2eTag);
		}
	});

	test('can add a new class to a grade', async ({ page }) => {
		const initialClasses = await page.getByRole('region', { name: /Class 7/ }).count();
		const addButton = page.locator('button[aria-label*="Add class to grade 7"]').first();
		await expect(addButton).toBeVisible();
		await addButton.click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /add class/i }).click();
		await expect(dialog).not.toBeVisible({ timeout: 15000 });
		await expect(page.getByRole('region', { name: 'Class 7-2', exact: true })).toBeVisible({
			timeout: 15000
		});
		const newClasses = await page.getByRole('region', { name: /Class 7/ }).count();
		expect(newClasses).toBeGreaterThan(initialClasses);
	});

	test('protected class "1" does not show a delete control', async ({ page }) => {
		const classCard = page.getByRole('region', { name: 'Class 7-1', exact: true });
		await expect(classCard).toBeVisible();
		await expect(classCard.getByRole('button')).toHaveCount(0);
	});

	test('protected class "IB" does not show a delete control', async ({ page }) => {
		const ibToggle = page.locator('button[title*="IB" i], button[aria-label*="IB" i]').first();
		if (await ibToggle.isVisible()) {
			await ibToggle.click();
		}
		const classCard = page.getByRole('region', { name: 'Class 7-IB', exact: true });
		await expect(classCard).toBeVisible();
		await expect(classCard.getByRole('button')).toHaveCount(0);
	});

	test('class with enrolled students shows warning dialog when attempting deletion', async ({
		page
	}) => {
		const className = `9${Date.now().toString().slice(-4)}`;
		await createClass({ grade: 7, class: className, e2eTag });
		const suffix = getTestSuffix('classDelTest');
		await createStudent({
			studentId: '7001001',
			englishName: `TestStudent_${suffix}`,
			grade: 7,
			class: className,
			e2eTag
		});
		testDataCreated = true;

		await page.reload();
		await page.waitForSelector('body.hydrated');
		await expect(page.getByRole('region', { name: `Class 7-${className}` })).toBeVisible({
			timeout: 15000
		});

		const studentToggleBtn = page.locator('button[aria-label*="student lists" i]').first();
		await studentToggleBtn.click();
		const classCard = page.getByRole('region', { name: `Class 7-${className}` });
		await expect(classCard.getByText(`TestStudent_${suffix}`)).toBeVisible({ timeout: 15000 });
		const deleteButton = classCard.getByRole('button').first();
		await deleteButton.click();
		await expect(page.getByRole('heading', { name: 'Cannot Delete Class' })).toBeVisible();
		await expect(
			page.getByText(
				'To delete this class, please first remove or reassign these students to another class.'
			)
		).toBeVisible();
	});
});
