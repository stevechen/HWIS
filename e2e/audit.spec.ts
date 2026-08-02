import { test, expect } from './fixtures';
import { cleanupAuditLogs, seedAuditLogs } from './convex-client';
import { AdminAuditPage } from './pages';

test.describe('Audit Log Page (super admin) @audit', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	let auditPage: AdminAuditPage;

	test.beforeEach(async ({ page }) => {
		auditPage = new AdminAuditPage(page);
		await auditPage.goto();
		await auditPage.resetColumnVisibility();
	});

	test.afterEach(async () => {
		await cleanupAuditLogs();
	});

	test('loads core audit controls', async ({ page }) => {
		await expect(page.getByTestId('audit.columns-control')).toBeVisible();
		await expect(page.getByTestId('audit.filter-student')).toBeVisible();
		await expect(page.getByTestId('audit.filter-teacher')).toBeVisible();
		await expect(page.getByTestId('audit.filter-grade')).toBeVisible();
	});
});

test.describe('Audit Log - Data-driven column toggle', () => {
	test.use({ storageState: 'e2e/.auth/super.json' });

	let testAuthId: string;
	let testAuditLogs = false;
	let auditPage: AdminAuditPage;

	test.beforeEach(async ({ page }) => {
		auditPage = new AdminAuditPage(page);
		testAuthId = `e2e-audit-${Math.random().toString(36).substring(7)}`;

		const seedResult = await seedAuditLogs(testAuthId);
		if (!seedResult?.success) {
			throw new Error(`Failed to seed audit logs: ${seedResult?.error || 'Unknown error'}`);
		}
		testAuditLogs = true;

		await auditPage.goto();
		// Wait for Convex reactivity to deliver seeded audit logs before proceeding
		await expect(page.getByTestId('audit.table')).toBeVisible();
		await auditPage.resetColumnVisibility();
	});

	test.afterEach(async () => {
		if (testAuditLogs) await cleanupAuditLogs(testAuthId);
	});

	test('toggles Details column while filtering seeded data', async ({ page }) => {
		await expect(page.getByTestId('audit.table')).toBeVisible();

		await auditPage.fillTeacherFilter(`Test Performer ${testAuthId}`);
		await auditPage.expectTableRowCount(3);

		// Toggle Details column off
		await auditPage.openColumnSelector();
		await auditPage.toggleColumn('details', false);
		await auditPage.closeColumnSelector();
		await auditPage.expectColumnVisible('details', false);

		// Toggle Details column back on
		await auditPage.openColumnSelector();
		await auditPage.toggleColumn('details', true);
		await auditPage.closeColumnSelector();
		await auditPage.expectColumnVisible('details', true);
	});
});
