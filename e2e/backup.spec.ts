import { test, expect } from './fixtures';
import { getTestSuffix } from './helpers';
import {
	createStudentWithEvaluations,
	cleanupByTag,
	cleanupTestBackupsByTimestamp,
	countBackupsByTag
} from './convex-client';

test.describe('Backup Management @backup @sequential', () => {
	test.use({ role: 'admin' });

	const suffix = getTestSuffix('backup');
	const e2eTag = `e2e-test_${suffix}`;

	let testStartTime: number;

	test.beforeEach(async ({ page }) => {
		testStartTime = Date.now();
		await createStudentWithEvaluations({
			studentId: `7${suffix.slice(0, 5)}`,
			englishName: `Backup_${suffix}`,
			chineseName: '備份學生',
			grade: 10,
			status: 'Enrolled',
			e2eTag
		});
		// The tag rides in on the URL so the rows this page creates (Force Backup and
		// the pre-restore safety snapshot) are removable by tag. Without it they are
		// invisible to every teardown scope and only the timestamp sweep can reach
		// them.
		await page.goto(`/admin/backup?e2eTag=${encodeURIComponent(e2eTag)}`);
		await page.waitForSelector('body.hydrated');
	});

	test.afterEach(async () => {
		await cleanupByTag('students', e2eTag);
		// Tag-based teardown first: it is scoped to this run's own rows. The timestamp
		// sweep stays as the safety net for anything a spec created untagged, and
		// cannot touch a production backup from before the test started.
		await cleanupByTag('backups', e2eTag);
		await cleanupTestBackupsByTimestamp(testStartTime);
	});

	test('creates a named backup, displays ownership badge, and renames it', async ({ page }) => {
		const customName = `E2E_Backup_${suffix}`;
		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await expect(page.getByRole('heading', { name: 'Force Backup', level: 2 })).toBeVisible();
		await page.getByPlaceholder('Leave blank for timestamped default').fill(customName);
		await page.getByRole('button', { name: 'Confirm' }).click();

		await expect(page.getByText(/Created backup/)).toBeVisible();
		await expect(page.getByText(customName).first()).toBeVisible();
		await expect(page.getByText('You').first()).toBeVisible();

		// Rename the backup
		await page.getByRole('button', { name: 'Rename' }).first().click();
		await expect(page.getByRole('heading', { name: 'Rename Backup' })).toBeVisible();
		const updatedName = `${customName}_Renamed`;
		await page.getByPlaceholder('Enter backup name').fill(updatedName);
		await page.getByRole('button', { name: 'Save' }).click();

		await expect(page.getByText(updatedName).first()).toBeVisible();
	});

	test('download button is available for owned backup entries', async ({ page }) => {
		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await expect(page.getByRole('heading', { name: 'Force Backup', level: 2 })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect(page.getByText(/Created backup/)).toBeVisible();

		await expect(page.getByRole('button', { name: 'Download' }).first()).toBeVisible();
	});

	test('downloads a backup using a sanitized filename derived from the display name', async ({
		page
	}) => {
		const customName = `E2E/Backup: ${suffix}?`;
		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await expect(page.getByRole('heading', { name: 'Force Backup', level: 2 })).toBeVisible();
		await page.getByPlaceholder('Leave blank for timestamped default').fill(customName);
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect(page.getByText(/Created backup/)).toBeVisible();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download' }).first().click()
		]);

		const expected = `${customName.replace(/[^a-zA-Z0-9-_.]/g, '_')}.json`;
		expect(download.suggestedFilename()).toBe(expected);
	});

	test('tags a UI-created backup so tag-based teardown can reach it', async ({ page }) => {
		expect(await countBackupsByTag(e2eTag)).toBe(0);

		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await expect(page.getByRole('heading', { name: 'Force Backup', level: 2 })).toBeVisible();
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect(page.getByText(/Created backup/)).toBeVisible();

		await expect
			.poll(() => countBackupsByTag(e2eTag), { message: 'backup row was never tagged' })
			.toBe(1);

		// Tag-based teardown must be sufficient on its own — the timestamp sweep in
		// afterEach is only a backstop, so prove the tag alone removes the row.
		await cleanupByTag('backups', e2eTag);
		expect(await countBackupsByTag(e2eTag)).toBe(0);
	});

	test('danger zone section is visible', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Clear All Data' })).toBeVisible();
	});

	test('restore from file card and upload button are visible', async ({ page }) => {
		await expect(page.getByText('Restore from File')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Choose Backup File' })).toBeVisible();
	});

	test('uploads valid backup JSON, shows preview dialog with counts, and restores data', async ({
		page
	}) => {
		const testRestorePayload = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			students: [
				{
					_id: 'sample_student_1',
					englishName: `E2E_Restored_${suffix}`,
					chineseName: '恢復測試',
					studentId: `8${suffix.slice(0, 5)}`,
					classId: 'sample_class_1',
					status: 'Enrolled',
					house: 'Heracles'
				}
			],
			evaluations: [],
			users: [
				{
					_id: 'sample_teacher_1',
					authId: `restored-user-${suffix}`,
					name: 'Restored Teacher',
					role: 'teacher',
					status: 'active'
				}
			],
			categories: [
				{
					_id: 'sample_cat_1',
					name: `Restored Category ${suffix}`,
					meritCriteria: ['Participation'],
					demeritCriteria: ['Disruption'],
					casAlignment: ['Activity']
				}
			],
			classes: [
				{
					_id: 'sample_class_1',
					grade: 10,
					class: '1'
				}
			],
			houseEvents: [
				{
					title: `Restored Event ${suffix}`,
					startDate: Date.now(),
					endDate: Date.now() + 86400000,
					e2eTag
				}
			]
		};

		// Set file directly to the hidden file input
		await page.locator('input[type="file"]').setInputFiles({
			name: 'backup-restore-test.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(testRestorePayload))
		});

		// Verify Preview Dialog appears
		await expect(page.getByRole('heading', { name: 'Restore from JSON Backup' })).toBeVisible();
		await expect(page.getByText('backup-restore-test.json')).toBeVisible();

		// Verify preview counts
		const dialog = page.getByRole('heading', { name: 'Restore from JSON Backup' }).locator('..');
		await expect(dialog.getByText('1', { exact: true }).first()).toBeVisible();

		// Confirm Restore
		await page.getByPlaceholder('Type RESTORE').fill('RESTORE');
		await page.getByRole('button', { name: 'Restore Data' }).click();

		// Verify success feedback
		await expect(page.getByText(/Restored data:/)).toBeVisible();

		// Verify a pre-restore safety backup was saved in history with system badge
		await expect(page.getByText(/Pre-Restore Safety Snapshot/).first()).toBeVisible();
		await expect(page.getByText('System: Safety').first()).toBeVisible();

		// The safety snapshot is a second row this page creates, so it is tagged too.
		await expect.poll(() => countBackupsByTag(e2eTag)).toBe(1);
	});

	test('shows error when invalid JSON file is uploaded', async ({ page }) => {
		await page.locator('input[type="file"]').setInputFiles({
			name: 'invalid.json',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify({ invalid: 'schema' }))
		});

		await expect(page.getByText(/Invalid backup format/)).toBeVisible();
	});
});
