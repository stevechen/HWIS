import { expect, test, describe } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import { buildSnapshot, insertBackupRecord } from './shared/backup_snapshot';

describe('restoreFromBackup', () => {
	test('clears existing data before restoring backup data', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Original Student',
			chineseName: '原始學生',
			studentId: 'STU001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled',
			note: 'Original'
		});

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher-auth-id',
				name: 'Original Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Original Category'
		});

		const backupId = await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const classes = await ctx.db.query('classes').collect();
			const users = await ctx.db.query('users').collect();
			const categories = await ctx.db.query('point_categories').collect();
			return await ctx.db.insert('backups', {
				filename: `backup-${Date.now()}.json`,
				data: {
					exportedAt: new Date().toISOString(),
					version: '1.0',
					students,
					evaluations: [],
					users,
					categories,
					classes,
					houseEvents: []
				},
				createdAt: Date.now()
			});
		});

		// Add extra data after backup (should be erased by restore)
		await createStudentWithClass(t, {
			englishName: 'Extra Student',
			chineseName: '額外學生',
			studentId: 'STU002',
			grade: 11,
			classNum: '2',
			status: 'Enrolled'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('point_categories', {
				name: 'Extra Category'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: 5,
				categoryId,
				details: 'Extra evaluation',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('classes', { grade: 12, class: '3' });
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Extra Event',
				startDate: Date.now(),
				endDate: Date.now() + 86400000
			});
		});

		// Verify pre-restore state has the extra data
		expect(await t.run(async (ctx) => (await ctx.db.query('students').collect()).length)).toBe(2);
		expect(
			await t.run(async (ctx) => (await ctx.db.query('point_categories').collect()).length)
		).toBe(2);
		expect(await t.run(async (ctx) => (await ctx.db.query('evaluations').collect()).length)).toBe(
			1
		);
		expect(await t.run(async (ctx) => (await ctx.db.query('classes').collect()).length)).toBe(3);
		expect(await t.run(async (ctx) => (await ctx.db.query('house_events').collect()).length)).toBe(
			1
		);

		await t.mutation(api.backup.restoreFromBackup, { backupId });

		const students = await t.run(async (ctx) => await ctx.db.query('students').collect());
		const categories = await t.run(async (ctx) => await ctx.db.query('point_categories').collect());
		const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());
		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
		const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());

		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('Original Student');
		expect(students[0].studentId).toBe('STU001');

		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Original Category');

		expect(evaluations).toHaveLength(0);
		expect(houseEvents).toHaveLength(0);

		// Only the 2 original classes should remain
		expect(classes).toHaveLength(1);
	});
});

describe('restoreFromBackup (chunked)', () => {
	test('restores a backup that exceeded the document limit and was chunked', async () => {
		const t = convexTest(schema, modules);

		const classId = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 10, class: '1' });
		});
		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Big Student',
				chineseName: '大學生',
				studentId: 'STU001',
				classId,
				status: 'Enrolled',
				note: 'x'.repeat(250_000),
				house: 'Heracles'
			});
		});

		const backupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot);
		});

		const backup = await t.run(async (ctx) => ctx.db.get(backupId));
		expect(backup!.data).toBeUndefined();
		expect((backup!.chunkCount ?? 0) > 0).toBe(true);

		await t.mutation(api.backup.restoreFromBackup, { backupId });

		const students = await t.run(async (ctx) => ctx.db.query('students').collect());
		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('Big Student');
		expect(students[0].note).toBe('x'.repeat(250_000));
	});
});

