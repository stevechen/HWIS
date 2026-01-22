import { expect, test, describe } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { modules } from './test.setup';
import { api } from './_generated/api';

function getFridayOfWeek(timestamp: number): number {
	const date = new Date(timestamp);
	const day = date.getDay();
	const diff = date.getDate() - day + (day === 0 ? -6 : 1);
	const friday = new Date(date.setDate(diff));
	friday.setHours(0, 0, 0, 0);
	return friday.getTime();
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
			return await ctx.runQuery(api.evaluations.getWeeklyReportsList, {});
		});
		expect(reports).toEqual([]);
	});

	test('getWeeklyReportsList groups evaluations by Friday', async () => {
		const t = convexTest(schema, modules);

		const student1Id = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'John Doe',
				chineseName: '張三',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		const student2Id = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Jane Doe',
				chineseName: '李四',
				studentId: 'STU002',
				grade: 11,
				status: 'Enrolled'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const fridayJan17 = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: student1Id,
				teacherId,
				value: 2,
				category: 'Creativity',
				subCategory: 'Leadership',
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
				category: 'Responsibility',
				subCategory: 'Punctuality',
				details: 'On time',
				timestamp: new Date('2025-01-16T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const reports = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportsList, {});
		});

		expect(reports).toHaveLength(1);
		expect(reports[0].studentCount).toBe(2);
		expect(reports[0].weekNumber).toBe(getWeekNumber(fridayJan17));
	});

	test('getWeeklyReportsList returns reports in reverse chronological order', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'John Doe',
				chineseName: '張三',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 1,
				category: 'Creativity',
				subCategory: 'Leadership',
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
				category: 'Creativity',
				subCategory: 'Leadership',
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
				category: 'Creativity',
				subCategory: 'Leadership',
				details: 'Week 3',
				timestamp: new Date('2025-01-22T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const reports = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportsList, {});
		});

		expect(reports).toHaveLength(3);
		expect(reports[0].fridayDate).toBeGreaterThan(reports[1].fridayDate);
		expect(reports[1].fridayDate).toBeGreaterThan(reports[2].fridayDate);
	});

	test('getWeeklyReportDetail returns students sorted by name', async () => {
		const t = convexTest(schema, modules);

		const student1Id = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'John Doe',
				chineseName: '張三',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		const student2Id = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Jane Doe',
				chineseName: '李四',
				studentId: 'STU002',
				grade: 11,
				status: 'Enrolled'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const friday = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: student1Id,
				teacherId,
				value: 2,
				category: 'Creativity',
				subCategory: 'Leadership',
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
				category: 'Responsibility',
				subCategory: 'Punctuality',
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
				category: 'Creativity',
				subCategory: 'Innovation',
				details: 'Excellent!',
				timestamp: new Date('2025-01-15T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const students = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportDetail, {
				fridayDate: friday
			});
		});

		expect(students).toHaveLength(2);
		expect(students[0].englishName).toBe('Jane Doe');
		expect(students[1].englishName).toBe('John Doe');
	});

	test('getWeeklyReportDetail aggregates points by category', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'John Doe',
				chineseName: '張三',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const friday = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 2,
				category: 'Creativity',
				subCategory: 'Leadership',
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
				category: 'Creativity',
				subCategory: 'Innovation',
				details: 'Second',
				timestamp: new Date('2025-01-16T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const students = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportDetail, {
				fridayDate: friday
			});
		});

		expect(students).toHaveLength(1);
		expect(students[0].pointsByCategory.Creativity).toBe(3);
		expect(students[0].totalPoints).toBe(3);
	});

	test('getWeeklyReportDetail only includes students with points in the week', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'John Doe',
				chineseName: '張三',
				studentId: 'STU001',
				grade: 10,
				status: 'Enrolled'
			});
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'test-auth-id',
				name: 'Test Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const friday = getFridayOfWeek(new Date('2025-01-17T10:00:00Z').getTime());

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 2,
				category: 'Creativity',
				subCategory: 'Leadership',
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
				category: 'Creativity',
				subCategory: 'Leadership',
				details: 'Week 2',
				timestamp: new Date('2025-01-22T10:00:00Z').getTime(),
				semesterId: '2025-H1'
			});
		});

		const students = await t.run(async (ctx) => {
			return await ctx.runQuery(api.evaluations.getWeeklyReportDetail, {
				fridayDate: friday
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
