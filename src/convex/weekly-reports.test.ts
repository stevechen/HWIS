import { expect, test, describe } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';

function getFridayOfWeek(timestamp: number): number {
	const date = new Date(timestamp);
	const day = date.getDay();
	// Calculate Monday of the week (used as the week key)
	// Sunday (0) -> Monday is -6 days
	// Monday (1) -> Monday is today (0 days)
	// Saturday (6) -> Monday is -5 days
	const diff = date.getDate() - day + (day === 0 ? -6 : 1);
	const monday = new Date(date.setDate(diff));
	monday.setHours(0, 0, 0, 0);
	return monday.getTime();
}

function getWeekNumber(timestamp: number): number {
	const date = new Date(timestamp);
	const start = new Date(date.getFullYear(), 0, 1);
	const diff = date.getTime() - start.getTime();
	const oneWeek = 604800000;
	return Math.floor(diff / oneWeek) + 1;
}

describe('Weekly Reports', () => {
	test('getWeeklyReportsList returns empty when no evaluations exist', async () => {
		const t = convexTest(schema, modules);

		const reports = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportsList, {
				testToken: 'unit-test-token'
			});
		});
		expect(reports).toEqual([]);
	});

	test('getWeeklyReportsList groups evaluations by Friday', async () => {
		const t = convexTest(schema, modules);

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

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create categories
		const creativityId = await t.mutation(api.categories.create, {
			name: 'Creativity'
		});
		const responsibilityId = await t.mutation(api.categories.create, {
			name: 'Responsibility'
		});

		const fridayJan17 = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: student1Id,
				teacherId,
				value: 2,
				categoryId: creativityId,
				details: 'Great work!',
				timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: student2Id,
				teacherId,
				value: 1,
				categoryId: responsibilityId,
				details: 'On time',
				timestamp: new Date('2025-01-16T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const reports = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportsList, {
				testToken: 'unit-test-token'
			});
		});

		expect(reports).toHaveLength(1);
		expect(reports[0].studentCount).toBe(2);
		expect(reports[0].weekNumber).toBe(getWeekNumber(fridayJan17));
	});

	test('getWeeklyReportsList returns reports in reverse chronological order', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Creativity'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Week 1',
				timestamp: new Date('2025-01-08T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 2,
				categoryId,
				details: 'Week 2',
				timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 3,
				categoryId,
				details: 'Week 3',
				timestamp: new Date('2025-01-22T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const reports = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportsList, {
				testToken: 'unit-test-token'
			});
		});

		expect(reports).toHaveLength(3);
		expect(reports[0].fridayDate).toBeGreaterThan(reports[1].fridayDate);
		expect(reports[1].fridayDate).toBeGreaterThan(reports[2].fridayDate);
	});

	test('getWeeklyReportDetail returns students sorted by name', async () => {
		const t = convexTest(schema, modules);

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

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		// Create categories
		const creativityId = await t.mutation(api.categories.create, {
			name: 'Creativity'
		});
		const responsibilityId = await t.mutation(api.categories.create, {
			name: 'Responsibility'
		});

		const friday = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: student1Id,
				teacherId,
				value: 2,
				categoryId: creativityId,
				details: 'Great work!',
				timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: student1Id,
				teacherId,
				value: 1,
				categoryId: responsibilityId,
				details: 'Good!',
				timestamp: new Date('2025-01-16T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: student2Id,
				teacherId,
				value: 3,
				categoryId: creativityId,
				details: 'Excellent!',
				timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const students = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportDetail, {
				fridayDate: friday,
				testToken: 'unit-test-token'
			});
		});

		expect(students).toHaveLength(2);
		expect(students[0].englishName).toBe('Jane Doe');
		expect(students[1].englishName).toBe('John Doe');
	});

	test('getWeeklyReportDetail aggregates points by category', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Creativity'
		});

		const friday = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 2,
				categoryId,
				details: 'First',
				timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Second',
				timestamp: new Date('2025-01-16T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const students = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportDetail, {
				fridayDate: friday,
				testToken: 'unit-test-token'
			});
		});

		expect(students).toHaveLength(1);
		expect(students[0].pointsByCategory.Creativity).toBe(3);
		expect(students[0].totalPoints).toBe(3);
	});

	test('getWeeklyReportDetail only includes students with points in the week', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Creativity'
		});

		const friday = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 2,
				categoryId,
				details: 'Week 1',
				timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				categoryId,
				details: 'Week 2',
				timestamp: new Date('2025-01-22T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const students = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportDetail, {
				fridayDate: friday,
				testToken: 'unit-test-token'
			});
		});

		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('John Doe');
	});

	test('getWeekNumber helper returns correct week number', () => {
		const jan15 = new Date('2025-01-15T10:00:00Z').getTime();
		const weekNum = getWeekNumber(jan15);
		expect(weekNum).toBe(3);
	});
});
