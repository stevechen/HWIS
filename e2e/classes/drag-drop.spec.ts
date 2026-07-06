import { test, expect } from '@playwright/test';
import { getTestSuffix, getUniqueTag, getTestStudentId } from '../helpers';
import { cleanupByTag, useRole, createStudent, createClass } from '../convex-client';

test.describe('Drag and Drop Student Movement', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const e2eTag = getUniqueTag('dragDrop');
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

	test('drag handles are visible when student lists shown', async ({ page }) => {
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

		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Student lists are visible by default
		await expect(page.getByText(`DragTest_${suffix}`)).toBeVisible();

		const studentRow = page
			.locator('[role="button"][aria-label*="Drag"]')
			.filter({ hasText: `DragTest_${suffix}` });
		await expect(studentRow).toBeVisible();
	});

	test('students are draggable elements', async ({ page }) => {
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

		await page.reload();
		await page.waitForSelector('body.hydrated');

		const studentElement = page
			.locator('[role="button"][aria-label*="Drag"]')
			.filter({ hasText: `Draggable_${suffix}` });
		await expect(studentElement).toBeVisible();
		await expect(studentElement).toHaveAttribute('role', 'button');
	});

	test('class containers are drop zones', async ({ page }) => {
		await page.waitForSelector('text=G7');

		const classContainer = page.locator('[role="region"][aria-label*="Class"]').first();
		await expect(classContainer).toBeVisible();
	});

	test('shows alert when dropping student on different grade class', async ({ page }) => {
		// Create a student in grade 7
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

		// Ensure grade 10 has at least one class
		await createClass({ grade: 10, class: '1', e2eTag });

		await page.reload();
		await page.waitForSelector('body.hydrated');

		// Show grade 10 so we can see the target
		await page.getByRole('checkbox', { name: '10' }).check();
		await page.waitForTimeout(500);

		// Get the student draggable element
		const studentEl = page
			.locator('[role="button"][aria-label*="Drag"]')
			.filter({ hasText: englishName });

		// Get a grade 10 class container
		const targetClass = page.getByRole('region', { name: 'Class 10-1' });

		// Set up dialog watcher before triggering drag
		page.on('dialog', async (dialog) => {
			expect(dialog.message()).toContain(
				'Moving students between different grades is not allowed here'
			);
			await dialog.accept();
		});

		// Perform drag via pointer events using bounding boxes
		const sourceBox = await studentEl.boundingBox();
		const targetBox = await targetClass.boundingBox();
		if (!sourceBox || !targetBox) throw new Error('Could not get bounding boxes');

		const sx = sourceBox.x + sourceBox.width / 2;
		const sy = sourceBox.y + sourceBox.height / 2;
		const tx = targetBox.x + targetBox.width / 2;
		const ty = targetBox.y + targetBox.height / 2;

		await page.mouse.move(sx, sy);
		await page.mouse.down();
		await page.mouse.move(tx, ty, { steps: 10 });
		await page.mouse.up();
	});
});
