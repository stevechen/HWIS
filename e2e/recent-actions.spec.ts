import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import { createStudent, createCategory, cleanupByTag, useRole } from './convex-client';
import { NewEvaluationPage } from './pages';

test.describe('Recent Actions - Batch', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let e2eTag: string;
	let student1Id: string;
	let student2Id: string;
	let student1Name: string;
	let student2Name: string;
	let categoryName: string;
	let testData = false;

	test.beforeEach(async () => {
		useRole('teacher');
		testData = false;
		suffix = getTestSuffix('recentActions');
		e2eTag = `e2e-test_${suffix}`;
		student1Id = `RA1_${suffix}`;
		student2Id = `RA2_${suffix}`;
		student1Name = `RAA_${suffix}`;
		student2Name = `RAB_${suffix}`;
		categoryName = `RACat_${suffix}`;

		await createCategory({ name: categoryName, e2eTag });
		await createStudent({
			studentId: student1Id,
			englishName: student1Name,
			chineseName: 'xiaoming',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		await createStudent({
			studentId: student2Id,
			englishName: student2Name,
			chineseName: 'xiaohong',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testData = true;
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('creates a batch, shows it in the panel, and edits a subset', async ({ page }) => {
		const evalsPage = new NewEvaluationPage(page);
		await evalsPage.goto();
		await expect(page.getByText('Loading students...')).not.toBeVisible();

		await evalsPage.searchStudent(student1Name.toLowerCase());
		await evalsPage.selectStudent(student1Name);
		await evalsPage.searchStudent(student2Name.toLowerCase());
		await evalsPage.selectStudent(student2Name);

		await evalsPage.selectCategory(categoryName);
		await evalsPage.selectPoint(1);
		await evalsPage.submit();
		await evalsPage.expectSubmitSuccess();

		const expand = page.getByTestId('recent-actions.expand');
		await expect(expand).toBeVisible();
		await expand.click();
		await expect(page.getByTestId('recent-actions.root')).toBeVisible();

		// The panel lists the teacher's global recent history, which parallel
		// tests also write to, so locate OUR batch by its unique category and
		// assert dialog contents instead of an absolute batch count.
		const panel = page.getByTestId('recent-actions.root');
		await panel.getByRole('button', { name: new RegExp(categoryName) }).click();

		const dialog = page.getByRole('dialog', { name: 'Edit Batch' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('checkbox', { name: new RegExp(student1Name) })).toBeVisible();
		await expect(dialog.getByRole('checkbox', { name: new RegExp(student2Name) })).toBeVisible();

		await dialog.getByRole('checkbox', { name: new RegExp(student1Name) }).click();
		await dialog.getByRole('button', { name: 'Save Changes' }).click();
		await expect(dialog).not.toBeVisible();
	});
});
