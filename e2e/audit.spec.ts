import { test, expect } from '@playwright/test';
import { cleanupAuditLogs, seedAuditLogs } from './convex-client';

test.describe('Audit Log Page (super admin) @audit', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/admin/audit');
		await page.waitForSelector('body.hydrated');
		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});
	});

	test.afterEach(async () => {
		await cleanupAuditLogs();
	});

	test('loads core audit controls', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Columns control' })).toBeVisible();
		await expect(page.getByPlaceholder('Student')).toBeVisible();
		await expect(page.getByPlaceholder('Teacher')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Grade' })).toBeVisible();
	});
});

test.describe('Audit Log - Data-driven column toggle', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	let testAuthId: string;
	let testAuditLogs = false;

	test.beforeEach(async ({ page }) => {
		testAuthId = `e2e-audit-${Math.random().toString(36).substring(7)}`;

		const seedResult = await seedAuditLogs(testAuthId);
		if (!seedResult?.success) {
			throw new Error(`Failed to seed audit logs: ${seedResult?.error || 'Unknown error'}`);
		}
		testAuditLogs = true;

		await page.goto('/admin/audit');
		await page.waitForSelector('body.hydrated');
		await page.evaluate(() => {
			localStorage.removeItem('audit-table-columns');
			localStorage.removeItem('audit-visible-columns');
		});
	});

	test.afterEach(async () => {
		if (testAuditLogs) await cleanupAuditLogs(testAuthId);
	});

	test('toggles Details column while filtering seeded data', async ({ page }) => {
		await expect(page.getByRole('table', { name: 'Audit log table' })).toBeVisible();

		const teacherInput = page.getByRole('textbox', { name: 'Filter by teacher name' });
		await teacherInput.fill(`Test Performer ${testAuthId}`);
		await expect(page.locator('tbody tr')).toHaveCount(3);

		await page.getByRole('button', { name: 'Columns control' }).click();
		const menu = page.getByRole('menu', { name: 'Available columns' });
		await expect(menu).toBeVisible();

		const detailsCheckbox = page.getByRole('checkbox', { name: 'Details' });
		if (await detailsCheckbox.isChecked()) await detailsCheckbox.click();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('columnheader', { name: 'Details' })).not.toBeVisible();

		await page.getByRole('button', { name: 'Columns control' }).click();
		await page.getByRole('checkbox', { name: 'Details' }).click();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('columnheader', { name: 'Details' })).toBeVisible();
	});
});
