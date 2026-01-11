import { expect, test } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { modules } from './test.setup';

test('evaluations table operations work correctly', async () => {
	const t = convexTest(schema, modules);

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'John Doe',
			chineseName: '張三',
			studentId: 'STU001',
			grade: 10,
			isActive: true,
			isGraduated: false
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

	const evaluationId = await t.run(async (ctx) => {
		return await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 1,
			category: 'Creativity',
			subCategory: 'Leadership',
			details: 'Great work!',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	expect(evaluationId).toBeDefined();

	const evaluations = await t.run(async (ctx) => {
		return await ctx.db.query('evaluations').collect();
	});

	expect(evaluations).toHaveLength(1);
	expect(evaluations[0].category).toBe('Creativity');
	expect(evaluations[0].value).toBe(1);
	expect(evaluations[0].studentId).toEqual(studentId);
	expect(evaluations[0].teacherId).toEqual(teacherId);
});

test('evaluations query by teacherId works correctly', async () => {
	const t = convexTest(schema, modules);

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Jane Doe',
			chineseName: '李四',
			studentId: 'STU002',
			grade: 11,
			isActive: true,
			isGraduated: false
		});
	});

	const teacherId = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-auth-id',
			name: 'Teacher',
			role: 'teacher',
			status: 'active'
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId,
			value: 2,
			category: 'Responsibility',
			subCategory: 'Punctuality',
			details: 'Always on time',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	const evaluations = await t.run(async (ctx) => {
		return await ctx.db
			.query('evaluations')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', teacherId))
			.collect();
	});

	expect(evaluations).toHaveLength(1);
	expect(evaluations[0].category).toBe('Responsibility');
});

test('evaluations query by studentId works correctly', async () => {
	const t = convexTest(schema, modules);

	const studentId = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: 'Test Student',
			chineseName: '測試學生',
			studentId: 'STU003',
			grade: 12,
			isActive: true,
			isGraduated: false
		});
	});

	const teacherId1 = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-1',
			name: 'Teacher 1',
			role: 'teacher',
			status: 'active'
		});
	});

	const teacherId2 = await t.run(async (ctx) => {
		return await ctx.db.insert('users', {
			authId: 'teacher-2',
			name: 'Teacher 2',
			role: 'teacher',
			status: 'active'
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacherId1,
			value: 3,
			category: 'Creativity',
			subCategory: 'Innovation',
			details: 'Creative solutions',
			timestamp: Date.now(),
			semesterId: '2025-H1'
		});
	});

	await t.run(async (ctx) => {
		await ctx.db.insert('evaluations', {
			studentId,
			teacherId: teacherId2,
			value: 1,
			category: 'Responsibility',
			subCategory: 'Teamwork',
			details: 'Good teamwork',
			timestamp: Date.now() + 1000,
			semesterId: '2025-H1'
		});
	});

	const evaluations = await t.run(async (ctx) => {
		return await ctx.db
			.query('evaluations')
			.withIndex('by_studentId', (q) => q.eq('studentId', studentId))
			.collect();
	});

	expect(evaluations).toHaveLength(2);
});
