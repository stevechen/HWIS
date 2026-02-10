import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudent, cleanupByTag, useRole } from './convex-client';

test.describe('Student List @students', () => {
	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test.describe('Access Control', () => {
		test('redirects non-admin users from /admin/students', async ({ page }) => {
			// Use 'commit' to handle immediate redirect without waiting for full load
			await page.goto('/admin/students', { waitUntil: 'commit' });
			await expect(page).toHaveURL(/\/|\/login/);
		});
	});
});

test.describe('Student List - Display @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('listTest');
	const studentId = `S_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createStudent({
			studentId,
			englishName: `Student1_${suffix}`,
			chineseName: '學生1',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testCreated = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCreated) await cleanupByTag('students', e2eTag);
	});

	test('displays list of created students', async ({ page }) => {
		await expect(page.getByRole('row', { name: `Student1_${suffix}` })).toBeVisible();
	});
});

test.describe('Student List - Filter by Grade @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('filterGrade');
	const e2eTag = `e2e-test_${suffix}`;
	let testCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createStudent({
			studentId: `S9_${suffix}`,
			englishName: `Grade9_${suffix}`,
			chineseName: '九年級',
			grade: 9,
			status: 'Enrolled',
			e2eTag: e2eTag
		});

		await createStudent({
			studentId: `S10_${suffix}`,
			englishName: `Grade10_${suffix}`,
			chineseName: '十年級',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testCreated = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCreated) await cleanupByTag('students', e2eTag);
	});

	test('can filter students by grade', async ({ page }) => {
		const gradeSelect = page.getByRole('combobox', { name: 'Filter by grade' });
		await gradeSelect.selectOption('9');

		await expect(page.getByRole('row', { name: `Grade9_${suffix}` })).toBeVisible();
		await expect(page.getByRole('row', { name: `Grade10_${suffix}` })).not.toBeVisible();
	});
});

test.describe('Student List - Filter by Status @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('filterStatus');
	const e2eTag = `e2e-test_${suffix}`;
	let testCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createStudent({
			studentId: `SE_${suffix}`,
			englishName: `Enrolled_${suffix}`,
			chineseName: '在讀',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});

		await createStudent({
			studentId: `SNE_${suffix}`,
			englishName: `NotEnr_${suffix}`,
			chineseName: '不在讀',
			grade: 10,
			status: 'Not Enrolled',
			e2eTag: e2eTag
		});
		testCreated = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCreated) await cleanupByTag('students', e2eTag);
	});

	test('can filter students by status', async ({ page }) => {
		const statusSelect = page.getByRole('combobox', { name: 'Filter by status' });
		await statusSelect.selectOption('Enrolled');

		await expect(page.getByRole('row', { name: `Enrolled_${suffix}` })).toBeVisible();
		await expect(page.getByRole('row', { name: `NotEnr_${suffix}` })).not.toBeVisible();
	});
});

test.describe('Student List - Search by Name @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('searchName');
	const e2eTag = `e2e-test_${suffix}`;
	let testCreated = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createStudent({
			studentId: `ST_${suffix}`,
			englishName: `TargetName_${suffix}`,
			chineseName: '目標學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});

		await createStudent({
			studentId: `SO_${suffix}`,
			englishName: `OtherName_${suffix}`,
			chineseName: '其他學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testCreated = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testCreated) await cleanupByTag('students', e2eTag);
	});

	test('can search students by name', async ({ page }) => {
		await page.getByRole('textbox', { name: 'Search students' }).fill(`TargetName_${suffix}`);

		await expect(page.getByRole('row', { name: `TargetName_${suffix}` })).toBeVisible();
		await expect(page.getByRole('row', { name: `OtherName_${suffix}` })).not.toBeVisible();
	});
});

test.describe('Student List - Search by ID @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('searchId');
	const targetId = `STID_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudents = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createStudent({
			studentId: targetId,
			englishName: `StudentA_${suffix}`,
			chineseName: '學生A',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});

		await createStudent({
			studentId: `SOID_${suffix}`,
			englishName: `StudentB_${suffix}`,
			chineseName: '學生B',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudents = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testStudents) await cleanupByTag('students', e2eTag);
	});

	test('can search students by student ID', async ({ page }) => {
		await page.getByRole('textbox', { name: 'Search students' }).fill(targetId);

		await expect(page.getByRole('row', { name: `StudentA_${suffix}` })).toBeVisible();
		await expect(page.getByRole('row', { name: `StudentB_${suffix}` })).not.toBeVisible();
	});
});

test.describe('Student List - Empty State @students', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('emptyState');
	const targetId = `STID_${suffix}`;
	const e2eTag = `e2e-test_${suffix}`;
	let testStudent = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await createStudent({
			studentId: targetId,
			englishName: `StudentA_${suffix}`,
			chineseName: '學生A',
			grade: 10,
			status: 'Enrolled',
			e2eTag: e2eTag
		});
		testStudent = true;

		await page.goto('/admin/students');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testStudent) await cleanupByTag('students', e2eTag);
	});

	test('shows empty state when no students match filters', async ({ page }) => {
		await expect(page.getByRole('row').first()).toBeVisible();

		await page.getByRole('textbox', { name: 'Search students' }).fill('NonExistentStudentXYZ123');

		await expect(page.getByText('No students match your filters')).toBeVisible();
	});
});
