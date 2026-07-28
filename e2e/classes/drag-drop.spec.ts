import { test, expect, type Page } from '@playwright/test';
import { getTestSuffix, getUniqueTag, getTestStudentId } from '../helpers';
import { cleanupByTag, useRole, createStudent, createClass } from '../convex-client';

async function simulateDragAndDrop(page: Page, sourceLabel: string, targetLabel: string) {
	return page.evaluate(
		({ sourceLabel, targetLabel }: { sourceLabel: string; targetLabel: string }) => {
			const source = Array.from(document.querySelectorAll('[role="button"]')).find(
				(el) =>
					el.textContent?.includes(sourceLabel) && el.getAttribute('aria-label')?.includes('Move')
			) as HTMLElement | undefined;
			const target = Array.from(document.querySelectorAll('[role="region"]')).find(
				(el) => el.getAttribute('aria-label') === targetLabel
			) as HTMLElement | undefined;
			if (!source || !target) return false;

			const dt = new DataTransfer();

			source.dispatchEvent(
				new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })
			);

			target.dispatchEvent(
				new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })
			);

			target.dispatchEvent(
				new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
			);

			target.dispatchEvent(
				new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
			);

			source.dispatchEvent(
				new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt })
			);

			return true;
		},
		{ sourceLabel, targetLabel }
	);
}

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

		await expect(page.getByText(`DragTest_${suffix}`)).toBeVisible();

		const studentRow = page
			.locator('[role="button"][aria-label*="Move"]')
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
			.locator('[role="button"][aria-label*="Move"]')
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

		await page.reload();
		await page.waitForSelector('body.hydrated');

		await page.getByRole('checkbox', { name: '10' }).check();

		// Wait for both source and target to be fully loaded before drag
		await expect(page.getByRole('button', { name: /Move.*CrossGrade/ })).toBeVisible();

		// Use specific selector for the target class (not broad regex which matches multiple)
		const targetLabel = `Class 10-${targetClassName}`;
		await expect(page.getByRole('region', { name: targetLabel })).toBeVisible();

		const dragged = await simulateDragAndDrop(page, englishName, targetLabel);
		expect(dragged).toBe(true);

		await expect(page.getByRole('heading', { name: 'Cannot Move Student' })).toBeVisible();
		await expect(
			page.getByText('Moving students between different grades is not allowed here')
		).toBeVisible();
		await page.getByRole('button', { name: 'OK' }).click();
	});
});
