import { expect, test, describe } from 'vitest';
import { convexTest, modules } from './test.setup';
import schema from './schema';
import {
	buildSnapshot,
	insertBackupRecord,
	parseBackupSnapshot,
	SNAPSHOT_VERSION
} from './shared/backup_snapshot';

describe('backup snapshot', () => {
	test('buildSnapshot collects all six tables plus exportedAt and version', async () => {
		const t = convexTest(schema, modules);

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Snapshot Student',
				chineseName: '快照學生',
				studentId: 'STU001',
				classId,
				status: 'Enrolled',
				house: 'Heracles'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'snapshot-teacher',
				name: 'Snapshot Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', { name: 'Creativity' });
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Great work',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Sports Day',
				startDate: Date.now(),
				endDate: Date.now() + 86400000,
				housePoints: { Heracles: 100 }
			});
		});

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));

		expect(snapshot.version).toBe(SNAPSHOT_VERSION);
		expect(snapshot.version).toBe('1.0');
		expect(snapshot.exportedAt).toEqual(expect.any(String));
		expect(snapshot.students).toHaveLength(1);
		expect(snapshot.evaluations).toHaveLength(1);
		expect(snapshot.users).toHaveLength(1);
		expect(snapshot.categories).toHaveLength(1);
		expect(snapshot.classes).toHaveLength(1);
		expect(snapshot.houseEvents).toHaveLength(1);

		expect(snapshot.students[0].house).toBe('Heracles');
		expect(snapshot.houseEvents[0].housePoints?.Heracles).toBe(100);
	});

	test('buildSnapshot includes every table even when empty', async () => {
		const t = convexTest(schema, modules);

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));

		expect(snapshot.students).toHaveLength(0);
		expect(snapshot.evaluations).toHaveLength(0);
		expect(snapshot.users).toHaveLength(0);
		expect(snapshot.categories).toHaveLength(0);
		expect(snapshot.classes).toHaveLength(0);
		expect(snapshot.houseEvents).toHaveLength(0);
		expect(snapshot.version).toBe('1.0');
	});

	test('insertBackupRecord stores the snapshot with a backup filename and e2eTag', async () => {
		const t = convexTest(schema, modules);

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));
		const backupId = await t.run(async (ctx) => insertBackupRecord(ctx, snapshot, 'snapshot-e2e'));

		const backup = await t.run(async (ctx) => ctx.db.get(backupId));

		expect(backup).toBeDefined();
		expect(backup!.filename).toMatch(/^backup-\d+\.json$/);
		expect(backup!.e2eTag).toBe('snapshot-e2e');
		expect(backup!.data).toMatchObject({
			version: '1.0',
			students: [],
			evaluations: [],
			users: [],
			categories: [],
			classes: [],
			houseEvents: []
		});
	});

	test('insertBackupRecord chunks a snapshot larger than the 200KB limit', async () => {
		const t = convexTest(schema, modules);

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Big Student',
				chineseName: '大學生',
				studentId: 'STU001',
				classId,
				status: 'Enrolled',
				note: 'x'.repeat(250_000),
				house: 'Heracles'
			});
		});

		const snapshot = await t.run(async (ctx) => buildSnapshot(ctx));
		const serialized = JSON.stringify(snapshot);
		expect(serialized.length).toBeGreaterThan(200_000);

		const backupId = await t.run(async (ctx) =>
			insertBackupRecord(ctx, snapshot, 'big-snapshot-e2e')
		);

		const backup = await t.run(async (ctx) => ctx.db.get(backupId));
		expect(backup!.data).toBeUndefined();
		expect(backup!.studentsCount).toBe(1);
		expect(backup!.chunkCount).toBe(Math.ceil(serialized.length / 200_000));

		const chunks = await t.run(async (ctx) =>
			(await ctx.db.query('backup_chunks').collect()).filter((c) => c.backupId === backupId)
		);
		expect(chunks).toHaveLength(backup!.chunkCount!);
		expect(chunks.map((c) => c.data).join('')).toBe(serialized);

		const parsed = parseBackupSnapshot(chunks.sort((a, b) => a.chunkIndex - b.chunkIndex));
		expect(JSON.parse(JSON.stringify(parsed))).toEqual(JSON.parse(serialized));
	});
});
