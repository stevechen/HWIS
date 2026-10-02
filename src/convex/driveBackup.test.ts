import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import { api } from './_generated/api';
import { buildSnapshot } from './shared/backup_snapshot';
import type { BackupSnapshot } from './shared/backup_snapshot';
import {
	buildDriveBackupFilename,
	decideDriveUpload,
	resolveDriveEnvironment,
	resolveDriveEnvironmentFromEnv
} from './shared/drive_backup_target';
import schema from './schema';

describe('driveBackup.backupToDrive auth and config guards', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv('CRON_SECRET', undefined);
		vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
		vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined);
		vi.stubEnv('GOOGLE_REFRESH_TOKEN', undefined);
		vi.stubEnv('GOOGLE_DRIVE_FOLDER_ID', undefined);
		// The environment guard runs before the credential check, so these
		// auth/credential tests are stated on prod — the only deployment that
		// uploads. The guard itself is covered separately below.
		vi.stubEnv('CONVEX_DEPLOYMENT', 'prod:hwis');
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

		// Reaches getAccessToken, which fails because no Drive credential is set
		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow(
			'Missing Google OAuth credentials'
		);
	});
});

// The Drive leg of a backup is a production-only, environment-addressed write.
// A non-prod deployment holding prod's credentials and folder id used to be able
// to drop a same-name duplicate into the production archive, which is the failure
// these tests exist to prevent.
describe('driveBackup environment targeting', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv('CRON_SECRET', 'test-cron-secret');
		vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
		vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined);
		vi.stubEnv('GOOGLE_REFRESH_TOKEN', undefined);
		vi.stubEnv('GOOGLE_DRIVE_FOLDER_ID', 'prod-folder-id');
		vi.stubEnv('ALLOW_NONPROD_DRIVE_BACKUP', undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	async function adminTest() {
		const t = convexTest(schema, modules);
		await seedUser(t, { authId: 'admin-1', role: 'admin' });
		mockAuthUser({ authId: 'admin-1', name: 'Real Admin' });
		return t;
	}

	it('refuses to upload on a dev deployment even when it holds prod credentials', async () => {
		vi.stubEnv('CONVEX_DEPLOYMENT', 'dev:happy-otter-123');
		const t = await adminTest();

		// Credentials and folder are present, so only the environment guard can stop
		// this — which is exactly the production-folder case from the incident.
		const result = await t.action(api.driveBackup.backupToDrive, {});

		expect(result).toMatchObject({ success: false, skipped: true, environment: 'dev' });
		expect(result.filename).toBe(`backup-dev-${new Date().toISOString().split('T')[0]}.json`);
	});

	it('refuses to upload on a local deployment', async () => {
		vi.stubEnv('CONVEX_DEPLOYMENT', 'local:hwis');
		const t = await adminTest();

		const result = await t.action(api.driveBackup.backupToDrive, {});

		expect(result).toMatchObject({ success: false, skipped: true, environment: 'local' });
	});

	it('still fails loudly on prod when Google credentials are missing', async () => {
		vi.stubEnv('CONVEX_DEPLOYMENT', 'prod:hwis');
		const t = await adminTest();

		// A skip must never be how prod discovers it has lost its credentials.
		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow(
			'Missing Google OAuth credentials'
		);
	});
});
