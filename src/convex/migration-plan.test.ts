import { expect, test, describe } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import { runYearEndMigration } from './shared/migration_plan';

describe('year-end migration plan', () => {
	test('advances enrolled students carrying section names and creates target classes on demand', async () => {
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Grade 7 Enrolled A',
			chineseName: '七年級在校A',
			studentId: 'STU001',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 7 Enrolled B',
			chineseName: '七年級在校B',
			studentId: 'STU007',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 11 Enrolled Section 1',
			chineseName: '十一年級一班在校',
			studentId: 'STU002',
			grade: 11,
			classNum: '1',
			status: 'Enrolled'
		});

		const class7_plainId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 7, class: '9' });
		});
		await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Grade 7 Plain Class',
				chineseName: '七年級一般班',
				studentId: 'STU009',
				classId: class7_plainId,
				status: 'Enrolled'
			});
		});

		const result = await t.run(async (ctx) => runYearEndMigration(ctx, {}));

		const students = await t.run(async (ctx) => await ctx.db.query('students').collect());
		const allClasses = await t.run(async (ctx) => await ctx.db.query('classes').collect());

		expect(students).toHaveLength(4);

		const stu1 = students.find((s) => s.studentId === 'STU001')!;
		const stu7 = students.find((s) => s.studentId === 'STU007')!;
		expect(stu7.classId).toBe(stu1.classId);
		const stu1Class = allClasses.find((c) => c._id === stu1.classId)!;
		expect(stu1Class.grade).toBe(8);
		expect(stu1Class.class).toBe('1');

		const stu2 = students.find((s) => s.studentId === 'STU002')!;
		const stu2Class = allClasses.find((c) => c._id === stu2.classId)!;
		expect(stu2Class.grade).toBe(12);
		expect(stu2Class.class).toBe('1');

		const stu9 = students.find((s) => s.studentId === 'STU009')!;
		const stu9Class = allClasses.find((c) => c._id === stu9.classId)!;
		expect(stu9Class.grade).toBe(8);
		expect(stu9Class.class).toBe('9');

		expect(result.gradesAdvanced).toBe(4);
	});

	test('deletes grade 12 students regardless of status and removes not enrolled students', async () => {
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Grade 12 Enrolled',
			chineseName: '十二年級在校',
			studentId: 'STU_G12_E',
			grade: 12,
			classNum: '1',
			status: 'Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 12 Not Enrolled',
			chineseName: '十二年級非在校',
			studentId: 'STU_G12_NE',
			grade: 12,
			classNum: '1',
			status: 'Not Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 10 Not Enrolled',
			chineseName: '十年級非在校',
			studentId: 'STU_G10_NE',
			grade: 10,
			classNum: '1',
			status: 'Not Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 11 Enrolled',
			chineseName: '十一年級在校',
			studentId: 'STU_G11',
			grade: 11,
			classNum: '1',
			status: 'Enrolled'
		});

		const result = await t.run(async (ctx) => runYearEndMigration(ctx, {}));

		const students = await t.run(async (ctx) => await ctx.db.query('students').collect());

		expect(students).toHaveLength(1);
		expect(students[0].studentId).toBe('STU_G11');

		const survivingClass = await t.run(async (ctx) => {
			const student = await ctx.db.get(students[0]._id);
			if (!student?.classId) return null;
			return await ctx.db.get(student.classId);
		});
		expect(survivingClass?.grade).toBe(12);

		expect(result.grade12Deleted).toBe(2);
		expect(result.notEnrolledDeleted).toBe(1);
	});

	test('writes an auto-backup first with the full snapshot and e2eTag', async () => {
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Backup Student',
			chineseName: '備份學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Old Event',
				startDate: Date.now(),
				endDate: Date.now() + 86400000
			});
		});

		await t.run(async (ctx) => runYearEndMigration(ctx, { e2eTag: 'migration-e2e' }));

		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());

		expect(backups).toHaveLength(1);
		expect(backups[0].e2eTag).toBe('migration-e2e');
		expect(backups[0].filename).toMatch(/^backup-\d+\.json$/);

		const data = backups[0].data as {
			version: string;
			students: Array<{ studentId: string }>;
			houseEvents: Array<{ title: string }>;
		};
		expect(data.version).toBe('1.0');
		expect(data.students).toHaveLength(1);
		expect(data.students[0].studentId).toBe('STU001');
		expect(data.houseEvents).toHaveLength(1);
		expect(data.houseEvents[0].title).toBe('Old Event');
	});

	test('clears evaluations, evaluation audit logs, and house events', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Student',
			chineseName: '學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Teacher',
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
				details: 'Great work',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval-1',
				oldValue: null,
				newValue: { value: 1 },
				timestamp: Date.now()
			});
			await ctx.db.insert('audit_logs', {
				action: 'update_user_role',
				performerId: teacherId,
				targetTable: 'users',
				targetId: 'user-1',
				oldValue: { role: 'teacher' },
				newValue: { role: 'admin' },
				timestamp: Date.now()
			});
			await ctx.db.insert('house_events', {
				title: 'Old Event',
				startDate: Date.now(),
				endDate: Date.now() + 86400000
			});
		});

		const result = await t.run(async (ctx) => runYearEndMigration(ctx, {}));

		const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());
		const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());
		const auditLogs = await t.run(async (ctx) => await ctx.db.query('audit_logs').collect());

		expect(evaluations).toHaveLength(0);
		expect(houseEvents).toHaveLength(0);
		expect(auditLogs.filter((l) => l.targetTable === 'evaluations')).toHaveLength(0);
		expect(auditLogs.filter((l) => l.targetTable === 'users')).toHaveLength(1);

		expect(result.evaluationsCleared).toBe(1);
		expect(result.auditLogsCleared).toBe(1);
		expect(result.eventsDeleted).toBe(1);
	});

	test('clears homeroom teacher assignments on existing classes', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const class8Id = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', {
				grade: 8,
				class: '1',
				homeroomTeacherId: teacherId
			});
		});

		await createStudentWithClass(t, {
			englishName: 'Advancing Student',
			chineseName: '升級學生',
			studentId: 'STU100',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});

		await t.run(async (ctx) => runYearEndMigration(ctx, {}));

		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
		const grade8Class = classes.find((c) => c._id === class8Id);
		expect(grade8Class).toBeDefined();
		expect(grade8Class!.homeroomTeacherId).toBeUndefined();

		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		expect(users.find((u) => u._id === teacherId)).toBeDefined();
	});

	test('deletes empty classes but keeps protected IB classes at grades 11-12', async () => {
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Advancing Student',
			chineseName: '升級學生',
			studentId: 'STU100',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('classes', { grade: 11, class: 'IB' });
			await ctx.db.insert('classes', { grade: 12, class: 'IB' });
			await ctx.db.insert('classes', { grade: 10, class: '2' });
		});

		const result = await t.run(async (ctx) => runYearEndMigration(ctx, {}));

		const allClasses = await t.run(async (ctx) => await ctx.db.query('classes').collect());

		expect(allClasses.find((c) => c.grade === 11 && c.class === 'IB')).toBeDefined();
		expect(allClasses.find((c) => c.grade === 12 && c.class === 'IB')).toBeDefined();
		expect(allClasses.some((c) => c.grade === 7 && c.class === '1')).toBe(false);
		expect(allClasses.some((c) => c.grade === 10 && c.class === '2')).toBe(false);

		expect(result.emptyClassesDeleted).toBeGreaterThanOrEqual(2);
	});

	test('handles an empty database gracefully', async () => {
		const t = convexTest(schema, modules);

		const result = await t.run(async (ctx) => runYearEndMigration(ctx, {}));

		expect(result.gradesAdvanced).toBe(0);
		expect(result.grade12Deleted).toBe(0);
		expect(result.notEnrolledDeleted).toBe(0);
		expect(result.evaluationsCleared).toBe(0);
		expect(result.auditLogsCleared).toBe(0);
		expect(result.eventsDeleted).toBe(0);
		expect(result.emptyClassesDeleted).toBe(0);

		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
	});
});
