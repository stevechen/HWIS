import { test, expect } from '@playwright/test';
import { useRole } from '../convex-client';

test.describe('Grade Filtering', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	test.beforeEach(async ({ page }) => {
		useRole('admin');
		await page.goto('/admin/classes');
		await page.waitForSelector('body.hydrated');
	});

	test('can show/hide grades using checkboxes', async ({ page }) => {
		// Wait for grade checkboxes to load
		const grade7Checkbox = page.getByRole('checkbox', { name: '7' });
		await expect(grade7Checkbox).toBeVisible();

		// Initially grade 7 should be visible
		await expect(page.getByText('G7')).toBeVisible();

		// Uncheck grade 7
		await grade7Checkbox.click();

		// Grade 7 classes should be hidden
		await expect(page.getByText('G7')).not.toBeVisible();

		// Check grade 7 again
		await grade7Checkbox.click();

		// Grade 7 should be visible again
		await expect(page.getByText('G7')).toBeVisible();
	});

	test('all grades visible by default', async ({ page }) => {
		// All grade checkboxes should be checked by default
		for (const grade of [7, 8, 9, 10, 11, 12]) {
			const checkbox = page.getByRole('checkbox', { name: String(grade) });
			await expect(checkbox).toBeChecked();
		}

		// All grade headers should be visible
		for (const grade of [7, 8, 9, 10, 11, 12]) {
			await expect(page.getByText(`G${grade}`)).toBeVisible();
		}
	});
});
