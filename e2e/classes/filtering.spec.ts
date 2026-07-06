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

	test('only grade 7 visible by default', async ({ page }) => {
		// Only grade 7 should be checked by default
		const grade7Checkbox = page.getByRole('checkbox', { name: '7' });
		await expect(grade7Checkbox).toBeChecked();

		// Other grades should be unchecked
		for (const grade of [8, 9, 10, 11, 12]) {
			const checkbox = page.getByRole('checkbox', { name: String(grade) });
			await expect(checkbox).not.toBeChecked();
		}

		// Only grade 7 header should be visible
		await expect(page.getByText('G7')).toBeVisible();

		// Other grade headers should not be visible
		for (const grade of [8, 9, 10, 11, 12]) {
			await expect(page.getByText(`G${grade}`)).not.toBeVisible();
		}
	});
});
