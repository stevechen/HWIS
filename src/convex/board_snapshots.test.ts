/// <reference types="vite/client" />
import { convexTest, modules, mockAuthUser, seedUser, createStudentWithClass } from './test.setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

/**
 * Tests for the precomputed leaderboard snapshots (ADR-0020). The boards read
 * `leaderboard_snapshots` instead of running the full evaluations aggregation
 * on every page load; a cron refreshes snapshots only when evaluations changed.
 */

function boardAdminAuth() {
	mockAuthUser({ authId: 'board-admin', name: 'Board Admin', role: 'admin', status: 'active' });
}

async function seedTeacher(t: ReturnType<typeof convexTest>) {
	return seedUser(t, {
		authId: 'board-admin',
		name: 'Board Admin',
		role: 'admin',
		status: 'active'
	});
}

describe('board_snapshots', () => {
	beforeEach(() => boardAdminAuth());
	afterEach(() => vi.restoreAllMocks());

	it('falls back to live computation when no snapshot exists yet', async () => {
		const t = convexTest(schema, modules);
		const teacherId = await seedTeacher(t);
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Snap One',
			chineseName: '快照一',
			studentId: '7100001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		await t.run(async (ctx) => {
			const categoryId = await ctx.db.insert('point_categories', { name: 'Academic' });
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 7,
				categoryId,
				details: 'Snapshot test evaluation',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const stats = await t.query(api.board_snapshots.getClassStats, {});
		const cls = stats.classes.find((c: { studentCount: number }) => Boolean(c.studentCount));
		expect(cls?.totalPoints).toBe(7);
		// No snapshot row should have been written by the read path.
		const rows = await t.run((ctx) => ctx.db.query('leaderboard_snapshots').collect());
		expect(rows).toHaveLength(0);
	});

	it('serves the stored snapshot after refresh and skips refresh when unchanged', async () => {
		const t = convexTest(schema, modules);
		const teacherId = await seedTeacher(t);
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Snap Two',
			chineseName: '快照二',
			studentId: '7100002',
			grade: 10,
			classNum: '2',
			status: 'Enrolled'
		});
		await t.run(async (ctx) => {
			const categoryId = await ctx.db.insert('point_categories', { name: 'Academic' });
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 3,
				categoryId,
				details: 'Snapshot test evaluation',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});

		const live = await t.query(api.board_snapshots.getClassStats, {});

		const first = await t.mutation(internal.board_snapshots.refresh, { board: 'classes' });
		expect(first).toEqual({ skipped: false });

		const fromSnapshot = await t.query(api.board_snapshots.getClassStats, {});
		// Snapshot payload must match the live computation byte-for-byte.
		expect(fromSnapshot).toEqual(live);

		// Unchanged data → second refresh is a no-op (no quota spent on recompute).
		const second = await t.mutation(internal.board_snapshots.refresh, { board: 'classes' });
		expect(second).toEqual({ skipped: true });
	});

	it('recomputes after evaluations change (watermark moves)', async () => {
		const t = convexTest(schema, modules);
		const teacherId = await seedTeacher(t);
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Snap Three',
			chineseName: '快照三',
			studentId: '7100003',
			grade: 9,
			classNum: '1',
			status: 'Enrolled'
		});
		await t.run(async (ctx) => {
			const categoryId = await ctx.db.insert('point_categories', { name: 'Academic' });
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 5,
				categoryId,
				details: 'Snapshot test evaluation',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});
		await t.mutation(internal.board_snapshots.refresh, { board: 'classes' });

		await t.run(async (ctx) => {
			const categoryId = await ctx.db.insert('point_categories', { name: 'Academic' });
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 4,
				categoryId,
				details: 'Snapshot test evaluation',
				// Strictly newer than the first row so the max-timestamp watermark moves.
				timestamp: Date.now() + 1000,
				semesterId: '2024-1'
			});
		});
		const second = await t.mutation(internal.board_snapshots.refresh, { board: 'classes' });
		expect(second).toEqual({ skipped: false });

		const stats = await t.query(api.board_snapshots.getClassStats, {});
		const cls = stats.classes.find((c: { studentCount: number }) => Boolean(c.studentCount));
		expect(cls?.totalPoints).toBe(9);
	});

	it('force refresh recomputes even when the watermark is unchanged', async () => {
		const t = convexTest(schema, modules);
		const teacherId = await seedTeacher(t);
		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Snap Four',
			chineseName: '快照四',
			studentId: '7100004',
			grade: 9,
			classNum: '2',
			status: 'Enrolled'
		});
		await t.run(async (ctx) => {
			const categoryId = await ctx.db.insert('point_categories', { name: 'Academic' });
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Snapshot test evaluation',
				timestamp: Date.now(),
				semesterId: '2024-1'
			});
		});
		await t.mutation(internal.board_snapshots.refresh, { board: 'classes' });

		// Tamper with the stored stats to prove force actually recomputes.
		// (withIndex is unavailable inside t.run — convex-test widens the data
		// model — so scan; the test DB holds a handful of rows.)
		await t.run(async (ctx) => {
			const rows = await ctx.db.query('leaderboard_snapshots').collect();
			const row = rows.find((r) => r.board === 'classes');
			await ctx.db.patch(row!._id, { stats: JSON.stringify({ corrupted: true }) });
		});

		const forced = await t.mutation(internal.board_snapshots.refresh, {
			board: 'classes',
			force: true
		});
		expect(forced).toEqual({ skipped: false });

		const stats = await t.query(api.board_snapshots.getClassStats, {});
		const cls = stats.classes.find((c: { studentCount: number }) => Boolean(c.studentCount));
		expect(cls?.totalPoints).toBe(1);
	});

	it('tracks the houses board independently from classes', async () => {
		const t = convexTest(schema, modules);
		await seedTeacher(t);
		await createStudentWithClass(t, {
			englishName: 'Snap Five',
			chineseName: '快照五',
			studentId: '7100005',
			grade: 9,
			classNum: '1',
			status: 'Enrolled'
		});
		await t.mutation(internal.board_snapshots.refresh, { board: 'houses' });

		const rows = await t.run((ctx) => ctx.db.query('leaderboard_snapshots').collect());
		expect(rows).toHaveLength(1);
		expect(rows[0].board).toBe('houses');

		const houses = await t.query(api.board_snapshots.getHouseStats, {});
		expect(houses.houses).toHaveLength(4);
	});
});
