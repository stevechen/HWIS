import { expect, test, describe } from 'vitest';
import { convexTest, modules, createStudentWithClass, seedUser } from './test.setup';
import schema from './schema';
import { api, internal } from './_generated/api';
import { WEEK_MS, weekStartOf } from './shared/evaluation_week';
import { formatDateRange, getWeekNumber } from './shared/evaluation_utils';
import { countWeekStudents } from './weekly_report_snapshots';

type TestInstance = Awaited<ReturnType<typeof convexTest>>;

const HOUR_MS = 60 * 60 * 1000;

const currentWeekStart = () => weekStartOf(Date.now());

/** Monday 00:00 (Taipei) of the week `weeksAgo` weeks before the current one. */
const completedWeekStart = (weeksAgo: number) => currentWeekStart() - weeksAgo * WEEK_MS;

async function createFixture(t: TestInstance) {
	const { studentId: aliceId } = await createStudentWithClass(t, {
		englishName: 'Alice Chen',
		chineseName: '陳愛麗',
		studentId: 'STU9001',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
	});
	const { studentId: bobId } = await createStudentWithClass(t, {
		englishName: 'Bob Wang',
		chineseName: '王小明',
		studentId: 'STU9002',
		grade: 10,
		classNum: '1',
		status: 'Enrolled'
	});

	const teacherId = await seedUser(t, { authId: 'snapshot-teacher', name: 'Snapshot Teacher' });

	const categoryId = await t.mutation(api.categories.create, { name: 'Snapshot Category' });

	return { aliceId, bobId, teacherId, categoryId };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function addEvaluation(
	t: TestInstance,
	fixture: Fixture,
	timestamp: number,
	studentId: Fixture['aliceId'] = fixture.aliceId
) {
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: fixture.teacherId,
			value: 1,
			categoryId: fixture.categoryId,
			details: 'snapshot test',
			timestamp,
			semesterId: '2026-H1'
		});
	});
}

async function snapshotRows(t: TestInstance) {
	return await t.run(async (ctx) => await ctx.db.query('weekly_report_weeks').collect());
}

