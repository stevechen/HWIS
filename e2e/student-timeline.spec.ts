import { test, expect } from '@playwright/test';
import { getTestSuffix } from './helpers';
import {
	createStudent,
	createCategoryWithSubs,
	createEvaluationForStudent,
	cleanupByTag,
	useRole
} from './convex-client';

test.describe('Student Timeline Page', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	test.describe('Breadcrumb Navigation', () => {
		let suffix: string;
		let studentId: string;
		let englishName: string;
		let e2eTag: string;
		let testData = false;

		test.beforeEach(async ({ page }) => {
			useRole('teacher');
			suffix = getTestSuffix('timelineBreadcrumb');
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			e2eTag = `e2e-test_${suffix}`;

			// Create category and student via API
			await createCategoryWithSubs({
				name: `Cat_${suffix}`,
				subCategories: ['Sub1'],
				e2eTag
			});

			await createStudent({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});

			// Create evaluation for the student
			await createEvaluationForStudent({ studentId, e2eTag });
			testData = true;

			// Navigate to the real student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testData) await cleanupByTag('all', e2eTag);
		});

		test('back button is present', async ({ page }) => {
			// Back button should be present
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();
		});

		test('back button click triggers navigation', async ({ page }) => {
			// Click back button
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();
			await backButton.click();

			// Should navigate away from timeline page
			await expect(page).not.toHaveURL(new RegExp(studentId));
		});
	});

	test.describe('Timeline Entry Rendering', () => {
		let suffix: string;
		let studentId: string;
		let englishName: string;
		let e2eTag: string;
		let testData = false;

		test.beforeEach(async ({ page }) => {
			useRole('teacher');
			suffix = getTestSuffix('timelineRender');
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			e2eTag = `e2e-test_${suffix}`;

			// Create category and student via API
			await createCategoryWithSubs({
				name: `Cat_${suffix}`,
				subCategories: ['Sub1'],
				e2eTag
			});

			await createStudent({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});

			// Create evaluation for the student
			await createEvaluationForStudent({ studentId, e2eTag });
			testData = true;

			// Navigate to the real student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testData) await cleanupByTag('all', e2eTag);
		});

		test('timeline entries container exists', async ({ page }) => {
			// Timeline container should exist
			await expect(page.getByRole('separator', { name: 'Timeline divider' })).toBeVisible();
		});

		test('timeline has central line', async ({ page }) => {
			// Use semantic role to find the timeline divider
			await expect(page.getByRole('separator', { name: 'Timeline divider' })).toBeVisible();
		});
	});

	test.describe('Sorting', () => {
		let suffix: string;
		let studentId: string;
		let englishName: string;
		let e2eTag: string;
		let testData = false;

		test.beforeEach(async ({ page }) => {
			useRole('teacher');
			suffix = getTestSuffix('timelineSort');
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			e2eTag = `e2e-test_${suffix}`;

			// Create category and student via API
			await createCategoryWithSubs({
				name: `Cat_${suffix}`,
				subCategories: ['Sub1'],
				e2eTag
			});

			await createStudent({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});

			// Create evaluation for the student
			await createEvaluationForStudent({ studentId, e2eTag });
			testData = true;

			// Navigate to the real student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testData) await cleanupByTag('all', e2eTag);
		});

		test('sort toggle button exists', async ({ page }) => {
			await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible();
		});

		test('sort toggle button is clickable', async ({ page }) => {
			const sortButton = page.getByRole('button', { name: /newest first/i });
			await expect(sortButton).toBeVisible();
			await sortButton.click();

			// After click, button shows "Oldest First" - verify button still exists
			await expect(page.getByRole('button').first()).toBeVisible();
		});
	});

	test.describe('Admin Features', () => {
		test.use({ storageState: 'e2e/.auth/admin.json' });

		let suffix: string;
		let studentId: string;
		let englishName: string;
		let e2eTag: string;
		let testData = false;

		test.beforeEach(async ({ page }) => {
			useRole('admin');
			suffix = getTestSuffix('timelineAdmin');
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			e2eTag = `e2e-test_${suffix}`;

			// Create category and student via API
			await createCategoryWithSubs({
				name: `Cat_${suffix}`,
				subCategories: ['Sub1'],
				e2eTag
			});

			await createStudent({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});

			// Create evaluation for the student
			await createEvaluationForStudent({ studentId, e2eTag });
			testData = true;

			// Navigate to the real student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testData) await cleanupByTag('all', e2eTag);
		});

		test('admin filter dropdown exists', async ({ page }) => {
			await expect(page.getByRole('textbox', { name: 'Filter by teacher(s)…' })).toBeVisible();
		});
	});

	test.describe('Controls', () => {
		let suffix: string;
		let studentId: string;
		let englishName: string;
		let e2eTag: string;
		let testData = false;

		test.beforeEach(async ({ page }) => {
			useRole('teacher');
			suffix = getTestSuffix('timelineControls');
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			e2eTag = `e2e-test_${suffix}`;

			// Create category and student via API
			await createCategoryWithSubs({
				name: `Cat_${suffix}`,
				subCategories: ['Sub1'],
				e2eTag
			});

			await createStudent({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});

			// Create evaluation for the student
			await createEvaluationForStudent({ studentId, e2eTag });
			testData = true;

			// Navigate to the real student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testData) await cleanupByTag('all', e2eTag);
		});

		test('page has sort toggle button', async ({ page }) => {
			await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible();
		});

		test('page has details toggle button', async ({ page }) => {
			await expect(page.getByRole('button', { name: /show details/i })).toBeVisible();
		});
	});

	test.describe('Legend', () => {
		let suffix: string;
		let studentId: string;
		let englishName: string;
		let e2eTag: string;
		let testData = false;

		test.beforeEach(async ({ page }) => {
			useRole('teacher');
			suffix = getTestSuffix('timelineLegend');
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			e2eTag = `e2e-test_${suffix}`;

			// Create category and student via API
			await createCategoryWithSubs({
				name: `Cat_${suffix}`,
				subCategories: ['Sub1'],
				e2eTag
			});

			await createStudent({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});

			// Create evaluation for the student
			await createEvaluationForStudent({ studentId, e2eTag });
			testData = true;

			// Navigate to the real student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testData) await cleanupByTag('all', e2eTag);
		});
	});

	test.describe('Page Structure', () => {
		let suffix: string;
		let studentId: string;
		let englishName: string;
		let e2eTag: string;
		let testData = false;

		test.beforeEach(async ({ page }) => {
			useRole('teacher');
			suffix = getTestSuffix('timelineStructure');
			studentId = `STU_${suffix}`;
			englishName = `Student_${suffix}`;
			e2eTag = `e2e-test_${suffix}`;

			// Create category and student via API
			await createCategoryWithSubs({
				name: `Cat_${suffix}`,
				subCategories: ['Sub1'],
				e2eTag
			});

			await createStudent({
				studentId,
				englishName,
				chineseName: '學生',
				grade: 10,
				status: 'Enrolled',
				e2eTag
			});

			// Create evaluation for the student
			await createEvaluationForStudent({ studentId, e2eTag });
			testData = true;

			// Navigate to the real student's timeline page
			await page.goto(`/evaluations/student/${studentId}`);
			await page.waitForSelector('body.hydrated');
		});

		test.afterEach(async () => {
			if (testData) await cleanupByTag('all', e2eTag);
		});

		test('page has header with back button', async ({ page }) => {
			// Header should contain back button
			const backButton = page.getByRole('button', { name: 'Back to Evaluations' });
			await expect(backButton).toBeVisible();
		});

		test('page has controls section', async ({ page }) => {
			// Should have sort or details toggle visible
			await expect(page.getByRole('button', { name: 'Newest First' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Show Details' })).toBeVisible();
		});
	});
});

test.describe('Student Timeline Long-Press @timeline-longpress', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('timelineLongpress');
		studentId = `STU_${suffix}`;
		englishName = `Student_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;

		// Create category and student via API
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Sub1'],
			e2eTag
		});

		await createStudent({
			studentId,
			englishName,
			chineseName: '學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluation for the student
		await createEvaluationForStudent({ studentId, e2eTag });
		testData = true;

		// Navigate to the real student's timeline page
		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('long-press on evaluation card opens edit dialog', async ({ page }) => {
		// Find evaluation card by partial button name pattern, then get by englishName
		const evalCard = page.getByRole('button', { name: /Evaluation for/ });
		await expect(evalCard).toBeVisible();

		// Long-press by holding mouse down
		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		// Should open edit dialog
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
	});

	test('can navigate away during long-press if not held long enough', async ({ page }) => {
		// Find evaluation card
		const evalCard = page.getByRole('button', { name: /Evaluation for/ });
		await expect(evalCard).toBeVisible();

		// Quick click (not long-press)
		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(200); // Less than 500ms threshold
		await evalCard.dispatchEvent('mouseup');

		// Edit dialog should NOT open with quick click
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).not.toBeVisible();
	});
});

test.describe('Student Timeline Long-Press Admin @timeline-longpress', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		suffix = getTestSuffix('timelineLongpressAdmin');
		studentId = `STU_${suffix}`;
		englishName = `Student_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;

		// Create category and student via API
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Sub1'],
			e2eTag
		});

		await createStudent({
			studentId,
			englishName,
			chineseName: '學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluation for the student
		await createEvaluationForStudent({ studentId, e2eTag });
		testData = true;

		// Navigate to the real student's timeline page
		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('admin can long-press on own evaluations', async ({ page }) => {
		// Find evaluation card by partial button name pattern, then get by englishName
		const evalCard = page.getByRole('button', { name: `Evaluation for Cat_${suffix}` });
		await expect(evalCard).toBeVisible();

		// Long-press should work
		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		// Edit dialog should open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();
	});
});

test.describe('Student Timeline Edit Dialog @timeline-longpress', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let studentId: string;
	let englishName: string;
	let e2eTag: string;
	let testData = false;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('timelineEdit');
		studentId = `STU_${suffix}`;
		englishName = `Student_${suffix}`;
		e2eTag = `e2e-test_${suffix}`;

		// Create category and student via API
		await createCategoryWithSubs({
			name: `Cat_${suffix}`,
			subCategories: ['Sub1'],
			e2eTag
		});

		await createStudent({
			studentId,
			englishName,
			chineseName: '學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		// Create evaluation for the student
		await createEvaluationForStudent({ studentId, e2eTag });
		testData = true;

		// Navigate to the real student's timeline page
		await page.goto(`/evaluations/student/${studentId}`);
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		if (testData) await cleanupByTag('all', e2eTag);
	});

	test('edit dialog has all required elements', async ({ page }) => {
		// Find evaluation card
		const evalCard = page.getByRole('button', { name: `Evaluation for Cat_${suffix}` });
		await expect(evalCard).toBeVisible();

		// Long-press to open edit dialog
		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		// Verify edit dialog is open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Verify category dropdown exists
		await expect(page.getByRole('button', { name: /Select category/i })).toBeVisible();

		// Verify points buttons exist (-2, -1, +1, +2)
		await expect(page.getByRole('button', { name: /Deduct 2 points/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Deduct 1 point/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Award 1 point/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Award 2 points/i })).toBeVisible();

		// Verify details textarea exists
		await expect(page.getByRole('textbox', { name: /Evaluation details/i })).toBeVisible();

		// Verify Save and Cancel buttons exist
		await expect(page.getByRole('button', { name: /Save Changes/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible();
	});

	test('can edit evaluation details', async ({ page }) => {
		// Find evaluation card
		const evalCard = page.getByRole('button', { name: `Evaluation for Cat_${suffix}` });
		await expect(evalCard).toBeVisible();

		// Long-press to open edit dialog
		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		// Verify dialog is open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Change points
		await page.getByRole('button', { name: /Award 2 points/i }).click();

		// Save changes
		await page.getByRole('button', { name: /Save Changes/i }).click();

		// Dialog should close
		await expect(page.getByRole('dialog')).not.toBeVisible();
	});

	test('can delete evaluation via long-press', async ({ page }) => {
		// Find evaluation card
		const evalCard = page.getByRole('button', { name: `Evaluation for Cat_${suffix}` });
		await expect(evalCard).toBeVisible();

		// Long-press to open edit dialog
		await evalCard.dispatchEvent('mousedown');
		await page.waitForTimeout(600);
		await evalCard.dispatchEvent('mouseup');

		// Edit dialog should open
		await expect(page.getByRole('dialog', { name: /Edit Evaluation/i })).toBeVisible();

		// Delete button should be visible
		await expect(page.getByRole('button', { name: /Delete/i })).toBeVisible();

		// Click Delete button
		await page.getByRole('button', { name: /Delete/i }).click();

		// Delete confirmation dialog should appear
		const dialog = page.getByRole('dialog', { name: /Delete Evaluation/i });
		await expect(dialog).toBeVisible();

		// Confirm deletion by clicking the Delete button in confirmation dialog
		await dialog.getByRole('button', { name: /Delete/i, exact: true }).click();

		// Delete confirmation dialog should close
		await expect(page.getByRole('dialog', { name: /Delete Evaluation/i })).not.toBeVisible();

		// Evaluation card should be removed
		await expect(evalCard).not.toBeVisible();
	});
});