describe('restoreFromBackupPayload', () => {
	test('restores data from raw backup payload with proper ID remapping', async () => {
		const t = convexTest(schema, modules);

		// Create initial data to be cleared by restore
		await createStudentWithClass(t, {
			englishName: 'Original Student',
			chineseName: '原始學生',
			studentId: 'STU_ORIG',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'old-teacher',
				name: 'Old Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.mutation(api.categories.create, {
			name: 'Old Category'
		});

		const classIdOld = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 11, class: '2' });
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('students', {
				englishName: 'Backup Student',
				chineseName: '備份學生',
				studentId: 'STU_BACKUP',
				classId: classIdOld,
				status: 'Enrolled'
			});
		});

		// Build a backup payload with old-style IDs
		const backupPayload = {
			exportedAt: new Date().toISOString(),
			version: '1.0',
			students: [
				{
					_id: 'old_student_id',
					englishName: 'Restored Student',
					chineseName: '恢復學生',
					studentId: 'STU001',
					classId: 'old_class_id',
					status: 'Enrolled',
					note: 'Restored note',
					house: 'Heracles'
				}
			],
			evaluations: [
				{
					_id: 'old_eval_id',
					studentId: 'old_student_id',
					teacherId: 'old_teacher_id',
					value: 1,
					categoryId: 'old_category_id',
					details: 'Restored assessment',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				}
			],
			users: [
				{
					_id: 'old_teacher_id',
					authId: 'restored-teacher',
					name: 'Restored Teacher',
					role: 'teacher',
					status: 'active'
				}
			],
			categories: [
				{
					_id: 'old_category_id',
					name: 'Restored Category',
					meritCriteria: ['Good behavior'],
					demeritCriteria: ['Bad behavior'],
					casAlignment: ['Service']
				}
			],
			classes: [
				{
					_id: 'old_class_id',
					grade: 10,
					class: '1'
				}
			],
			houseEvents: [
				{
					title: 'Restored Event',
					startDate: Date.now(),
					endDate: Date.now() + 86400000,
					housePoints: { Heracles: 100 }
				}
			]
		};

		await t.mutation(api.backup.restoreFromBackupPayload, { backupData: backupPayload });

		// Verify old data was cleared
		const originalStudent = await t.run(async (ctx) => {
			return await ctx.db
				.query('students')
				.filter((q) => q.eq(q.field('studentId'), 'STU_ORIG'))
				.first();
		});
		expect(originalStudent ?? null).toBeNull();

		// Verify restored data
		const students = await t.run(async (ctx) => await ctx.db.query('students').collect());
		expect(students).toHaveLength(1);
		expect(students[0].englishName).toBe('Restored Student');
		expect(students[0].studentId).toBe('STU001');
		expect(students[0].house).toBe('Heracles');
		expect(students[0].note).toBe('Restored note');

		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
		expect(classes).toHaveLength(1);
		expect(classes[0].grade).toBe(10);
		expect(classes[0].class).toBe('1');

		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		// Users are preserved (not cleared) by restore, so we have the original teacher + restored teacher
		expect(users).toHaveLength(2);
		const restoredTeacher = users.find((u) => u.authId === 'restored-teacher');
		expect(restoredTeacher).toBeDefined();
		expect(restoredTeacher?.name).toBe('Restored Teacher');

		const categories = await t.run(async (ctx) => await ctx.db.query('point_categories').collect());
		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Restored Category');

		const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());
		expect(evaluations).toHaveLength(1);
		expect(evaluations[0].details).toBe('Restored assessment');

		// Verify evaluation IDs were remapped correctly
		const evalStudent = await t.run(async (ctx) => ctx.db.get(evaluations[0].studentId));
		expect(evalStudent?.englishName).toBe('Restored Student');

		const evalTeacher = await t.run(async (ctx) => ctx.db.get(evaluations[0].teacherId));
		expect(evalTeacher?.name).toBe('Restored Teacher');

		const evalCategory = await t.run(async (ctx) => ctx.db.get(evaluations[0].categoryId));
		expect(evalCategory?.name).toBe('Restored Category');

		const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());
		expect(houseEvents).toHaveLength(1);
		expect(houseEvents[0].title).toBe('Restored Event');
		expect(houseEvents[0].housePoints?.Heracles).toBe(100);
	});
});