describe('weekly report snapshots', () => {
	test('countWeekStudents counts distinct students inside the week', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(1);

		await addEvaluation(t, fixture, weekStart + HOUR_MS);
		await addEvaluation(t, fixture, weekStart + 2 * HOUR_MS);
		await addEvaluation(t, fixture, weekStart + 3 * HOUR_MS, fixture.bobId);
		await addEvaluation(t, fixture, weekStart + WEEK_MS + HOUR_MS);

		const count = await t.run(async (ctx) => await countWeekStudents(ctx, weekStart));
		expect(count).toBe(2);
	});

	test('the week boundary is [Monday 00:00, next Monday 00:00)', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(1);

		await addEvaluation(t, fixture, weekStart);
		await addEvaluation(t, fixture, weekStart + WEEK_MS - 1, fixture.bobId);
		// Both of these belong to neighbouring weeks.
		await addEvaluation(t, fixture, weekStart - 1);
		await addEvaluation(t, fixture, weekStart + WEEK_MS, fixture.bobId);

		const count = await t.run(async (ctx) => await countWeekStudents(ctx, weekStart));
		expect(count).toBe(2);
	});

	test('refreshWeek persists the distinct count', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(1);

		await addEvaluation(t, fixture, weekStart + HOUR_MS);
		await addEvaluation(t, fixture, weekStart + 2 * HOUR_MS);
		await addEvaluation(t, fixture, weekStart + 3 * HOUR_MS, fixture.bobId);

		const result = await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });

		expect(result).toEqual({ weekStart, studentCount: 2 });
		const rows = await snapshotRows(t);
		expect(rows).toHaveLength(1);
		expect(rows[0].weekStart).toBe(weekStart);
		expect(rows[0].studentCount).toBe(2);
		expect(typeof rows[0].generatedAt).toBe('number');
	});

	test('refreshWeek is idempotent', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(1);

		await addEvaluation(t, fixture, weekStart + HOUR_MS);

		await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });
		await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });

		expect(await snapshotRows(t)).toHaveLength(1);
	});

	test('refreshWeek writes a zero row for a week with no evaluations', async () => {
		const t = await convexTest(schema, modules);
		const weekStart = completedWeekStart(2);

		const result = await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });

		expect(result.studentCount).toBe(0);
		const rows = await snapshotRows(t);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ weekStart, studentCount: 0 });
	});

	test('refreshWeek collapses duplicate rows for the same week', async () => {
		const t = await convexTest(schema, modules);
		const weekStart = completedWeekStart(1);

		await t.run(async (ctx) => {
			await ctx.db.insert('weekly_report_weeks', {
				weekStart,
				studentCount: 4,
				generatedAt: 1
			});
			await ctx.db.insert('weekly_report_weeks', {
				weekStart,
				studentCount: 7,
				generatedAt: 2
			});
		});

		await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });

		const rows = await snapshotRows(t);
		expect(rows).toHaveLength(1);
		expect(rows[0].studentCount).toBe(0);
	});

	test('refreshWeek heals a count after evaluations change outside the app', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(1);

		await addEvaluation(t, fixture, weekStart + HOUR_MS);
		expect(
			(await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart })).studentCount
		).toBe(1);

		await t.run(async (ctx) => {
			const rows = await ctx.db.query('evaluations').collect();
			for (const row of rows) await ctx.db.delete(row._id);
		});

		expect(
			(await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart })).studentCount
		).toBe(0);
	});

	test('refreshRecentWeeks refreshes the current week and the two before it', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);

		for (const weeksAgo of [0, 1, 2, 3]) {
			await addEvaluation(t, fixture, completedWeekStart(weeksAgo) + HOUR_MS);
		}

		await t.mutation(internal.weekly_report_snapshots.refreshRecentWeeks, {});

		const weeks = (await snapshotRows(t)).map((row) => row.weekStart).sort((a, b) => b - a);
		expect(weeks).toEqual([completedWeekStart(0), completedWeekStart(1), completedWeekStart(2)]);
	});

	test('refreshRecentWeeks skips when nothing was written since the last refresh', async () => {
		const t = await convexTest(schema, modules);

		const first = await t.mutation(internal.weekly_report_snapshots.refreshRecentWeeks, {});
		expect(first.skipped).toBe(false);
		const rowsBefore = await snapshotRows(t);

		const second = await t.mutation(internal.weekly_report_snapshots.refreshRecentWeeks, {});
		expect(second.skipped).toBe(true);
		expect(second.refreshed).toEqual([]);
		expect(await snapshotRows(t)).toEqual(rowsBefore);
	});

	test('refreshRecentWeeks runs again when the audit trail is newer than the rows', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(1);

		await addEvaluation(t, fixture, weekStart + HOUR_MS);
		expect(
			(await t.mutation(internal.weekly_report_snapshots.refreshRecentWeeks, {})).skipped
		).toBe(false);

		// A second evaluation plus the audit-log entry `evaluations.create` writes.
		await addEvaluation(t, fixture, weekStart + 2 * HOUR_MS, fixture.bobId);
		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create',
				performerId: fixture.teacherId,
				targetTable: 'evaluations',
				targetId: 'snapshot-test-target',
				timestamp: Date.now() + 60_000
			});
		});

		const result = await t.mutation(internal.weekly_report_snapshots.refreshRecentWeeks, {});
		expect(result.skipped).toBe(false);

		const row = (await snapshotRows(t)).find((candidate) => candidate.weekStart === weekStart);
		expect(row?.studentCount).toBe(2);
	});

	test('rebuildChunk processes at most eight weeks and chains to the next chunk', async () => {
		const t = await convexTest(schema, modules);
		const startWeekStart = completedWeekStart(20);
		const endWeekStart = completedWeekStart(0) + WEEK_MS; // include the current week

		let cursor = startWeekStart;
		const processed: number[] = [];
		for (let round = 0; round < 10; round++) {
			const result = await t.mutation(internal.weekly_report_snapshots.rebuildChunk, {
				startWeekStart: cursor,
				endWeekStart
			});
			processed.push(result.processed);
			if (result.nextCursor === null) break;
			cursor = result.nextCursor;
		}

		expect(processed).toEqual([8, 8, 5]);
		expect(await snapshotRows(t)).toHaveLength(21);
	});

	test('rebuildChunk leaves no scheduling behind under the test runtime', async () => {
		const t = await convexTest(schema, modules);
		const result = await t.mutation(internal.weekly_report_snapshots.rebuildChunk, {
			startWeekStart: completedWeekStart(20),
			endWeekStart: completedWeekStart(0) + WEEK_MS
		});
		expect(result.scheduledNextChunk).toBe(false);
	});

	test('startBackfill reports the full history range instead of scheduling in tests', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const earliestWeek = completedWeekStart(6);
		await addEvaluation(t, fixture, earliestWeek + HOUR_MS);

		const result = await t.mutation(internal.weekly_report_snapshots.startBackfill, {});

		expect(result).toEqual({
			scheduled: false,
			startWeekStart: earliestWeek,
			endWeekStart: completedWeekStart(0) + WEEK_MS
		});
	});

	test('startRebuild covers the rolling 52-week window', async () => {
		const t = await convexTest(schema, modules);

		const result = await t.mutation(internal.weekly_report_snapshots.startRebuild, {});

		expect(result).toEqual({
			scheduled: false,
			startWeekStart: completedWeekStart(52),
			endWeekStart: completedWeekStart(0) + WEEK_MS
		});
	});

	test('previewBackfill reports diffs without writing', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(1);

		await addEvaluation(t, fixture, weekStart + HOUR_MS);
		await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });
		await addEvaluation(t, fixture, weekStart + 2 * HOUR_MS, fixture.bobId);

		const preview = await t.query(internal.weekly_report_snapshots.previewBackfill, {
			startWeekStart: weekStart,
			endWeekStart: weekStart + WEEK_MS
		});

		expect(preview.diffs).toEqual([{ weekStart, live: 2, stored: 1, delta: 1 }]);
		expect(preview.nextCursor).toBeNull();
		expect((await snapshotRows(t))[0].studentCount).toBe(1);
	});

	test('previewBackfill defaults to all recorded history', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		const weekStart = completedWeekStart(6);
		await addEvaluation(t, fixture, weekStart + HOUR_MS);

		const preview = await t.query(internal.weekly_report_snapshots.previewBackfill, {});

		expect(preview.diffs[0]).toEqual({ weekStart, live: 1, stored: null, delta: 1 });
		expect(preview.diffs.length).toBeGreaterThan(1);
		expect(preview.diffs.every((diff) => diff.weekStart >= weekStart)).toBe(true);
	});

	test('cronRefresh bootstraps a full backfill when completed weeks are missing', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		await addEvaluation(t, fixture, completedWeekStart(3) + HOUR_MS);

		const result = await t.mutation(internal.weekly_report_snapshots.cronRefresh, {});

		expect(result.mode).toBe('backfill');
	});

	test('cronRefresh falls back to refreshing recent weeks once the span is materialized', async () => {
		const t = await convexTest(schema, modules);
		const fixture = await createFixture(t);
		await addEvaluation(t, fixture, completedWeekStart(2) + HOUR_MS);

		await t.mutation(internal.weekly_report_snapshots.refreshWeek, {
			weekStart: completedWeekStart(2)
		});
		await t.mutation(internal.weekly_report_snapshots.refreshWeek, {
			weekStart: completedWeekStart(1)
		});

		const result = await t.mutation(internal.weekly_report_snapshots.cronRefresh, {});

		expect(result.mode).toBe('recent');
	});
});

describe('weekly report date labels', () => {
	test('formatDateRange labels a Taipei Monday as that Monday', () => {
		// Monday 2026-10-12 00:00 Taipei == 2026-10-11 16:00 UTC. Rendering with
		// host-local getters (UTC on Convex) used to print "Oct 11 - Oct 15".
		const monday = Date.parse('2026-10-11T16:00:00Z');
		expect(weekStartOf(monday)).toBe(monday);
		expect(formatDateRange(monday)).toBe('Oct 12 - Oct 16, 2026');
	});

	test('getWeekNumber is independent of the host timezone', () => {
		const monday = Date.parse('2026-10-11T16:00:00Z'); // 2026-10-12 Taipei
		expect(getWeekNumber(monday)).toBe(41);
		expect(getWeekNumber(weekStartOf(Date.now()) - WEEK_MS)).toBe(
			getWeekNumber(currentWeekStart() - WEEK_MS)
		);
	});
});
