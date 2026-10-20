import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import { cleanupByTag, cleanupTestBackupsByTimestamp } from './convex-client';

/**
 * The ESL department's backup page: only ESL snapshots are listed, a backup
 * created here is tagged `esl`, and the same row is invisible to the
 * International backup page.
 *
 * Runs as the ESL department admin fixture. That account also carries the base
 * Admin role the International shell requires, so the last step can sign in to
 * `/admin/backup` in the same browser session and prove the separation.
 */
test.describe('ESL backup management @esl', () => {
	test.use({ role: 'esladmin' });

	const suffix = getTestSuffix('esl-backup');
	const e2eTag = `e2e-test_${suffix}`;
	const backupName = `E2E_ESL_Backup_${suffix}`;

	let testStartTime: number;

	test.beforeEach(async ({ page }) => {
		testStartTime = Date.now();
		await page.goto(`/esl/admin/backup?e2eTag=${encodeURIComponent(e2eTag)}`);
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupByTag('backups', e2eTag);
		await cleanupTestBackupsByTimestamp(testStartTime);
	});

	test('creates an ESL backup that appears in ESL history and not in International history', async ({
		page
	}) => {
		await expect(page.getByTestId('esl-admin-backup.title')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Force Backup Now' })).toBeVisible();

		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await page.getByPlaceholder('Leave blank for timestamped default').fill(backupName);
		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect(page.getByText(/Created backup/)).toBeVisible();
		await expect(page.getByText(backupName).first()).toBeVisible();
		await expect(page.getByText('ESL', { exact: true }).first()).toBeVisible();

		// The International page must not list the ESL row.
		await page.goto('/admin/backup');
		await page.waitForSelector('body.hydrated');
		await expect(page.getByText('Backup History')).toBeVisible();
		await expect(page.getByText(backupName)).not.toBeVisible();
	});
});
