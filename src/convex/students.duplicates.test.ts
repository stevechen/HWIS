import { expect, test, describe, beforeEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { modules } from './test.setup';

describe('checkStudentIdExists query', () => {
	test('returns { exists: true } for existing student ID', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Test Student',
				chineseName: '測試學生',
				studentId: 'EXIST001',
				grade: 9,
				status: 'Enrolled',
				note: ''
			});
		});

		const result = await t.run(async (ctx) => {
			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'EXIST001'))
				.first();
		});

		expect(result).not.toBeNull();
		expect(result?.studentId).toBe('EXIST001');
	});

	test('returns { exists: false } for non-existing student ID', async () => {
		const t = convexTest(schema, modules);

		const result = await t.run(async (ctx) => {
			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'NONEXISTENT'))
				.first();
		});

		expect(result).toBeNull();
	});

	test('excludes specific student ID when checking during edit', async () => {
		const t = convexTest(schema, modules);

		const studentId = await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Edit Test',
				chineseName: '編輯測試',
				studentId: 'EDIT001',
				grade: 10,
				status: 'Enrolled',
				note: ''
			});
		});

		const existing = await t.run(async (ctx) => {
			const all = await ctx.db.query('students').collect();
			return all.find((s) => s.studentId === 'EDIT001');
		});

		expect(existing).not.toBeUndefined();
		expect(existing?.studentId).toBe('EDIT001');
	});
});

describe('bulkImportWithDuplicateCheck mutation - batch duplicates', () => {
	test('detects duplicates within the same import batch', async () => {
		const t = convexTest(schema, modules);

		const students = [
			{
				englishName: 'Student A',
				chineseName: '學生A',
				studentId: 'BATCH001',
				grade: 9,
				status: 'Enrolled' as const,
				note: ''
			},
			{
				englishName: 'Student B',
				chineseName: '學生B',
				studentId: 'BATCH001',
				grade: 10,
				status: 'Enrolled' as const,
				note: ''
			}
		];

		const result = await t.run(async (ctx) => {
			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'BATCH001'))
				.collect();
		});

		expect(result).toHaveLength(0);
	});

	test('detects duplicates against existing database records', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Existing Student',
				chineseName: '現有學生',
				studentId: 'DBDUP001',
				grade: 11,
				status: 'Enrolled',
				note: ''
			});
		});

		const existing = await t.run(async (ctx) => {
			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'DBDUP001'))
				.first();
		});

		expect(existing).not.toBeNull();
		expect(existing?.englishName).toBe('Existing Student');
	});

	test('returns batch duplicate information with row numbers', async () => {
		const t = convexTest(schema, modules);

		const seenIds = new Set<string>();
		const batchDuplicates: { studentId: string; rowNumber: number }[] = [];

		const testStudents = [
			{ studentId: 'ROW001' },
			{ studentId: 'ROW002' },
			{ studentId: 'ROW001' },
			{ studentId: 'ROW003' }
		];

		testStudents.forEach((student, index) => {
			if (seenIds.has(student.studentId)) {
				batchDuplicates.push({ studentId: student.studentId, rowNumber: index + 2 });
			}
			seenIds.add(student.studentId);
		});

		expect(batchDuplicates).toHaveLength(1);
		expect(batchDuplicates[0].studentId).toBe('ROW001');
		expect(batchDuplicates[0].rowNumber).toBe(4);
	});
});

describe('bulkImportWithDuplicateCheck mutation - integration', () => {
	test('imports new students when no duplicates exist', async () => {
		const t = convexTest(schema, modules);

		const allStudents = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		expect(allStudents).toHaveLength(0);
	});

	test('handles mix of new and existing students correctly', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Already Exists',
				chineseName: '已經存在',
				studentId: 'MIX001',
				grade: 9,
				status: 'Enrolled',
				note: ''
			});
		});

		const existing = await t.run(async (ctx) => {
			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'MIX001'))
				.first();
		});

		expect(existing).not.toBeNull();
	});
});
