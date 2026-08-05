import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import {
	createStudentWithEvaluations,
	cleanupByTag,
	cleanupTestBackupsByTimestamp,
	useRole
} from './convex-client';

test.describe('Backup Management @backup @sequential', () => {
	test.use({ storageState: 'e2e/.auth/admin.json' });

	const suffix = getTestSuffix('backup');
	const e2eTag = `e2e-test_${suffix}`;

	let testStartTime: number;

	test.beforeEach(async ({ page }) => {
		testStartTime = Date.now();
		useRole('admin');
		await createStudentWithEvaluations({
			studentId: `7${suffix.slice(0, 5)}`,
			englishName: `Backup_${suffix}`,
			chineseName: '備份學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		await page.goto('/admin/backup');
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupByTag('students', e2eTag);
		await cleanupTestBackupsByTimestamp(testStartTime);
	});

	test('creates a backup and displays it in history', async ({ page }) => {
		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await expect(page.getByRole('heading', { name: 'Force Backup', level: 2 })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect(page.getByText(/Created backup/)).toBeVisible();

		const backupRow = page.locator('text=backup-').first();
		await expect(backupRow).toBeVisible();
	});

	test('download button is available for backup entries', async ({ page }) => {
		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await expect(page.getByRole('heading', { name: 'Force Backup', level: 2 })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect(page.getByText(/Created backup/)).toBeVisible();

		await expect(page.getByRole('button', { name: 'Download' }).first()).toBeVisible();
	});

	test('danger zone section is visible', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Clear All Data' })).toBeVisible();
	});
});
