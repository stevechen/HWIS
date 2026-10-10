import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import { api } from './_generated/api';
import { buildSnapshot } from './shared/backup_snapshot';
import type { BackupSnapshot } from './shared/backup_snapshot';
import {
	assessBackupFreshness,
	buildDriveBackupFilename,
	decideDriveUpload,
	describeMissingDriveCredential,
	formatBackupAge,
	resolveDriveCredential,
	resolveDriveEnvironment,
	resolveDriveEnvironmentFromEnv,
	STALE_AFTER_MS
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
		const t = await convexTest(schema, modules);

		await seedUser(t, { authId: 'teacher-1', role: 'teacher' });
		mockAuthUser({ authId: 'teacher-1', name: 'Plain Teacher' });

		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow('Forbidden');
	});

	it('throws Forbidden when no viewer is authenticated', async () => {
		const t = await convexTest(schema, modules);
		mockAuthUser(null);

		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow('Forbidden');
	});

	it('throws when CRON_SECRET is not configured for an admin viewer', async () => {
		const t = await convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-1', role: 'admin' });
		mockAuthUser({ authId: 'admin-1', name: 'Real Admin' });

		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow(
			'CRON_SECRET is not configured'
		);
	});

	it('fails fast with missing Google credentials when CRON_SECRET is set', async () => {
		const t = await convexTest(schema, modules);

		await seedUser(t, { authId: 'admin-1', role: 'admin' });
		mockAuthUser({ authId: 'admin-1', name: 'Real Admin' });
		vi.stubEnv('CRON_SECRET', 'test-cron-secret');

		// Reaches getAccessToken, which fails because no Drive credential is set
		await expect(t.action(api.driveBackup.backupToDrive, {})).rejects.toThrow(
			'Missing Google credentials'
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
		const t = await convexTest(schema, modules);
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
			'Missing Google credentials'
		);
	});
});

