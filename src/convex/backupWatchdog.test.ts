import { describe, expect, it } from 'vite-plus/test';
import { convexTest, modules, seedUser, mockAuthUser, type ConvexTestInstance } from './test.setup';
import schema from './schema';
import { api, internal } from './_generated/api';
import { STALE_AFTER_MS } from './shared/drive_backup_target';

async function adminTest() {
	const t = await convexTest(schema, modules);
	await seedUser(t, { authId: 'admin-1', role: 'admin' });
	mockAuthUser({ authId: 'admin-1', name: 'Admin' });
	return t;
}

async function record(
	t: ConvexTestInstance,
	department: 'international' | 'esl',
	completedAt?: number
) {
	if (completedAt === undefined) {
		await t.mutation(internal.backupWatchdog.recordBackupSuccess, {
			filename: `backup-prod-${department === 'esl' ? 'esl-' : ''}2026-10-19.json`,
			environment: 'prod',
			department
		});
		return;
	}

	await t.run(async (ctx) => {
		await ctx.db.insert('backupHeartbeats', {
			completedAt,
			filename: `backup-${department}-old.json`,
			environment: 'prod',
			department
		});
	});
}

describe('backupWatchdog department heartbeats', () => {
	it('records one heartbeat per department and reads each independently', async () => {
		const t = await convexTest(schema, modules);

		await record(t, 'international');
		await record(t, 'esl');

		const international = await t.query(internal.backupWatchdog.latestHeartbeat, {
			department: 'international'
		});
		const esl = await t.query(internal.backupWatchdog.latestHeartbeat, { department: 'esl' });

		expect(international?.filename).toContain('backup-prod-2026');
		expect(esl?.filename).toContain('backup-prod-esl-2026');
		expect(esl?.department).toBe('esl');
	});

	it('treats a legacy heartbeat without a department as international', async () => {
		const t = await convexTest(schema, modules);
		await t.run((ctx) =>
			ctx.db.insert('backupHeartbeats', {
				completedAt: Date.now(),
				filename: 'backup-prod-2026-01-01.json',
				environment: 'prod'
			})
		);

		const international = await t.query(internal.backupWatchdog.latestHeartbeat, {
			department: 'international'
		});
		const esl = await t.query(internal.backupWatchdog.latestHeartbeat, { department: 'esl' });

		expect(international?.filename).toBe('backup-prod-2026-01-01.json');
		expect(esl).toBeNull();
	});
});

describe('backupWatchdog freshness', () => {
	it('reports fresh when both departments have a recent heartbeat', async () => {
		const t = await adminTest();
		await record(t, 'international');
		await record(t, 'esl');

		const freshness = await t.query(api.backupWatchdog.getBackupFreshness, {});

		expect(freshness.departments).toHaveLength(2);
		expect(freshness.departments.every((entry) => entry.freshness.ok)).toBe(true);
		expect(freshness.freshness.ok).toBe(true);
	});

	it('surfaces a stale ESL archive even when HWIS is healthy', async () => {
		const t = await adminTest();
		await record(t, 'international');
		await record(t, 'esl', Date.now() - STALE_AFTER_MS - 60_000);

		const freshness = await t.query(api.backupWatchdog.getBackupFreshness, {});

		expect(freshness.department).toBe('esl');
		expect(freshness.freshness).toMatchObject({ ok: false, reason: 'stale' });
	});

	it('can report a single requested department', async () => {
		const t = await adminTest();
		await record(t, 'international');
		await record(t, 'esl');

		const hwis = await t.query(api.backupWatchdog.getBackupFreshness, {
			department: 'international'
		});
		const esl = await t.query(api.backupWatchdog.getBackupFreshness, { department: 'esl' });

		expect(hwis.department).toBe('international');
		expect(esl.department).toBe('esl');
	});

	it('fails the cron watchdog when either department has never backed up', async () => {
		const t = await convexTest(schema, modules);
		await record(t, 'international');

		await expect(t.action(internal.backupWatchdog.checkBackupFreshness, {})).rejects.toThrow(
			/esl: no successful backup/
		);
	});

	it('fails the cron watchdog when either department is stale', async () => {
		const t = await convexTest(schema, modules);
		await record(t, 'international');
		await record(t, 'esl', Date.now() - STALE_AFTER_MS - 60_000);

		await expect(t.action(internal.backupWatchdog.checkBackupFreshness, {})).rejects.toThrow(
			/esl: last successful backup/
		);
	});

	it('passes the cron watchdog when both departments are fresh', async () => {
		const t = await convexTest(schema, modules);
		await record(t, 'international');
		await record(t, 'esl');

		const result = await t.action(internal.backupWatchdog.checkBackupFreshness, {});

		expect(result.ok).toBe(true);
		expect(result.departments.map((entry) => entry.department).sort()).toEqual([
			'esl',
			'international'
		]);
	});
});
