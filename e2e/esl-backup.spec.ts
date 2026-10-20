import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import { cleanupByTag, cleanupTestBackupsByTimestamp } from './convex-client';

/**
 * The ESL department's backup page: a backup created here is tagged `esl` and
 * appears in the ESL department's history.
 *
 * Runs as the ESL department admin fixture, which is an ESL-only admin (base
 * role `teacher`, `departmentRoles.esl === 'admin'`) — the real shape of an ESL
 * admin. It therefore must not be sent to `/admin/backup`; the backend
 * cross-department visibility rules are covered by the convex tests
 * (`backup.test.ts`, `esl-restore.test.ts`).
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

	test('creates an ESL backup that appears in ESL history', async ({ page }) => {
		await expect(page.getByTestId('esl-admin-backup.title')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Force Backup Now' })).toBeVisible();

		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await page.getByPlaceholder('Leave blank for timestamped default').fill(backupName);
		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect(page.getByText(/Created backup/)).toBeVisible();
		await expect(page.getByText(backupName).first()).toBeVisible();
		await expect(page.getByText('ESL', { exact: true }).first()).toBeVisible();
	});
});
