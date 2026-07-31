import { test, expect, Locator } from '@playwright/test';
import { getTestSuffix } from './helpers';
import { createStudentWithEvaluations, cleanupByTag, useRole } from './convex-client';
import { AdminEvaluationsPage } from './pages';

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
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new AdminEvaluationsPage(page);
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

		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();
		await evalsPage.expectTimelineVisible();

		// Use card testIds to find evaluation cards for each student
		enrolled = page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: page.locator(`text="${enrolledStudentName}"`)
		});
		unEnrolled = page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: page.locator(`text="${unenrolledStudentName}"`)
		});
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

	test('can show unenrolled students by clicking eye toggle', async () => {
		// Click to show unenrolled students
		const showUnenrolledButton = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await expect(showUnenrolledButton).toBeVisible();
		await showUnenrolledButton.click();

		// Both students should now be visible
		await expect(enrolled).toBeVisible();
		await expect(unEnrolled).toBeVisible();
	});

	test('can hide unenrolled students again by clicking eye toggle', async () => {
		// First, show unenrolled students
		const showUnenrolledButton = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await showUnenrolledButton.click();

		// Now the button should say "Hide unenrolled students"
		const hideUnenrolledButton = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await expect(hideUnenrolledButton).toBeVisible();

		// Click to hide unenrolled students again
		await hideUnenrolledButton.click();

		// Only enrolled student should be visible
		await expect(enrolled).toBeVisible();
		await expect(unEnrolled).not.toBeVisible();
	});

	test('button aria-label updates correctly when toggling', async () => {
		// Initial state - button should say "Show unenrolled students" (hidden by default)
		const toggleButton = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await expect(toggleButton).toHaveAttribute('aria-label', 'Show unenrolled students');

		// Click to show
		await toggleButton.click();

		// Button should now say "Hide unenrolled students"
		await expect(toggleButton).toHaveAttribute('aria-label', 'Hide unenrolled students');

		// Click to hide again
		await toggleButton.click();

		// Button should revert to "Show unenrolled students"
		await expect(toggleButton).toHaveAttribute('aria-label', 'Show unenrolled students');
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
	let page: import('@playwright/test').Page;

	test.beforeEach(async ({ page: p }) => {
		page = p;
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

		// Navigate to teacher evaluations page
		await page.goto('/evaluations');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByTestId('evaluations.empty')).not.toBeVisible();

		enrolled = page.locator('[data-testid^="evaluations.card-"]', {
			has: page.locator(`text="${enrolledStudentName}"`)
		});
		unEnrolled = page.locator('[data-testid^="evaluations.card-"]', {
			has: page.locator(`text="${unenrolledStudentName}"`)
		});
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('teacher does not see the show unenrolled students toggle button', async () => {
		// Teacher should NOT see the toggle button at all
		await expect(page.getByTestId('evaluations.unenrolled')).not.toBeVisible();
	});

	test('teacher sees only enrolled students (unenrolled hidden by default)', async () => {
		// Teacher should see enrolled student
		await expect(enrolled).toBeVisible();

		// Teacher should NOT see unenrolled student (toggle not available to them)
		await expect(unEnrolled).not.toBeVisible();
	});

	test('teacher evaluations page has correct controls without unenrolled toggle', async () => {
		// Teacher should see sort toggle
		await expect(page.getByTestId('evaluations.sort')).toBeVisible();

		// Teacher should see details toggle
		await expect(page.getByTestId('evaluations.details')).toBeVisible();

		// Teacher should NOT see unenrolled toggle
		await expect(page.getByTestId('evaluations.unenrolled')).not.toBeVisible();
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
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new AdminEvaluationsPage(page);
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

		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();
	});

	test.afterEach(async () => {
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('all students enrolled shows all regardless of toggle state', async () => {
		useRole('admin');

		const student1Card = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${student1Name}"`)
		});
		const student2Card = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${student2Name}"`)
		});

		// Both students should be visible regardless of toggle state
		await expect(student1Card).toBeVisible();
		await expect(student2Card).toBeVisible();

		// Toggle on and off, students should remain visible
		const showToggle = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await showToggle.click();

		await expect(student1Card).toBeVisible();
		await expect(student2Card).toBeVisible();

		const hideToggle = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await hideToggle.click();

		await expect(student1Card).toBeVisible();
		await expect(student2Card).toBeVisible();
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
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new AdminEvaluationsPage(page);
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
		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();
		await evalsPage.expectTimelineVisible();
	});

	test.afterEach(async () => {
		// Cleanup test data after each test
		if (testEntity) await cleanupByTag('all', e2eTag);
	});

	test('shows teacher name toggle button with correct default aria-label', async () => {
		// By default, teacher name is hidden, so button should say "Show teacher name"
		const showTeacherNameButton = evalsPage.page.getByTestId(
			'admin-evaluations.toggle-teacher-name'
		);
		await expect(showTeacherNameButton).toBeVisible();
		await expect(showTeacherNameButton).toHaveAttribute('aria-label', 'Show teacher name');
	});

	test('clicking toggle changes aria-label from Show to Hide', async () => {
		// Initial state - button should say "Show teacher name" (hidden by default)
		const showButton = evalsPage.page.getByTestId('admin-evaluations.toggle-teacher-name');
		await expect(showButton).toBeVisible();

		// Click to show teacher names
		await showButton.click();

		// Button should now say "Hide teacher name"
		await expect(showButton).toHaveAttribute('aria-label', 'Hide teacher name');
	});

	test('can toggle teacher name visibility on and off', async () => {
		// Start with "Show teacher name" (hidden by default)
		const toggleButton = evalsPage.page.getByTestId('admin-evaluations.toggle-teacher-name');
		await expect(toggleButton).toHaveAttribute('aria-label', 'Show teacher name');

		// Click to show
		await toggleButton.click();

		// Now should say "Hide teacher name"
		await expect(toggleButton).toHaveAttribute('aria-label', 'Hide teacher name');

		// Click to hide again
		await toggleButton.click();

		// Should revert to "Show teacher name"
		await expect(toggleButton).toHaveAttribute('aria-label', 'Show teacher name');
	});

	test('teacher name toggle button is in toggle controls section', async () => {
		// Verify the teacher name toggle button exists alongside other toggle buttons
		const showTeacherNameButton = evalsPage.page.getByTestId(
			'admin-evaluations.toggle-teacher-name'
		);
		await expect(showTeacherNameButton).toBeVisible();

		// Verify other toggle buttons are also present
		await expect(evalsPage.page.getByTestId('admin-evaluations.sort')).toBeVisible();
		await expect(evalsPage.page.getByTestId('admin-evaluations.unenrolled')).toBeVisible();
		await expect(evalsPage.page.getByTestId('admin-evaluations.details')).toBeVisible();
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
	let evalsPage: AdminEvaluationsPage;

	test.beforeEach(async ({ page }) => {
		evalsPage = new AdminEvaluationsPage(page);
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

	test('eye icon visible when unenrolled are hidden', async () => {
		useRole('admin');

		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();

		// Eye icon should be visible (indicating hidden content)
		const eyeIcon = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await expect(eyeIcon).toBeVisible();

		// Enrolled student should be visible
		const enrolledCard = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${enrolledName}"`)
		});
		await expect(enrolledCard).toBeVisible();
	});

	test('eye icon hidden after toggle shows both enrolled and unenrolled', async () => {
		useRole('admin');

		await evalsPage.goto();
		await evalsPage.expectLoadingHidden();

		// Click toggle to show both
		const eyeIcon = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await eyeIcon.click();

		// Eye-off icon should now be visible (indicating content is shown)
		const eyeOffIcon = evalsPage.page.getByTestId('admin-evaluations.unenrolled');
		await expect(eyeOffIcon).toBeVisible();

		// Both students should be visible
		const enrolledCard = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${enrolledName}"`)
		});
		const unenrolledCard = evalsPage.page.locator('[data-testid^="admin-evaluations.card-"]', {
			has: evalsPage.page.locator(`text="${unenrolledName}"`)
		});
		await expect(enrolledCard).toBeVisible();
		await expect(unenrolledCard).toBeVisible();
	});
});
