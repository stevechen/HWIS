import { expect, test, describe } from 'vite-plus/test';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import { runYearEndMigration } from './shared/migration_plan';
import { SNAPSHOT_VERSION } from './shared/backup_snapshot';

describe('year-end migration plan', () => {
	test('advances enrolled students carrying section names and creates target classes on demand', async () => {
		const t = await convexTest(schema, modules);

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
		const t = await convexTest(schema, modules);

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
		const t = await convexTest(schema, modules);

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
		expect(data.version).toBe(SNAPSHOT_VERSION);
		expect(data.students).toHaveLength(1);
		expect(data.students[0].studentId).toBe('STU001');
		expect(data.houseEvents).toHaveLength(1);
		expect(data.houseEvents[0].title).toBe('Old Event');
	});

	test('clears evaluations, evaluation audit logs, and house events', async () => {
		const t = await convexTest(schema, modules);

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
		const t = await convexTest(schema, modules);

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
		const t = await convexTest(schema, modules);

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
		const t = await convexTest(schema, modules);

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

	test('leaves every ESL row untouched and never reads or writes ESL tables', async () => {
		const t = await convexTest(schema, modules);

		// A complete ESL year. The migration only knows International tables, so
		// every one of these rows must survive it byte for byte.
		const seeded = await t.run(async (ctx) => {
			const teacherId = await ctx.db.insert('users', {
				authId: 'esl-teacher-auth',
				name: 'ESL Teacher',
				role: 'teacher',
				status: 'active',
				departmentRoles: { esl: 'teacher' }
			});

			const cohortId = await ctx.db.insert('esl_cohorts', {
				year: '2025-2026',
				grade: 7,
				level: 'A',
				classNumber: '1',
				status: 'active',
				createdAt: Date.now()
			});
			const classId = await ctx.db.insert('esl_classes', {
				cohortId,
				type: 'CLIL',
				name: 'G7 CLIL A1',
				teacherId,
				status: 'active',
				createdAt: Date.now()
			});
			const meetingId = await ctx.db.insert('esl_class_meetings', {
				classId,
				year: '2025-2026',
				day: 'Monday',
				period: 3
			});
			const availabilityId = await ctx.db.insert('esl_teacher_availability', {
				teacherId,
				year: '2025-2026',
				day: 'Friday',
				period: 8
			});
			const semesterId = await ctx.db.insert('esl_semesters', {
				year: '2025-2026',
				term: 'S1',
				startDate: '2025-08-25'
			});
			const eventId = await ctx.db.insert('esl_events', {
				semesterId,
				type: 'no_school',
				title: 'Moon Festival',
				target: 'all',
				date: '2025-10-06'
			});
			const eslStudentId = await ctx.db.insert('esl_students', {
				cohortId,
				englishName: 'Alice Chan',
				chineseName: '陳小美',
				schoolStudentId: '7001001',
				chineseClass: 'J101',
				status: 'active',
				enrolledAt: Date.now()
			});
			const noteId = await ctx.db.insert('teacher_notes', {
				classId,
				date: '2025-09-01',
				teacherId,
				text: 'First week done',
				updatedAt: Date.now(),
				updatedBy: teacherId
			});

			return {
				cohortId,
				classId,
				meetingId,
				availabilityId,
				semesterId,
				eventId,
				eslStudentId,
				noteId,
				teacherId
			};
		});

		await t.run(async (ctx) => runYearEndMigration(ctx, { department: 'international' }));

		const after = await t.run(async (ctx) => ({
			cohorts: await ctx.db.query('esl_cohorts').collect(),
			classes: await ctx.db.query('esl_classes').collect(),
			meetings: await ctx.db.query('esl_class_meetings').collect(),
			availability: await ctx.db.query('esl_teacher_availability').collect(),
			semesters: await ctx.db.query('esl_semesters').collect(),
			events: await ctx.db.query('esl_events').collect(),
			students: await ctx.db.query('esl_students').collect(),
			notes: await ctx.db.query('teacher_notes').collect()
		}));

		expect(after.cohorts.map((row) => row._id)).toEqual([seeded.cohortId]);
		expect(after.classes.map((row) => row._id)).toEqual([seeded.classId]);
		expect(after.meetings.map((row) => row._id)).toEqual([seeded.meetingId]);
		expect(after.availability.map((row) => row._id)).toEqual([seeded.availabilityId]);
		expect(after.semesters.map((row) => row._id)).toEqual([seeded.semesterId]);
		expect(after.events.map((row) => row._id)).toEqual([seeded.eventId]);
		expect(after.students.map((row) => row._id)).toEqual([seeded.eslStudentId]);
		expect(after.notes.map((row) => row._id)).toEqual([seeded.noteId]);

		// The ESL teacher is shared, not deleted, and keeps the ESL role.
		const teacher = await t.run(async (ctx) => await ctx.db.get(seeded.teacherId));
		expect(teacher?.departmentRoles?.esl).toBe('teacher');

		// The pre-migration backup is International-only: it records its
		// department and carries no ESL rows.
		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
		expect(backups[0].department).toBe('international');
		const data = backups[0].data as {
			department?: string;
			eslCohorts: unknown[];
			eslClasses: unknown[];
			eslClassMeetings: unknown[];
			eslTeacherAvailability: unknown[];
			eslSemesters: unknown[];
			eslEvents: unknown[];
			eslStudents: unknown[];
			teacherNotes: unknown[];
		};
		expect(data.department).toBe('international');
		expect(data.eslCohorts).toHaveLength(0);
		expect(data.eslClasses).toHaveLength(0);
		expect(data.eslClassMeetings).toHaveLength(0);
		expect(data.eslTeacherAvailability).toHaveLength(0);
		expect(data.eslSemesters).toHaveLength(0);
		expect(data.eslEvents).toHaveLength(0);
		expect(data.eslStudents).toHaveLength(0);
		expect(data.teacherNotes).toHaveLength(0);
	});

	test('fails fast when asked to run an ESL year-end migration', async () => {
		const t = await convexTest(schema, modules);

		await expect(
			t.run(async (ctx) => runYearEndMigration(ctx, { department: 'esl' }))
		).rejects.toThrow(/International-only[\s\S]*ESL advancement/);

		// The refusal happens before any backup or write.
		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(0);
	});
});
