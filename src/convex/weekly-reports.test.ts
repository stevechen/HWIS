import { expect, test, describe } from 'vite-plus/test';
import { convexTest, modules, createStudentWithClass, seedUser } from './test.setup';
import schema from './schema';
import { api, internal } from './_generated/api';
import { getWeekNumber } from './shared/evaluation_utils';
import { WEEK_MS, weekStartOf } from './shared/evaluation_week';
import type { Id } from './_generated/dataModel';

type TestInstance = Awaited<ReturnType<typeof convexTest>>;

const HOUR_MS = 60 * 60 * 1000;

const currentWeekStart = () => weekStartOf(Date.now());
/** Monday 00:00 (Taipei) of the week `weeksAgo` weeks before the current one. */
const completedWeekStart = (weeksAgo: number) => currentWeekStart() - weeksAgo * WEEK_MS;

async function createTeacher(t: TestInstance) {
	return await seedUser(t, { authId: 'test-auth-id', name: 'Test Teacher' });
}

async function addEvaluation(
	t: TestInstance,
	options: {
		studentId: Id<'students'>;
		teacherId: Id<'users'>;
		categoryId: Id<'point_categories'>;
		timestamp: number;
		value?: number;
		details?: string;
	}
) {
	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId: options.studentId,
			teacherId: options.teacherId,
			value: options.value ?? 1,
			categoryId: options.categoryId,
			details: options.details ?? 'Evaluation',
			timestamp: options.timestamp,
			semesterId: '2026-H1'
		});
	});
}

async function listReports(t: TestInstance, args: { sinceTimestamp?: number } = {}) {
	return await t.run(async (ctx) => await ctx.runQuery(api.evaluations.getWeeklyReportsList, args));
}