describe('resolveDriveCredential', () => {
	const SERVICE_ACCOUNT = {
		GOOGLE_SERVICE_ACCOUNT_EMAIL: 'hwis-backup@hwis.iam.gserviceaccount.com',
		GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
			'-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
	};

	it('prefers the service account even when a refresh token is also present', () => {
		// The service account is the durable credential; a leftover refresh token
		// must never win, or the deployment silently keeps its 7-day expiry.
		const credential = resolveDriveCredential({
			...SERVICE_ACCOUNT,
			GOOGLE_CLIENT_ID: 'id',
			GOOGLE_CLIENT_SECRET: 'secret',
			GOOGLE_REFRESH_TOKEN: '1//legacy'
		});

		expect(credential).toMatchObject({ kind: 'service_account' });
	});

	it('falls back to the refresh token while migrating', () => {
		const credential = resolveDriveCredential({
			GOOGLE_CLIENT_ID: 'id',
			GOOGLE_CLIENT_SECRET: 'secret',
			GOOGLE_REFRESH_TOKEN: '1//legacy'
		});

		expect(credential).toMatchObject({ kind: 'user_refresh_token', refreshToken: '1//legacy' });
	});

	it('unescapes newlines in a PEM pasted into an env var', () => {
		// Env vars and pasted JSON routinely keep literal "\n". google-auth-library
		// signs with this string, so an escaped PEM would fail to parse with an
		// opaque error rather than saying the newlines were escaped.
		const credential = resolveDriveCredential({
			GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com',
			GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
				'-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
		});

		expect(credential).toMatchObject({ kind: 'service_account' });
		const key = credential?.kind === 'service_account' ? credential.privateKey : '';
		expect(key).toContain('-----BEGIN PRIVATE KEY-----\nabc\n');
		expect(key).not.toContain('\\n');
	});

	it('returns null when a service account is only half configured', () => {
		// Half a credential must not read as present, or the failure surfaces as an
		// opaque JWT parse error instead of naming the missing variable.
		expect(
			resolveDriveCredential({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com' })
		).toBeNull();
		expect(resolveDriveCredential({ GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'key' })).toBeNull();
	});

	it('returns null when nothing is configured at all', () => {
		expect(resolveDriveCredential({})).toBeNull();
	});
});

describe('describeMissingDriveCredential', () => {
	it('names both variables when none are set, preferring the service account', () => {
		expect(describeMissingDriveCredential({})).toContain('GOOGLE_SERVICE_ACCOUNT_EMAIL');
		expect(describeMissingDriveCredential({})).toContain('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
	});

	it('names the actually missing half when an email is set without a key', () => {
		const message = describeMissingDriveCredential({
			GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.iam.gserviceaccount.com'
		});

		expect(message).toContain('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
		expect(message).toContain('is set but');
	});
});

describe('resolveDriveEnvironmentFromEnv', () => {
	it('recognises prod from NODE_ENV alone, with no deployment name set', () => {
		// The real prod failure: CONVEX_DEPLOYMENT is a CLI build-time variable and
		// is NOT set inside a Convex deployment, so relying on it alone made prod
		// classify as unknown and the guard refused every upload. A backup must not
		// go dark because an env var is missing.
		expect(resolveDriveEnvironmentFromEnv({ NODE_ENV: 'production' })).toBe('prod');
	});

	it('still refuses a non-production NODE_ENV with no deployment name', () => {
		// NODE_ENV is checked for an exact value, not for presence. A dev or preview
		// deployment must not be mistaken for prod by carrying the variable at all.
		expect(resolveDriveEnvironmentFromEnv({ NODE_ENV: 'development' })).toBe('unknown');
		expect(resolveDriveEnvironmentFromEnv({ NODE_ENV: 'test' })).toBe('unknown');
	});

	it('prefers CONVEX_DEPLOYMENT, which is what the Convex backend has', () => {
		expect(
			resolveDriveEnvironmentFromEnv({ CONVEX_DEPLOYMENT: 'prod:hwis', BACKUP_DEPLOYMENT: 'dev:x' })
		).toBe('prod');
	});

	it('falls back to BACKUP_DEPLOYMENT, which is how the Vercel route names itself', () => {
		expect(resolveDriveEnvironmentFromEnv({ BACKUP_DEPLOYMENT: 'prod:hwis' })).toBe('prod');
	});

	it('refuses an unlabelled environment rather than guessing prod', () => {
		expect(resolveDriveEnvironmentFromEnv({})).toBe('unknown');
	});
});

describe('resolveDriveEnvironment', () => {
	it.each([
		['prod:hwis', 'prod'],
		['dev:happy-otter-123', 'dev'],
		['local:hwis', 'local'],
		['anonymous-app:hwis', 'unknown'],
		['', 'unknown'],
		[undefined, 'unknown']
	])('classifies %s as %s', (deployment, expected) => {
		expect(resolveDriveEnvironment(deployment)).toBe(expected);
	});
});

describe('assessBackupFreshness', () => {
	const now = Date.parse('2026-10-03T12:00:00.000Z');

	it('treats a heartbeat from minutes ago as fresh', () => {
		expect(assessBackupFreshness(now - 60 * 60 * 1000, now)).toMatchObject({ ok: true });
	});

	// The nightly cron runs at 20:00 UTC, so a heartbeat is ~24h old when the
	// watchdog next runs. Without headroom this would flap red every morning.
	it('tolerates a heartbeat one full day old', () => {
		expect(assessBackupFreshness(now - 24 * 60 * 60 * 1000, now)).toMatchObject({ ok: true });
	});

	it('is still fresh just inside the 26h window', () => {
		expect(assessBackupFreshness(now - STALE_AFTER_MS + 1000, now)).toMatchObject({ ok: true });
	});

	it('is still fresh at exactly the window boundary', () => {
		expect(assessBackupFreshness(now - STALE_AFTER_MS, now)).toMatchObject({ ok: true });
	});

	it('is stale one millisecond past the window boundary', () => {
		expect(assessBackupFreshness(now - STALE_AFTER_MS - 1, now)).toMatchObject({
			ok: false,
			reason: 'stale'
		});
	});

	// This is the July failure: the refresh token expired and no night succeeded.
	it('is stale when the last success was two nights ago', () => {
		expect(assessBackupFreshness(now - 48 * 60 * 60 * 1000, now)).toMatchObject({
			ok: false,
			reason: 'stale'
		});
	});

	it.each([[null], [undefined]])('reports never when no heartbeat exists (%s)', (value) => {
		expect(assessBackupFreshness(value, now)).toEqual({ ok: false, reason: 'never', ageMs: null });
	});
});

describe('formatBackupAge', () => {
	it('describes a missing heartbeat as never', () => {
		expect(formatBackupAge(null)).toBe('never');
	});

	it('pluralizes hours and days', () => {
		expect(formatBackupAge(60 * 60 * 1000)).toBe('1 hour');
		expect(formatBackupAge(5 * 60 * 60 * 1000)).toBe('5 hours');
		expect(formatBackupAge(48 * 60 * 60 * 1000)).toBe('2 days');
	});
});

describe('buildDriveBackupFilename', () => {
	const day = new Date('2026-02-18T12:00:00.000Z');

	it.each(['prod', 'dev', 'local', 'unknown'] as const)('prefixes the environment on %s', (env) => {
		expect(buildDriveBackupFilename(env, day)).toBe(`backup-${env}-2026-02-18.json`);
	});

	it('never produces a bare date filename that could collide with another environment', () => {
		expect(buildDriveBackupFilename('dev', day)).not.toBe('backup-2026-02-18.json');
	});
});

describe('decideDriveUpload', () => {
	it('always allows prod, the archive the records obligation rests on', () => {
		expect(
			decideDriveUpload({ environment: 'prod', nonProdUploadOptIn: false, folderId: undefined })
		).toMatchObject({ allowed: true });
	});

	it.each(['dev', 'local', 'unknown'] as const)('refuses %s without an opt-in', (environment) => {
		const decision = decideDriveUpload({
			environment,
			nonProdUploadOptIn: false,
			folderId: 'some-folder'
		});

		expect(decision.allowed).toBe(false);
		expect(decision.allowed === false && decision.reason).toContain('ALLOW_NONPROD_DRIVE_BACKUP');
	});

	it('refuses a non-prod opt-in that names no folder of its own', () => {
		const decision = decideDriveUpload({
			environment: 'dev',
			nonProdUploadOptIn: true,
			folderId: undefined
		});

		expect(decision.allowed).toBe(false);
		expect(decision.allowed === false && decision.reason).toContain('GOOGLE_DRIVE_FOLDER_ID');
	});

	it('allows a non-prod deployment that opted in and owns a folder', () => {
		expect(
			decideDriveUpload({
				environment: 'dev',
				nonProdUploadOptIn: true,
				folderId: 'scratch-folder'
			})
		).toMatchObject({ allowed: true });
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
		const t = await convexTest(schema, modules);
		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));

		expect(Object.keys(snapshot).sort()).toEqual([...DATA_TABLES, 'exportedAt', 'version'].sort());
	});

	it('exportDataForCron carries the same data tables that buildSnapshot produces', async () => {
		const t = await convexTest(schema, modules);

		const drive = await t.query(api.backup.exportDataForCron, {
			cronSecret: 'test-cron-secret'
		});
		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));

		expect(Object.keys(drive).sort()).toEqual(Object.keys(snapshot).sort());
		expect(DATA_TABLES.every((table) => drive[table] && snapshot[table])).toBe(true);
	});
});
