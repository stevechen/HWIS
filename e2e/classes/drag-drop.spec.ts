import { test, expect } from '@playwright/test';
import { getTestSuffix, getUniqueTag, getTestStudentId } from '../helpers';
import { cleanupByTag, useRole, createStudent, createClass } from '../convex-client';
import { AdminClassesPage } from '../pages';

test.describe('Drag and Drop Student Movement', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('dragDrop');
	let testDataCreated = false;
	let classesPage: AdminClassesPage;

	test.beforeEach(async ({ page }) => {
		classesPage = new AdminClassesPage(page);
		useRole('admin');
		await classesPage.goto();
	});

	test.afterEach(async () => {
		if (testDataCreated) {
			await cleanupByTag('students', e2eTag);
		}
	});

	test('drag handles are visible when student lists shown', async () => {
		const studentId = getTestStudentId('DD1');
		const suffix = getTestSuffix('drag');

		await createStudent({
			studentId,
			englishName: `DragTest_${suffix}`,
			grade: 7,
			class: '1',
			status: 'Enrolled',
			e2eTag
		});
		testDataCreated = true;

		await classesPage.page.reload();
		await classesPage.page.waitForSelector('body.hydrated');

		await expect(classesPage.page.getByText(`DragTest_${suffix}`)).toBeVisible();

		const studentRow = classesPage.getDraggableStudent(`DragTest_${suffix}`);
		await expect(studentRow).toBeVisible();
	});

	test('students are draggable elements', async () => {
		const studentId = getTestStudentId('DD2');
		const suffix = getTestSuffix('draggable');

		await createStudent({
			studentId,
			englishName: `Draggable_${suffix}`,
			grade: 7,
			class: '1',
			status: 'Enrolled',
			e2eTag
		});
		testDataCreated = true;

		await classesPage.page.reload();
		await classesPage.page.waitForSelector('body.hydrated');

		const studentElement = classesPage.getDraggableStudent(`Draggable_${suffix}`);
		await expect(studentElement).toBeVisible();
		await expect(studentElement).toHaveAttribute('role', 'button');
	});

	test('class containers are drop zones', async () => {
		await classesPage.page.waitForSelector('text=G7');

		const classContainer = classesPage.page.locator('[role="region"][aria-label*="Class"]').first();
		await expect(classContainer).toBeVisible();
	});

	test('shows alert when dropping student on different grade class', async () => {
		const studentId = getTestStudentId('DD3');
		const suffix = getTestSuffix('crossGrade');
		const englishName = `CrossGrade_${suffix}`;

		await createStudent({
			studentId,
			englishName,
			grade: 7,
			class: '1',
			status: 'Enrolled',
			e2eTag
		});
		testDataCreated = true;

		const targetClassName = `dd_target_${suffix}`;
		await createClass({ grade: 10, class: targetClassName, e2eTag });

		await classesPage.page.reload();
		await classesPage.page.waitForSelector('body.hydrated');

		await classesPage.page.getByRole('checkbox', { name: '10' }).check();

		await expect(classesPage.page.getByRole('button', { name: /Move.*CrossGrade/ })).toBeVisible();

		const targetLabel = `Class 10-${targetClassName}`;
		await expect(classesPage.getClassRegion(targetLabel)).toBeVisible();

		const dragged = await classesPage.simulateDragAndDrop(englishName, targetLabel);
		expect(dragged).toBe(true);

		await expect(
			classesPage.page.getByRole('heading', { name: 'Cannot Move Student' })
		).toBeVisible();
		await expect(
			classesPage.page.getByText('Moving students between different grades is not allowed here')
		).toBeVisible();
		await classesPage.page.getByRole('button', { name: 'OK' }).click();
	});
});
