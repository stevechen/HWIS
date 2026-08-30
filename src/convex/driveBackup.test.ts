import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import { api } from './_generated/api';
import { buildSnapshot } from './shared/backup_snapshot';
import type { BackupSnapshot } from './shared/backup_snapshot';
import schema from './schema';

describe('driveBackup.backupToDrive auth and config guards', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv('CRON_SECRET', undefined);
		vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
		vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined);
		vi.stubEnv('GOOGLE_REFRESH_TOKEN', undefined);
		vi.stubEnv('GOOGLE_DRIVE_FOLDER_ID', undefined);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('throws Forbidden when the viewer is not an admin', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'teacher-1', role: 'teacher' });
		mockAuthUser({ authId: 'teacher-1', name: 'Plain Teacher' });

		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow('Forbidden');
	});

	it('throws Forbidden when no viewer is authenticated', async () => {
		const t = convexTest(schema, modules);
		mockAuthUser(null);

		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow('Forbidden');
	});

	it('throws when CRON_SECRET is not configured for an admin viewer', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-1', role: 'admin' });
		mockAuthUser({ authId: 'admin-1', name: 'Real Admin' });

		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow(
			'CRON_SECRET is not configured'
		);
	});

	it('fails fast with missing Google credentials when CRON_SECRET is set', async () => {
		const t = convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-1', role: 'admin' });
		mockAuthUser({ authId: 'admin-1', name: 'Real Admin' });
		vi.stubEnv('CRON_SECRET', 'test-cron-secret');

		// Reaches getAccessToken, which fails because Google OAuth creds are absent
		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow(
			'Missing Google OAuth credentials'
		);
	});
});

// The Drive cold-archive and the DB hot-archive must serialize exactly the same
// snapshot shape. Both are built from the single `buildSnapshot` seam; if a table
// is added or removed there, every backup path must inherit it. This test locks
// that invariant so the two destinations can never silently diverge.
describe('backup snapshot parity across destinations', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv('CRON_SECRET', 'test-cron-secret');
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	const DATA_TABLES = [
		'students',
		'evaluations',
		'users',
		'categories',
		'classes',
		'houseEvents'
	] as (keyof BackupSnapshot)[];

	it('buildSnapshot exposes exactly the six application data tables', async () => {
		const t = convexTest(schema, modules);
		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));

		expect(Object.keys(snapshot).sort()).toEqual([...DATA_TABLES, 'exportedAt', 'version'].sort());
	});

	it('exportDataForCron carries the same data tables that buildSnapshot produces', async () => {
		const t = convexTest(schema, modules);

		const drive = await t.query(api.backup.exportDataForCron, {
			cronSecret: 'test-cron-secret'
		});
		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));

		expect(Object.keys(drive).sort()).toEqual(Object.keys(snapshot).sort());
		expect(DATA_TABLES.every((table) => drive[table] && snapshot[table])).toBe(true);
	});
});
