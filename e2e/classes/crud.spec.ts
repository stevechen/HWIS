import { test, expect } from '../fixtures';
import { getTestSuffix, getUniqueTag } from '../helpers';
import { cleanupByTag, useRole, createStudent, createClass } from '../convex-client';
import { AdminClassesPage } from '../pages';

test.describe('Classes CRUD', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('classCrud');
	let testDataCreated = false;
	let classesPage: AdminClassesPage;

	test.beforeEach(async ({ page }) => {
		classesPage = new AdminClassesPage(page);
		useRole('admin');
		await classesPage.goto();
		await expect(classesPage.page.getByText('G7', { exact: true })).toBeVisible();
	});

	test.afterEach(async () => {
		if (testDataCreated) {
			await cleanupByTag('all', e2eTag);
		}
	});

	test('can add a new class to a grade', async () => {
		const initialClasses = await classesPage.page.getByRole('region', { name: /Class 7/ }).count();
		const addButton = classesPage.page
			.locator('button[aria-label*="Add class to grade 7"]')
			.first();
		await expect(addButton).toBeVisible();
		await addButton.click();

		const dialog = classesPage.page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: /add class/i }).click();
		await expect(dialog).not.toBeVisible();
		await expect(
			classesPage.page.getByRole('region', { name: 'Class 7-2', exact: true })
		).toBeVisible();
		const newClasses = await classesPage.page.getByRole('region', { name: /Class 7/ }).count();
		expect(newClasses).toBeGreaterThan(initialClasses);
	});

	test('protected class "1" does not show a delete control', async () => {
		const classCard = classesPage.page.getByRole('region', {
			name: 'Class 7-1',
			exact: true
		});
		await expect(classCard).toBeVisible();
		await expect(classCard.locator('button')).toHaveCount(0);
	});

	test('protected class "IB" does not show a delete control', async () => {
		const grade11Checkbox = classesPage.page
			.locator('label')
			.filter({ hasText: '11' })
			.locator('input[type="checkbox"]');
		await grade11Checkbox.check();

		const ibToggle = classesPage.page
			.locator('button[title*="IB" i], button[aria-label*="IB" i]')
			.first();
		if (await ibToggle.isVisible()) {
			await ibToggle.click();
		}
		const classCard = classesPage.page.getByRole('region', {
			name: 'Class 11-IB',
			exact: true
		});
		await expect(classCard).toBeVisible();
		await expect(classCard.locator('button')).toHaveCount(0);
	});

	test('class with enrolled students shows warning dialog when attempting deletion', async () => {
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

		await classesPage.page.reload();
		await classesPage.page.waitForSelector('body.hydrated');
		await expect(
			classesPage.page.getByRole('region', { name: `Class 7-${className}` })
		).toBeVisible();

		const classCard = classesPage.page.getByRole('region', {
			name: `Class 7-${className}`
		});
		await expect(classCard.getByText(`TestStudent_${suffix}`)).toBeVisible();
		const deleteButton = classCard.locator('button');
		await deleteButton.click();
		await expect(
			classesPage.page.getByRole('heading', { name: 'Cannot Delete Class' })
		).toBeVisible();
		await expect(
			classesPage.page.getByText(
				'To delete this class, please first remove or reassign these students to another class.'
			)
		).toBeVisible();
	});
});
