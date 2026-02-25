import { test, expect, Locator } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudentWithEvaluations, cleanupByTag, useRole } from './convex-client';

test.describe('Admin Evaluations - Unenrolled Student Toggle @admin-evaluations @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	// CONSTANTS - Define at top of describe
	let suffix: string;
	let enrolledStudentName: string;
	let unenrolledStudentName: string;
	let e2eTag: string;
	let testEntity = false;
	let enrolled: Locator;
	let unEnrolled: Locator;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		suffix = getTestSuffix('unenrolledToggle');
		e2eTag = `e2e-test_${suffix}`;
		enrolledStudentName = `Enrolled_${suffix}`;
		unenrolledStudentName = `Unenrolled_${suffix}`;
		const enrolledStudentId = `SE_ENROLLED_${suffix}`;
		const unenrolledStudentId = `SE_UNENROLLED_${suffix}`;

		// Create an enrolled student with evaluation
		await createStudentWithEvaluations({
			studentId: enrolledStudentId,
			englishName: enrolledStudentName,
			chineseName: '已入學',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testEntity = true;

		// Create an unenrolled student with evaluation
		await createStudentWithEvaluations({
			studentId: unenrolledStudentId,
			englishName: unenrolledStudentName,
			chineseName: '未入學',
			grade: 10,
			status: 'Not Enrolled',
			e2eTag
		});

		enrolled = page.getByRole('button', { name: `Evaluation for ${enrolledStudentName}` });
		unEnrolled = page.getByRole('button', { name: `Evaluation for ${unenrolledStudentName}` });

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading students…')).not.toBeVisible();
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	test.afterEach(async () => {
		// Cleanup test data after each test
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('shows only enrolled students by default (unenrolled hidden)', async () => {
		// By default, unenrolled students are hidden

		await expect(enrolled).toBeVisible();
		await expect(unEnrolled).not.toBeVisible();
	});

	test('can show unenrolled students by clicking eye toggle', async ({ page }) => {
		// Click to show unenrolled students
		const showUnenrolledButton = page.getByRole('button', { name: 'Show unenrolled students' });
		await expect(showUnenrolledButton).toBeVisible();
		await showUnenrolledButton.click();

		// Both students should now be visible
		await expect(enrolled).toBeVisible();
		await expect(unEnrolled).toBeVisible();
	});

	test('can hide unenrolled students again by clicking eye toggle', async ({ page }) => {
		// First, show unenrolled students
		const showUnenrolledButton = page.getByRole('button', { name: 'Show unenrolled students' });
		await showUnenrolledButton.click();

		// Now the button should say "hide unenrolled students"
		const hideUnenrolledButton = page.getByRole('button', { name: 'Hide unenrolled students' });
		await expect(hideUnenrolledButton).toBeVisible();

		// Click to hide unenrolled students again
		await hideUnenrolledButton.click();

		// Only enrolled student should be visible
		await expect(enrolled).toBeVisible();
		await expect(unEnrolled).not.toBeVisible();
	});

	test('button aria-label updates correctly when toggling', async ({ page }) => {
		// Initial state - button should say "Show unenrolled students" (hidden by default)
		await expect(page.getByRole('button', { name: 'Show unenrolled students' })).toBeVisible();

		// Click to show
		await page.getByRole('button', { name: 'Show unenrolled students' }).click();

		// Button should now say "Hide unenrolled students"
		await expect(page.getByRole('button', { name: 'Hide unenrolled students' })).toBeVisible();

		// Click to hide again
		await page.getByRole('button', { name: 'Hide unenrolled students' }).click();

		// Button should revert to "Show unenrolled students"
		await expect(page.getByRole('button', { name: 'Show unenrolled students' })).toBeVisible();
	});
});

// ============================================
// TEACHER AUTHORIZATION TESTS
// ============================================

test.describe('Teacher User - Unenrolled Toggle Visibility @teacher-evaluations @sequential', () => {
	test.use({ storageState: 'e2e/.auth/teacher.json' });

	let suffix: string;
	let enrolledStudentName: string;
	let unenrolledStudentName: string;
	let e2eTag: string;
	let testEntity = false;
	let enrolled: Locator;
	let unEnrolled: Locator;

	test.beforeEach(async ({ page }) => {
		useRole('teacher');
		suffix = getTestSuffix('teacherToggle');
		e2eTag = `e2e-test_${suffix}`;
		enrolledStudentName = `Enrolled_${suffix}`;
		unenrolledStudentName = `Unenrolled_${suffix}`;
		const enrolledStudentId = `SE_ENROLLED_${suffix}`;
		const unenrolledStudentId = `SE_UNENROLLED_${suffix}`;

		// Create an enrolled student with evaluation
		const enrolledResult = await createStudentWithEvaluations({
			studentId: enrolledStudentId,
			englishName: enrolledStudentName,
			chineseName: '已入學',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		if (enrolledResult && typeof enrolledResult === 'object' && 'error' in enrolledResult) {
			throw new Error(`Failed to create enrolled student: ${enrolledResult.error}`);
		}
		testEntity = true;

		// Create an unenrolled student with evaluation
		const unenrolledResult = await createStudentWithEvaluations({
			studentId: unenrolledStudentId,
			englishName: unenrolledStudentName,
			chineseName: '未入學',
			grade: 10,
			status: 'Not Enrolled',
			e2eTag
		});
		if (unenrolledResult && typeof unenrolledResult === 'object' && 'error' in unenrolledResult) {
			throw new Error(`Failed to create unenrolled student: ${unenrolledResult.error}`);
		}

		enrolled = page.getByRole('button', { name: `Evaluation for ${enrolledStudentName}` });
		unEnrolled = page.getByRole('button', { name: `Evaluation for ${unenrolledStudentName}` });

		// Navigate to teacher evaluations page
		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(
			page.getByText('No evaluations found. Start by awarding some points! Give Points')
		).not.toBeVisible();
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('teacher does not see the show unenrolled students toggle button', async ({ page }) => {
		// Teacher should NOT see the toggle button at all
		const showToggle = page.getByRole('button', { name: 'Show unenrolled students' });
		const hideToggle = page.getByRole('button', { name: 'Hide unenrolled students' });

		await expect(showToggle).not.toBeVisible();
		await expect(hideToggle).not.toBeVisible();
	});

	test('teacher sees only enrolled students (unenrolled hidden by default)', async () => {
		// Teacher should see enrolled student
		await expect(enrolled).toBeVisible();

		// Teacher should NOT see unenrolled student (toggle not available to them)
		await expect(unEnrolled).not.toBeVisible();
	});

	test('teacher evaluations page has correct controls without unenrolled toggle', async ({
		page
	}) => {
		// Teacher should see sort toggle
		await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible();

		// Teacher should see details toggle
		await expect(page.getByRole('button', { name: /show details/i })).toBeVisible();

		// Teacher should NOT see unenrolled toggle
		await expect(page.getByRole('button', { name: 'Show unenrolled students' })).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'Hide unenrolled students' })).not.toBeVisible();
	});
});

// ============================================
// EDGE CASE TESTS
// ============================================

test.describe('Unenrolled Toggle - Edge Cases @edge-cases @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;
	let testEntity = false;
	let student1Name: string;
	let student2Name: string;
	let student1Id: string;
	let student2Id: string;

	test.beforeEach(async ({ page }) => {
		suffix = getTestSuffix('edgeAllEnrolled');
		e2eTag = `e2e-test_${suffix}`;
		student1Name = `Student1_${suffix}`;
		student2Name = `Student2_${suffix}`;
		student1Id = `SE_STUDENT1_${suffix}`;
		student2Id = `SE_STUDENT2_${suffix}`;

		// Create only enrolled students with evaluations
		await createStudentWithEvaluations({
			studentId: student1Id,
			englishName: student1Name,
			chineseName: '學生1',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		await createStudentWithEvaluations({
			studentId: student2Id,
			englishName: student2Name,
			chineseName: '學生2',
			grade: 11,
			status: 'Enrolled',
			e2eTag
		});

		testEntity = true;

		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('all students enrolled shows all regardless of toggle state', async ({ page }) => {
		useRole('admin');

		// Both students should be visible regardless of toggle state
		await expect(
			page.getByRole('button', { name: `Evaluation for ${student1Name}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${student2Name}` })
		).toBeVisible();

		// Toggle on and off, students should remain visible
		const showToggle = page.getByRole('button', { name: 'Show unenrolled students' });
		await showToggle.click();

		await expect(
			page.getByRole('button', { name: `Evaluation for ${student1Name}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${student2Name}` })
		).toBeVisible();

		const hideToggle = page.getByRole('button', { name: 'Hide unenrolled students' });
		await hideToggle.click();

		await expect(
			page.getByRole('button', { name: `Evaluation for ${student1Name}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${student2Name}` })
		).toBeVisible();
	});
});

// ============================================
// TEACHER NAME TOGGLE TESTS
// ============================================

test.describe('Admin Evaluations - Teacher Name Toggle @admin-evaluations @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;
	let testEntity = false;
	let studentName: string;

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		suffix = getTestSuffix('teacherNameToggle');
		e2eTag = `e2e-test_${suffix}`;
		studentName = `Student_${suffix}`;
		const studentId = `SE_STUDENT_${suffix}`;

		// Create a student with evaluation
		await createStudentWithEvaluations({
			studentId,
			englishName: studentName,
			chineseName: 'Student',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		testEntity = true;

		// Navigate to admin evaluations page
		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading students')).not.toBeVisible();
		await expect(page.getByRole('region', { name: 'Evaluations' })).toBeVisible();
	});

	test.afterEach(async () => {
		// Cleanup test data after each test
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('shows teacher name toggle button with correct default aria-label', async ({ page }) => {
		// By default, teacher name is hidden, so button should say "Show teacher name"
		const showTeacherNameButton = page.getByRole('button', { name: 'Show teacher name' });
		await expect(showTeacherNameButton).toBeVisible();
	});

	test('clicking toggle changes aria-label from Show to Hide', async ({ page }) => {
		// Initial state - button should say "Show teacher name" (hidden by default)
		const showButton = page.getByRole('button', { name: 'Show teacher name' });
		await expect(showButton).toBeVisible();

		// Click to show teacher names
		await showButton.click();

		// Button should now say "Hide teacher name"
		const hideButton = page.getByRole('button', { name: 'Hide teacher name' });
		await expect(hideButton).toBeVisible();
	});

	test('can toggle teacher name visibility on and off', async ({ page }) => {
		// Start with "Show teacher name" (hidden by default)
		await expect(page.getByRole('button', { name: 'Show teacher name' })).toBeVisible();

		// Click to show
		await page.getByRole('button', { name: 'Show teacher name' }).click();

		// Now should say "Hide teacher name"
		await expect(page.getByRole('button', { name: 'Hide teacher name' })).toBeVisible();

		// Click to hide again
		await page.getByRole('button', { name: 'Hide teacher name' }).click();

		// Should revert to "Show teacher name"
		await expect(page.getByRole('button', { name: 'Show teacher name' })).toBeVisible();
	});

	test('teacher name toggle button is in toggle controls section', async ({ page }) => {
		// Verify the teacher name toggle button exists alongside other toggle buttons
		const showTeacherNameButton = page.getByRole('button', { name: 'Show teacher name' });
		await expect(showTeacherNameButton).toBeVisible();

		// Verify other toggle buttons are also present
		await expect(page.getByRole('button', { name: /newest first/i })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Show unenrolled students' })).toBeVisible();
		await expect(page.getByRole('button', { name: /show details/i })).toBeVisible();
	});
});

// ============================================
// ICON VISIBILITY TESTS
// ============================================

test.describe('Unenrolled Toggle - Icon Visibility @icons @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	let suffix: string;
	let e2eTag: string;
	let testEntity = false;
	let enrolledName: string;
	let enrolledStudentId: string;
	let unenrolledName: string;
	let unenrolledStudentId: string;

	test.beforeEach(async () => {
		suffix = getTestSuffix('eyeIconBoth');
		e2eTag = `e2e-test_${suffix}`;
		enrolledName = `Enrolled_${suffix}`;
		enrolledStudentId = `SE_ENROLLED_${suffix}`;
		unenrolledName = `Unenrolled_${suffix}`;
		unenrolledStudentId = `SE_UNENROLLED_${suffix}`;

		await createStudentWithEvaluations({
			studentId: enrolledStudentId,
			englishName: enrolledName,
			chineseName: '已入學',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});

		await createStudentWithEvaluations({
			studentId: unenrolledStudentId,
			englishName: unenrolledName,
			chineseName: '未入學',
			grade: 10,
			status: 'Not Enrolled',
			e2eTag
		});

		testEntity = true;
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('eye icon visible when unenrolled are hidden', async ({ page }) => {
		useRole('admin');

		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();

		// Eye icon should be visible (indicating hidden content)
		const eyeIcon = page.getByRole('button', { name: 'Show unenrolled students' });
		await expect(eyeIcon).toBeVisible();

		// Enrolled student should be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${enrolledName}` })
		).toBeVisible();
	});

	test('eye icon hidden after toggle shows both enrolled and unenrolled', async ({ page }) => {
		useRole('admin');

		await page.goto('/admin/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Loading evaluations...')).not.toBeVisible();

		// Click toggle to show both
		const eyeIcon = page.getByRole('button', { name: 'Show unenrolled students' });
		await eyeIcon.click();

		// Eye-off icon should now be visible (indicating content is shown)
		const eyeOffIcon = page.getByRole('button', { name: 'Hide unenrolled students' });
		await expect(eyeOffIcon).toBeVisible();

		// Both students should be visible
		await expect(
			page.getByRole('button', { name: `Evaluation for ${enrolledName}` })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: `Evaluation for ${unenrolledName}` })
		).toBeVisible();
	});
});
