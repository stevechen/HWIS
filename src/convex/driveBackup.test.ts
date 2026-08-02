import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import { api } from './_generated/api';
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