describe('Weekly Reports', () => {
	test('getWeeklyReportsList returns empty when no evaluations exist', async () => {
		const t = await convexTest(schema, modules);

		const reports = await listReports(t);
		expect(reports).toEqual([]);
	});

	test('getWeeklyReportsList groups evaluations by week', async () => {
		const t = await convexTest(schema, modules);

		const { studentId: student1Id } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const { studentId: student2Id } = await createStudentWithClass(t, {
			englishName: 'Jane Doe',
			chineseName: '李四',
			studentId: 'STU002',
			grade: 11,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await createTeacher(t);
		const creativityId = await t.mutation(api.categories.create, { name: 'Creativity' });
		const responsibilityId = await t.mutation(api.categories.create, {
			name: 'Responsibility'
		});

		const weekStart = completedWeekStart(1);
		await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });

		await addEvaluation(t, {
			studentId: student1Id,
			teacherId,
			categoryId: creativityId,
			timestamp: weekStart + 10 * HOUR_MS,
			value: 2,
			details: 'Great work!'
		});
		await addEvaluation(t, {
			studentId: student2Id,
			teacherId,
			categoryId: responsibilityId,
			timestamp: weekStart + 30 * HOUR_MS,
			details: 'On time'
		});
		await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });

		const reports = await listReports(t);

		expect(reports).toHaveLength(1);
		expect(reports[0].studentCount).toBe(2);
		expect(reports[0].fridayDate).toBe(weekStart);
		expect(reports[0].weekNumber).toBe(getWeekNumber(weekStart));
	});

	test('getWeeklyReportsList returns reports in reverse chronological order', async () => {
		const t = await convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		for (const weeksAgo of [1, 2, 3]) {
			const weekStart = completedWeekStart(weeksAgo);
			await addEvaluation(t, {
				studentId,
				teacherId,
				categoryId,
				timestamp: weekStart + HOUR_MS,
				value: 4 - weeksAgo,
				details: `Week ${weeksAgo}`
			});
			await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });
		}

		const reports = await listReports(t);

		expect(reports).toHaveLength(3);
		expect(reports[0].fridayDate).toBe(completedWeekStart(1));
		expect(reports[1].fridayDate).toBe(completedWeekStart(2));
		expect(reports[2].fridayDate).toBe(completedWeekStart(3));
	});

	test('getWeeklyReportsList hides the in-progress week', async () => {
		const t = await convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		await addEvaluation(t, {
			studentId,
			teacherId,
			categoryId,
			timestamp: currentWeekStart() + HOUR_MS
		});
		await t.mutation(internal.weekly_report_snapshots.refreshRecentWeeks, {});

		expect(await listReports(t)).toEqual([]);
	});

	test('getWeeklyReportsList hides weeks with zero evaluations', async () => {
		const t = await convexTest(schema, modules);
		await t.mutation(internal.weekly_report_snapshots.refreshWeek, {
			weekStart: completedWeekStart(2)
		});

		expect(await listReports(t)).toEqual([]);
	});

	test('getWeeklyReportsList reads only the rolling 52-week window', async () => {
		const t = await convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		const outsideWindow = completedWeekStart(60);
		const insideWindow = completedWeekStart(3);

		for (const weekStart of [outsideWindow, insideWindow]) {
			await addEvaluation(t, {
				studentId,
				teacherId,
				categoryId,
				timestamp: weekStart + HOUR_MS
			});
			await t.mutation(internal.weekly_report_snapshots.refreshWeek, { weekStart });
		}

		const reports = await listReports(t);
		expect(reports.map((report) => report.fridayDate)).toEqual([insideWindow]);
	});

	test('getWeeklyReportsList falls back to a live count for a missing week', async () => {
		const t = await convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		// A materialized row elsewhere makes the table non-empty, so the list is
		// not in bootstrap mode — the missing week still comes from a live count.
		await t.mutation(internal.weekly_report_snapshots.refreshWeek, {
			weekStart: completedWeekStart(5)
		});
		await addEvaluation(t, {
			studentId,
			teacherId,
			categoryId,
			timestamp: completedWeekStart(1) + HOUR_MS
		});

		const reports = await listReports(t);
		const fallbackWeek = reports.find((report) => report.fridayDate === completedWeekStart(1));
		expect(fallbackWeek).toMatchObject({ studentCount: 1 });
	});

	test('getWeeklyReportsList bootstraps twelve recent weeks when the table is empty', async () => {
		const t = await convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		// Sixteen completed weeks of history with no materialized rows: the live
		// fallback must stay bounded to the twelve most recent weeks.
		await t.run(async (ctx) => {
			for (let weeksAgo = 1; weeksAgo <= 16; weeksAgo++) {
				await ctx.db.insert('evaluations', {
					studentId,
					teacherId,
					value: 1,
					categoryId,
					details: `Week ${weeksAgo}`,
					timestamp: completedWeekStart(weeksAgo) + HOUR_MS,
					semesterId: '2026-H1'
				});
			}
		});

		const reports = await listReports(t);

		expect(reports).toHaveLength(12);
		expect(reports[0].fridayDate).toBe(completedWeekStart(1));
		expect(reports[11].fridayDate).toBe(completedWeekStart(12));
	});

	test('getWeeklyReportDetail returns students sorted by name', async () => {
		const t = await convexTest(schema, modules);

		const { studentId: student1Id } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const { studentId: student2Id } = await createStudentWithClass(t, {
			englishName: 'Jane Doe',
			chineseName: '李四',
			studentId: 'STU002',
			grade: 11,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await createTeacher(t);

		const creativityId = await t.mutation(api.categories.create, { name: 'Creativity' });
		const responsibilityId = await t.mutation(api.categories.create, {
			name: 'Responsibility'
		});

		const weekStart = weekStartOf(new Date('2025-01-17T10:00:00Z').getTime());

		await addEvaluation(t, {
			studentId: student1Id,
			teacherId,
			categoryId: creativityId,
			timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
			value: 2,
			details: 'Great work!'
		});
		await addEvaluation(t, {
			studentId: student1Id,
			teacherId,
			categoryId: responsibilityId,
			timestamp: new Date('2025-01-16T10:00:00Z').getTime(),
			details: 'Good!'
		});
		await addEvaluation(t, {
			studentId: student2Id,
			teacherId,
			categoryId: creativityId,
			timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
			value: 3,
			details: 'Excellent!'
		});

		const students = await t.run(async (ctx) =>
			ctx.runQuery(api.evaluations.getWeeklyReportDetail, { fridayDate: weekStart })
		);

		expect(students).toHaveLength(2);
		expect(students[0].englishName).toBe('Jane Doe');
		expect(students[1].englishName).toBe('John Doe');
	});

	test('getWeeklyReportDetail aggregates points by category', async () => {
		const t = await convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		const weekStart = weekStartOf(new Date('2025-01-17T10:00:00Z').getTime());

		await addEvaluation(t, {
			studentId,
			teacherId,
			categoryId,
			timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
			value: 2,
			details: 'First'
		});
		await addEvaluation(t, {
			studentId,
			teacherId,
			categoryId,
			timestamp: new Date('2025-01-16T10:00:00Z').getTime(),
			details: 'Second'
		});

		const students = await t.run(async (ctx) =>
			ctx.runQuery(api.evaluations.getWeeklyReportDetail, { fridayDate: weekStart })
		);

		expect(students).toHaveLength(1);
		expect(students[0].pointsByCategory.Creativity).toBe(3);
		expect(students[0].totalPoints).toBe(3);
	});

	test('getWeeklyReportDetail only includes students with points in the week', async () => {
		const t = await convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		const weekStart = weekStartOf(new Date('2025-01-17T10:00:00Z').getTime());

		await addEvaluation(t, {
			studentId,
			teacherId,
			categoryId,
			timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
			value: 2,
			details: 'Week 1'
		});
		await addEvaluation(t, {
			studentId,
			teacherId,
			categoryId,
			timestamp: new Date('2025-01-22T10:00:00Z').getTime(),
			details: 'Week 2'
		});

		const students = await t.run(async (ctx) =>
			ctx.runQuery(api.evaluations.getWeeklyReportDetail, { fridayDate: weekStart })
		);

		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('John Doe');
	});

	test('getWeeklyReportDetail includes evaluations exactly on the week boundaries', async () => {
		const t = await convexTest(schema, modules);

		const { studentId: student1Id } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		const { studentId: student2Id } = await createStudentWithClass(t, {
			englishName: 'Jane Doe',
			chineseName: '李四',
			studentId: 'STU002',
			grade: 11,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });
		const weekStart = weekStartOf(new Date('2025-01-17T10:00:00Z').getTime());

		// Monday 00:00:00.000 and Sunday 23:59:59.999 of the same Taipei week.
		await addEvaluation(t, { studentId: student1Id, teacherId, categoryId, timestamp: weekStart });
		await addEvaluation(t, {
			studentId: student2Id,
			teacherId,
			categoryId,
			timestamp: weekStart + WEEK_MS - 1
		});

		const students = await t.run(async (ctx) =>
			ctx.runQuery(api.evaluations.getWeeklyReportDetail, { fridayDate: weekStart })
		);

		expect(students.map((student) => student.englishName).sort()).toEqual(['Jane Doe', 'John Doe']);
	});

	test('getWeekNumber helper returns correct week number', () => {
		const jan15 = new Date('2025-01-15T10:00:00Z').getTime();
		expect(getWeekNumber(jan15)).toBe(3);
	});

	// Regression: the old list read at most 1000 evaluations ascending, so once a
	// year passed 1000 rows the newest weeks were silently dropped and the week
	// straddling the cap was undercounted.
	test('getWeeklyReportsList keeps the newest week when the window exceeds 1000 evaluations', async () => {
		const t = await convexTest(schema, modules);

		const { studentId: student1Id } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});
		const { studentId: student2Id } = await createStudentWithClass(t, {
			englishName: 'Jane Doe',
			chineseName: '李四',
			studentId: 'STU002',
			grade: 11,
			classNum: '1',
			status: 'Enrolled'
		});
		const { studentId: student3Id } = await createStudentWithClass(t, {
			englishName: 'Jim Doe',
			chineseName: '王五',
			studentId: 'STU003',
			grade: 12,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await createTeacher(t);
		const categoryId = await t.mutation(api.categories.create, { name: 'Creativity' });

		const oldWeek = completedWeekStart(2);
		const newestWeek = completedWeekStart(1);
		const students = [student1Id, student2Id, student3Id];

		await t.run(async (ctx) => {
			for (let i = 0; i < 1200; i++) {
				await ctx.db.insert('evaluations', {
					studentId: students[i % students.length],
					teacherId,
					value: 1,
					categoryId,
					details: `old ${i}`,
					timestamp: oldWeek + i * 1000,
					semesterId: '2026-H1'
				});
			}
			await ctx.db.insert('evaluations', {
				studentId: student1Id,
				teacherId,
				value: 1,
				categoryId,
				details: 'newest',
				timestamp: newestWeek + HOUR_MS,
				semesterId: '2026-H1'
			});
		});

		const reports = await listReports(t);
		const byWeek = new Map(reports.map((report) => [report.fridayDate, report.studentCount]));

		expect(byWeek.get(oldWeek)).toBe(3);
		expect(byWeek.get(newestWeek)).toBe(1);
	});
});
