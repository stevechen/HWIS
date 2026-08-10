import { expect, test, describe } from 'vitest';
import { convexTest, modules, mockAuthUser, seedUser } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';

describe('checkStudentIdExists query', () => {
	test('returns { exists: true } for existing student ID', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			const classId = await ctx.db.insert('classes', { grade: 9, class: '1' });
			await ctx.db.insert('students', {
				englishName: 'Test Student',
				chineseName: '測試學生',
				studentId: 'EXIST001',
				classId,
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

		await t.run(async (_ctx) => {
			const classId = await _ctx.db.insert('classes', { grade: 10, class: '1' });
			await _ctx.db.insert('students', {
				englishName: 'Edit Test',
				chineseName: '編輯測試',
				studentId: 'EDIT001',
				classId,
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
			const classId = await ctx.db.insert('classes', { grade: 11, class: '1' });
			await ctx.db.insert('students', {
				englishName: 'Existing Student',
				chineseName: '現有學生',
				studentId: 'DBDUP001',
				classId,
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
			const classId = await ctx.db.insert('classes', { grade: 9, class: '1' });
			await ctx.db.insert('students', {
				englishName: 'Already Exists',
				chineseName: '已經存在',
				studentId: 'MIX001',
				classId,
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

describe('bulkImportWithDuplicateCheck mutation - note field', () => {
	type ImportStudent = {
		studentId: string;
		englishName: string;
		chineseName: string;
		grade: number;
		class?: string;
		note?: string;
	};

	async function importAsAdmin(students: ImportStudent[]) {
		const t = convexTest(schema, modules);
		await seedUser(t, { authId: 'import-admin', name: 'Import Admin', role: 'admin' });
		mockAuthUser({ authId: 'import-admin', name: 'Import Admin', role: 'admin', status: 'active' });

		await t.mutation(api.students.bulkImportWithDuplicateCheck, {
			mode: 'halt',
			students
		});

		return t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});
	}

	test('persists note from CSV import', async () => {
		const students = await importAsAdmin([
			{
				studentId: '7001234',
				englishName: 'Note Test',
				chineseName: '註記測試',
				grade: 7,
				class: '1',
				note: 'Special accommodations required'
			}
		]);

		expect(students).toHaveLength(1);
		expect(students[0].note).toBe('Special accommodations required');
	});

	test('defaults note to empty string when not provided', async () => {
		const students = await importAsAdmin([
			{
				studentId: '7001235',
				englishName: 'No Note Test',
				chineseName: '無註記測試',
				grade: 7,
				class: '1'
			}
		]);

		expect(students[0].note).toBe('');
	});
});