describe('advanceGradesAndClearEvaluations', () => {
	test('deletes grade 12 and not enrolled, advances remaining with section matching', async () => {
		const t = convexTest(schema, modules);

		// Create multiple sections per grade to verify section-name matching
		await createStudentWithClass(t, {
			englishName: 'Grade 7 Enrolled A',
			chineseName: '七年級在校A',
			studentId: 'STU001',
			grade: 7,
			classNum: '1',
			status: 'Enrolled'
		});

		// Second student in same grade 7 section 1 to test dedup class creation
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

		const { studentId: stu3Id } = await createStudentWithClass(t, {
			englishName: 'Grade 11 Enrolled IB',
			chineseName: '十一年級IB在校',
			studentId: 'STU003',
			grade: 11,
			classNum: 'IB',
			status: 'Enrolled'
		});

		const { classId: class12_1 } = await createStudentWithClass(t, {
			englishName: 'Grade 12 Enrolled',
			chineseName: '十二年級在校',
			studentId: 'STU004',
			grade: 12,
			classNum: '1',
			status: 'Enrolled'
		});

		const { classId: class12_IB } = await createStudentWithClass(t, {
			englishName: 'Grade 12 Not Enrolled IB',
			chineseName: '十二年級非在校IB',
			studentId: 'STU005',
			grade: 12,
			classNum: 'IB',
			status: 'Not Enrolled'
		});

		await createStudentWithClass(t, {
			englishName: 'Grade 10 Not Enrolled',
			chineseName: '十年級非在校',
			studentId: 'STU006',
			grade: 10,
			classNum: '1',
			status: 'Not Enrolled'
		});

		// Student in a "no dash" class (className equals grade number) to test non-section advancement
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

		// Student in grade 9 class "1" — grade 9 has only "1" and "IB" (2 classes),
		// so class "1" displays as "9" (no dash).
		const class9_1Id = await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 9, class: '1' });
		});
		await t.run(async (ctx) => {
			return await ctx.db.insert('classes', { grade: 9, class: 'IB' });
		});
		await t.run(async (ctx) => {
			return await ctx.db.insert('students', {
				englishName: 'Grade 9 Section 1',
				chineseName: '九年級一班',
				studentId: 'STU010',
				classId: class9_1Id,
				status: 'Enrolled'
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

		const categoryId = await t.mutation(api.categories.create, {
			name: 'Creativity'
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Old Event',
				startDate: Date.now(),
				endDate: Date.now() + 86400000
			});
		});

		// Use STU003 (grade 11 IB enrolled, will survive) for evaluation
		await t.run(async (ctx) => {
			await ctx.db.insert('evaluations', {
				studentId: stu3Id,
				teacherId,
				value: 1,
				categoryId,
				details: 'Great work',
				timestamp: Date.now(),
				semesterId: '2025-H1'
			});
		});

		// Call the actual mutation
		await t.mutation(api.backup.advanceGradesAndClearEvaluations, {});

		const students = await t.run(async (ctx) => {
			return await ctx.db.query('students').collect();
		});

		const evaluations = await t.run(async (ctx) => {
			return await ctx.db.query('evaluations').collect();
		});

		const houseEvents = await t.run(async (ctx) => {
			return await ctx.db.query('house_events').collect();
		});

		const backups = await t.run(async (ctx) => {
			return await ctx.db.query('backups').collect();
		});

		const auditLogs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		const allClasses = await t.run(async (ctx) => {
			return await ctx.db.query('classes').collect();
		});

		// Result: 6 students remain (STU001, STU007, STU002, STU003, STU009, STU010)
		expect(students).toHaveLength(6);

		// Verify section-name matching on grade advancement
		const stu2After = students.find((s) => s.studentId === 'STU002')!;
		expect(stu2After.classId).toBe(class12_1);

		const stu3After = students.find((s) => s.studentId === 'STU003')!;
		expect(stu3After.classId).toBe(class12_IB);

		// STU001 and STU007 had no matching grade 8 class — should have been created
		// and both should be in the SAME class (dedup)
		const stu1After = students.find((s) => s.studentId === 'STU001')!;
		const stu7After = students.find((s) => s.studentId === 'STU007')!;
		expect(stu7After.classId).toBe(stu1After.classId);
		const stu1Class = allClasses.find((c) => c._id === stu1After.classId)!;
		expect(stu1Class.grade).toBe(8);
		expect(stu1Class.class).toBe('1');

		// STU009 (grade 7, class '9') — non-standard class name carries over as-is
		const stu9After = students.find((s) => s.studentId === 'STU009')!;
		const stu9Class = allClasses.find((c) => c._id === stu9After.classId)!;
		expect(stu9Class.grade).toBe(8);
		expect(stu9Class.class).toBe('9');

		// STU010 (grade 9, class '1') — carries over to grade 10 class '1'
		const stu10After = students.find((s) => s.studentId === 'STU010')!;
		const stu10Class = allClasses.find((c) => c._id === stu10After.classId)!;
		expect(stu10Class.grade).toBe(10);
		expect(stu10Class.class).toBe('1');

		// Verify empty classes were cleaned up (except protected IB at grades 11/12)
		expect(allClasses).toHaveLength(6);
		// Grade 11 IB is empty but protected — should still exist
		const protected11IB = allClasses.find((c) => c.grade === 11 && c.class === 'IB');
		expect(protected11IB).toBeDefined();
		// Empty non-protected classes should be deleted
		expect(allClasses.some((c) => c.grade === 7 && c.class === '1')).toBe(false);
		expect(allClasses.some((c) => c.grade === 11 && c.class === '1')).toBe(false);

		expect(evaluations).toHaveLength(0);
		expect(houseEvents).toHaveLength(0);
		expect(backups).toHaveLength(1);
		expect(auditLogs.filter((l) => l.targetTable === 'evaluations')).toHaveLength(0);
	});

	test('handles empty database gracefully', async () => {
		const t = convexTest(schema, modules);

		// No data in the database — function should still succeed
		const result = await t.mutation(api.backup.advanceGradesAndClearEvaluations, {});

		expect(result.message).toContain('Advanced grades for 0 students');
		expect(result.message).toContain('deleted 0 grade 12 students');
		expect(result.message).toContain('deleted 0 not enrolled students');
		expect(result.message).toContain('cleared 0 evaluations');
		expect(result.message).toContain('deleted 0 events');
		expect(result.message).toContain('deleted 0 empty classes');

		// Backup should still be created even with empty data
		const backups = await t.run(async (ctx) => {
			return await ctx.db.query('backups').collect();
		});
		expect(backups).toHaveLength(1);

		// All tables should remain empty
		const students = await t.run(async (ctx) => await ctx.db.query('students').collect());
		const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());
		const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());
		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());

		expect(students).toHaveLength(0);
		expect(evaluations).toHaveLength(0);
		expect(houseEvents).toHaveLength(0);
		expect(classes).toHaveLength(0);
	});
});
