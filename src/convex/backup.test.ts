import { expect, test, describe, vi, afterEach } from 'vitest';
import { convexTest, modules, createStudentWithClass, seedUser, mockAuthUser } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { buildSnapshot, insertBackupRecord } from './shared/backup_snapshot';
import { canDownloadBackup, canRenameBackup, canDeleteBackup } from './shared/authorization';
import { setTestAuthRole } from './testAuth';

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
			await ctx.db.insert('users', {
				authId: 'restored-teacher',
				name: 'Existing Teacher',
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

		// Verify automatic safety snapshot was created in backups table
		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
		const safetyBackup = backups[0];
		expect(safetyBackup.studentsCount).toBe(2); // STU_ORIG + STU_BACKUP from before restore
		expect(safetyBackup.source).toBe('system_safety');
		expect(safetyBackup.name).toMatch(/^Pre-Restore Safety Snapshot - /);
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
		expect(backups[0].source).toBe('system_migration');
		expect(backups[0].name).toMatch(/^Year-End Migration Snapshot - /);
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

describe('backup ownership, naming & permissions', () => {
	test('createBackup creates a named backup with admin attribution', async () => {
		const t = convexTest(schema, modules);
		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-auth-1',
				name: 'Admin Alice',
				role: 'admin',
				status: 'active'
			});
		});

		const result = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'Custom Fall 2026 Backup',
				creatorId: adminId,
				creatorName: 'Admin Alice',
				source: 'manual'
			});
		});

		const backup = await t.run(async (ctx) => ctx.db.get(result));
		expect(backup).toBeDefined();
		expect(backup?.name).toBe('Custom Fall 2026 Backup');
		expect(backup?.creatorId).toBe(adminId);
		expect(backup?.creatorName).toBe('Admin Alice');
		expect(backup?.source).toBe('manual');
	});

	test('createBackup generates a default timestamped name when none is provided', async () => {
		const t = convexTest(schema, modules);
		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-auth-2',
				name: 'Admin Bob',
				role: 'admin',
				status: 'active'
			});
		});

		const result = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				creatorId: adminId,
				creatorName: 'Admin Bob',
				source: 'manual'
			});
		});

		const backup = await t.run(async (ctx) => ctx.db.get(result));
		expect(backup?.name).toMatch(/^Manual Backup - \d{4}-\d{2}-\d{2}/);
	});

	test('insertBackupRecord stores creator role with manual source', async () => {
		const t = convexTest(schema, modules);
		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-role',
				name: 'Admin Role',
				role: 'admin',
				status: 'active'
			});
		});
		const superId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'super-role',
				name: 'Super Role',
				role: 'super',
				status: 'active'
			});
		});

		const adminBackupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'Admin Backup',
				creatorId: adminId,
				creatorName: 'Admin Role',
				creatorRole: 'admin',
				source: 'manual'
			});
		});

		const superBackupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'Super Backup',
				creatorId: superId,
				creatorName: 'Super Role',
				creatorRole: 'super',
				source: 'manual'
			});
		});

		const adminBackup = await t.run(async (ctx) => ctx.db.get(adminBackupId));
		expect(adminBackup?.source).toBe('manual');
		expect(adminBackup?.creatorRole).toBe('admin');
		expect(adminBackup?.creatorName).toBe('Admin Role');

		const superBackup = await t.run(async (ctx) => ctx.db.get(superBackupId));
		expect(superBackup?.creatorRole).toBe('super');
		expect(superBackup?.creatorName).toBe('Super Role');
	});

	test('renameBackup allows owner to rename and rejects non-owner admin and system backups', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'owner-id',
				name: 'Owner Admin',
				role: 'admin',
				status: 'active'
			});
		});
		const otherAdminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'other-id',
				name: 'Other Admin',
				role: 'admin',
				status: 'active'
			});
		});
		const superId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'super-id',
				name: 'Super User',
				role: 'super',
				status: 'active'
			});
		});

		const backupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'Initial Name',
				creatorId: ownerId,
				creatorName: 'Owner Admin',
				source: 'manual'
			});
		});

		const systemBackupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'System Snapshot',
				source: 'system_migration'
			});
		});

		// 1. Owner can rename
		await t.run(async (ctx) => {
			const owner = (await ctx.db.get(ownerId))!;
			const backup = (await ctx.db.get(backupId))!;
			expect(canRenameBackup(owner, backup)).toBe(true);
			await ctx.db.patch(backupId, { name: 'Renamed by Owner' });
		});
		expect((await t.run(async (ctx) => ctx.db.get(backupId)))?.name).toBe('Renamed by Owner');

		// 2. Other admin cannot rename
		await t.run(async (ctx) => {
			const other = (await ctx.db.get(otherAdminId))!;
			const backup = (await ctx.db.get(backupId))!;
			expect(canRenameBackup(other, backup)).toBe(false);
		});

		// 3. Admin cannot rename system backup
		await t.run(async (ctx) => {
			const owner = (await ctx.db.get(ownerId))!;
			const sysBackup = (await ctx.db.get(systemBackupId))!;
			expect(canRenameBackup(owner, sysBackup)).toBe(false);
		});

		// 4. Super can rename both user and system backups
		await t.run(async (ctx) => {
			const superUser = (await ctx.db.get(superId))!;
			const backup = (await ctx.db.get(backupId))!;
			const sysBackup = (await ctx.db.get(systemBackupId))!;
			expect(canRenameBackup(superUser, backup)).toBe(true);
			expect(canRenameBackup(superUser, sysBackup)).toBe(true);
		});
	});

	test('deleteBackup allows owner and super, rejects non-owner and system for admin', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'owner-del',
				name: 'Owner Admin',
				role: 'admin',
				status: 'active'
			});
		});
		const otherAdminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'other-del',
				name: 'Other Admin',
				role: 'admin',
				status: 'active'
			});
		});
		const superId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'super-del',
				name: 'Super User',
				role: 'super',
				status: 'active'
			});
		});

		const backupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'To Delete',
				creatorId: ownerId,
				creatorName: 'Owner Admin',
				source: 'manual'
			});
		});

		const systemBackupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'System To Delete',
				source: 'system_safety'
			});
		});

		// Other admin cannot delete
		await t.run(async (ctx) => {
			const other = (await ctx.db.get(otherAdminId))!;
			const backup = (await ctx.db.get(backupId))!;
			expect(canDeleteBackup(other, backup)).toBe(false);
		});

		// Admin cannot delete system backup
		await t.run(async (ctx) => {
			const owner = (await ctx.db.get(ownerId))!;
			const sysBackup = (await ctx.db.get(systemBackupId))!;
			expect(canDeleteBackup(owner, sysBackup)).toBe(false);
		});

		// Owner can delete own backup
		await t.run(async (ctx) => {
			const owner = (await ctx.db.get(ownerId))!;
			const backup = (await ctx.db.get(backupId))!;
			expect(canDeleteBackup(owner, backup)).toBe(true);
		});

		// Super can delete any backup and system backup
		await t.run(async (ctx) => {
			const superUser = (await ctx.db.get(superId))!;
			const backup = (await ctx.db.get(backupId))!;
			const sysBackup = (await ctx.db.get(systemBackupId))!;
			expect(canDeleteBackup(superUser, backup)).toBe(true);
			expect(canDeleteBackup(superUser, sysBackup)).toBe(true);
		});
	});

	test('download permissions allow owner, super, and system auto-backups for all admins', async () => {
		const t = convexTest(schema, modules);
		const admin1Id = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-1',
				name: 'Admin 1',
				role: 'admin',
				status: 'active'
			});
		});
		const admin2Id = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-2',
				name: 'Admin 2',
				role: 'admin',
				status: 'active'
			});
		});
		const superId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'super-dl',
				name: 'Super User',
				role: 'super',
				status: 'active'
			});
		});

		const admin1BackupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				creatorId: admin1Id,
				creatorName: 'Admin 1',
				source: 'manual'
			});
		});

		const systemBackupId = await t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				source: 'system_migration'
			});
		});

		await t.run(async (ctx) => {
			const admin1 = (await ctx.db.get(admin1Id))!;
			const admin2 = (await ctx.db.get(admin2Id))!;
			const superUser = (await ctx.db.get(superId))!;
			const b1 = (await ctx.db.get(admin1BackupId))!;
			const bSys = (await ctx.db.get(systemBackupId))!;

			// Admin 1 can download own backup and system backup
			expect(canDownloadBackup(admin1, b1)).toBe(true);
			expect(canDownloadBackup(admin1, bSys)).toBe(true);

			// Admin 2 CANNOT download Admin 1's manual backup, but CAN download system backup
			expect(canDownloadBackup(admin2, b1)).toBe(false);
			expect(canDownloadBackup(admin2, bSys)).toBe(true);

			// Super can download everything
			expect(canDownloadBackup(superUser, b1)).toBe(true);
			expect(canDownloadBackup(superUser, bSys)).toBe(true);
		});
	});

	test('migrateLegacyBackups backfills unassigned backups to super admin', async () => {
		const t = convexTest(schema, modules);
		const superId = await seedUser(t, {
			authId: 'super-migrator',
			name: 'Super Steve',
			role: 'super',
			status: 'active'
		});

		// Insert legacy unassigned backup
		const legacyBackupId = await t.run(async (ctx) => {
			return await ctx.db.insert('backups', {
				filename: 'legacy-backup-1234.json',
				createdAt: Date.now()
			});
		});

		// A backup that already has ownership must be left untouched
		const ownedBackupId = await t.run(async (ctx) => {
			return await ctx.db.insert('backups', {
				name: 'Already Owned',
				filename: 'owned-backup.json',
				creatorId: superId,
				creatorName: 'Super Steve',
				source: 'manual',
				createdAt: Date.now()
			});
		});

		// Run the actual migration mutation as super
		setTestAuthRole('super');
		const result = await t.mutation(api.backup.migrateLegacyBackups, {});
		expect(result.migratedCount).toBe(1);

		const migrated = await t.run(async (ctx) => ctx.db.get(legacyBackupId));
		expect(migrated?.creatorId).toBe(superId);
		expect(migrated?.creatorName).toBe('Super Steve');
		expect(migrated?.creatorRole).toBe('super');
		expect(migrated?.source).toBe('manual');
		expect(migrated?.name).toBe('legacy-backup-1234');

		const owned = await t.run(async (ctx) => ctx.db.get(ownedBackupId));
		expect(owned?.name).toBe('Already Owned');
		expect(owned?.creatorId).toBe(superId);
	});
});

describe('renameBackup & deleteBackup mutation authorization', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function seedBackupOwnedBy(t: ReturnType<typeof convexTest>, ownerId: Id<'users'>) {
		return t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'Owned Backup',
				creatorId: ownerId,
				creatorName: 'Owner Admin',
				source: 'manual'
			});
		});
	}

	function seedSystemBackup(t: ReturnType<typeof convexTest>) {
		return t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'System Snapshot',
				source: 'system_migration'
			});
		});
	}

	test('owner admin can rename own backup via the mutation', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'rename-owner',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: ownerId,
			authId: 'rename-owner-auth',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedBackupOwnedBy(t, ownerId);

		const result = await t.mutation(api.backup.renameBackup, {
			backupId,
			name: 'Renamed By Owner'
		});
		expect(result.name).toBe('Renamed By Owner');
		const updated = await t.run(async (ctx) => ctx.db.get(backupId));
		expect(updated?.name).toBe('Renamed By Owner');
	});

	test('non-owner admin is rejected by the rename mutation', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'rename-owner-2',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const otherId = await seedUser(t, {
			authId: 'rename-other',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: otherId,
			authId: 'rename-other-auth',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedBackupOwnedBy(t, ownerId);

		await expect(
			t.mutation(api.backup.renameBackup, { backupId, name: 'Hijacked' })
		).rejects.toThrow(/Forbidden/);
		const unchanged = await t.run(async (ctx) => ctx.db.get(backupId));
		expect(unchanged?.name).toBe('Owned Backup');
	});

	test('admin is rejected when renaming a system backup', async () => {
		const t = convexTest(schema, modules);
		const adminId = await seedUser(t, {
			authId: 'rename-admin-sys',
			name: 'Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: adminId,
			authId: 'rename-admin-sys-auth',
			name: 'Admin',
			role: 'admin',
			status: 'active'
		});
		const systemBackupId = await seedSystemBackup(t);

		await expect(
			t.mutation(api.backup.renameBackup, { backupId: systemBackupId, name: 'Renamed System' })
		).rejects.toThrow(/Forbidden/);
	});

	test('super admin can rename any backup, including system backups', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'rename-owner-3',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const superId = await seedUser(t, {
			authId: 'rename-super',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		mockAuthUser({
			_id: superId,
			authId: 'rename-super-auth',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		const backupId = await seedBackupOwnedBy(t, ownerId);
		const systemBackupId = await seedSystemBackup(t);

		const ownerResult = await t.mutation(api.backup.renameBackup, {
			backupId,
			name: 'Super Renamed Owner Backup'
		});
		expect(ownerResult.name).toBe('Super Renamed Owner Backup');
		const sysResult = await t.mutation(api.backup.renameBackup, {
			backupId: systemBackupId,
			name: 'Super Renamed System'
		});
		expect(sysResult.name).toBe('Super Renamed System');
	});

	test('owner admin can delete own backup and its chunks via the mutation', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'delete-owner',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: ownerId,
			authId: 'delete-owner-auth',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedBackupOwnedBy(t, ownerId);
		// Attach a chunk row so chunk deletion is exercised
		await t.run(async (ctx) => {
			await ctx.db.insert('backup_chunks', {
				backupId,
				chunkIndex: 0,
				data: 'chunk-data'
			});
		});

		await t.mutation(api.backup.deleteBackup, { backupId });

		expect(await t.run(async (ctx) => ctx.db.get(backupId))).toBeNull();
		const remainingChunks = await t.run(async (ctx) =>
			(await ctx.db.query('backup_chunks').collect()).filter((c) => c.backupId === backupId)
		);
		expect(remainingChunks).toHaveLength(0);
	});

	test('non-owner admin is rejected by the delete mutation', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'delete-owner-2',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const otherId = await seedUser(t, {
			authId: 'delete-other',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: otherId,
			authId: 'delete-other-auth',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedBackupOwnedBy(t, ownerId);

		await expect(t.mutation(api.backup.deleteBackup, { backupId })).rejects.toThrow(/Forbidden/);
		expect(await t.run(async (ctx) => ctx.db.get(backupId))).not.toBeNull();
	});

	test('admin is rejected when deleting a system backup', async () => {
		const t = convexTest(schema, modules);
		const adminId = await seedUser(t, {
			authId: 'delete-admin-sys',
			name: 'Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: adminId,
			authId: 'delete-admin-sys-auth',
			name: 'Admin',
			role: 'admin',
			status: 'active'
		});
		const systemBackupId = await seedSystemBackup(t);

		await expect(t.mutation(api.backup.deleteBackup, { backupId: systemBackupId })).rejects.toThrow(
			/Forbidden/
		);
	});

	test('super admin can delete any backup, including system backups', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'delete-owner-3',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const superId = await seedUser(t, {
			authId: 'delete-super',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		mockAuthUser({
			_id: superId,
			authId: 'delete-super-auth',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		const backupId = await seedBackupOwnedBy(t, ownerId);
		const systemBackupId = await seedSystemBackup(t);

		await t.mutation(api.backup.deleteBackup, { backupId });
		await t.mutation(api.backup.deleteBackup, { backupId: systemBackupId });

		expect(await t.run(async (ctx) => ctx.db.get(backupId))).toBeNull();
		expect(await t.run(async (ctx) => ctx.db.get(systemBackupId))).toBeNull();
	});

	test('teacher and student are blocked from rename and delete mutations', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'perm-owner',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedBackupOwnedBy(t, ownerId);
		const systemBackupId = await seedSystemBackup(t);

		for (const role of ['teacher', 'student'] as const) {
			mockAuthUser({
				_id: 'some-id',
				authId: `blocked-${role}`,
				name: `${role} User`,
				role,
				status: 'active'
			});

			await expect(t.mutation(api.backup.renameBackup, { backupId, name: 'Nope' })).rejects.toThrow(
				/Forbidden|Unauthorized/
			);
			await expect(
				t.mutation(api.backup.deleteBackup, { backupId: systemBackupId })
			).rejects.toThrow(/Forbidden|Unauthorized/);
		}
	});
});

describe('getBackupChunk download scoping & unrestricted restore', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function seedOwnerBackup(t: ReturnType<typeof convexTest>, ownerId: Id<'users'>) {
		return t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'Owned Backup',
				creatorId: ownerId,
				creatorName: 'Owner Admin',
				source: 'manual'
			});
		});
	}

	function seedSystemBackup(t: ReturnType<typeof convexTest>) {
		return t.run(async (ctx) => {
			const snapshot = await buildSnapshot(ctx);
			return await insertBackupRecord(ctx, snapshot, {
				name: 'System Snapshot',
				source: 'system_migration'
			});
		});
	}

	test('non-owner admin is rejected by the getBackupChunk query', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'dl-owner',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const otherId = await seedUser(t, {
			authId: 'dl-other',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: otherId,
			authId: 'dl-other-auth',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedOwnerBackup(t, ownerId);

		await expect(t.query(api.backup.getBackupChunk, { backupId, chunkIndex: 0 })).rejects.toThrow(
			/Forbidden/
		);
	});

	test('owner, super, and any admin on system backups can fetch chunks', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'dl-owner-2',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: ownerId,
			authId: 'dl-owner-auth',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const ownerBackupId = await seedOwnerBackup(t, ownerId);
		const ownerChunk = await t.query(api.backup.getBackupChunk, {
			backupId: ownerBackupId,
			chunkIndex: 0
		});
		expect(ownerChunk).toBeNull(); // inline data, no chunks

		const superId = await seedUser(t, {
			authId: 'dl-super',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		const systemBackupId = await seedSystemBackup(t);
		mockAuthUser({
			_id: superId,
			authId: 'dl-super-auth',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		const superChunk = await t.query(api.backup.getBackupChunk, {
			backupId: systemBackupId,
			chunkIndex: 0
		});
		expect(superChunk).toBeNull();

		// A synthetic admin (default test token) can also read system backups
		vi.restoreAllMocks();
		const adminChunk = await t.query(api.backup.getBackupChunk, {
			backupId: systemBackupId,
			chunkIndex: 0
		});
		expect(adminChunk).toBeNull();
	});

	test('any active admin can restore a backup they do not own', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'restore-owner',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const otherId = await seedUser(t, {
			authId: 'restore-other',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		mockAuthUser({
			_id: otherId,
			authId: 'restore-other-auth',
			name: 'Other Admin',
			role: 'admin',
			status: 'active'
		});
		const backupId = await seedOwnerBackup(t, ownerId);

		const result = await t.mutation(api.backup.restoreFromBackup, { backupId });
		expect(result.message).toContain('Restored');
	});

	test('super admin can restore any backup', async () => {
		const t = convexTest(schema, modules);
		const ownerId = await seedUser(t, {
			authId: 'restore-owner-2',
			name: 'Owner Admin',
			role: 'admin',
			status: 'active'
		});
		const superId = await seedUser(t, {
			authId: 'restore-super',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		mockAuthUser({
			_id: superId,
			authId: 'restore-super-auth',
			name: 'Super User',
			role: 'super',
			status: 'active'
		});
		const backupId = await seedOwnerBackup(t, ownerId);

		const result = await t.mutation(api.backup.restoreFromBackup, { backupId });
		expect(result.message).toContain('Restored');
	});
});

describe('pruneExpiredBackups', () => {
	const ONE_DAY = 24 * 60 * 60 * 1000;

	test('prunes system_cron backups older than 30 days', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('backups', {
				filename: 'old-cron.json',
				data: {},
				source: 'system_cron',
				createdAt: Date.now() - 31 * ONE_DAY
			});
			await ctx.db.insert('backups', {
				filename: 'new-cron.json',
				data: {},
				source: 'system_cron',
				createdAt: Date.now() - 1 * ONE_DAY
			});
		});

		await t.mutation(api.backup.pruneExpiredBackups, {});

		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
		expect(backups[0].filename).toBe('new-cron.json');
	});

	test('prunes system_safety backups older than 90 days', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('backups', {
				filename: 'old-safety.json',
				data: {},
				source: 'system_safety',
				createdAt: Date.now() - 91 * ONE_DAY
			});
			await ctx.db.insert('backups', {
				filename: 'new-safety.json',
				data: {},
				source: 'system_safety',
				createdAt: Date.now() - 1 * ONE_DAY
			});
		});

		await t.mutation(api.backup.pruneExpiredBackups, {});

		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
		expect(backups[0].filename).toBe('new-safety.json');
	});

	test('never prunes system_migration backups', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('backups', {
				filename: 'old-migration.json',
				data: {},
				source: 'system_migration',
				createdAt: Date.now() - 365 * ONE_DAY
			});
		});

		await t.mutation(api.backup.pruneExpiredBackups, {});

		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
	});

	test('never prunes manual backups', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('backups', {
				filename: 'old-manual.json',
				data: {},
				source: 'manual',
				createdAt: Date.now() - 365 * ONE_DAY
			});
		});

		await t.mutation(api.backup.pruneExpiredBackups, {});

		const backups = await t.run(async (ctx) => await ctx.db.query('backups').collect());
		expect(backups).toHaveLength(1);
	});

	test('deletes backup chunks when pruning', async () => {
		const t = convexTest(schema, modules);

		const backupId = await t.run(async (ctx) => {
			const id = await ctx.db.insert('backups', {
				filename: 'old-cron-chunked.json',
				data: undefined,
				chunkCount: 2,
				source: 'system_cron',
				createdAt: Date.now() - 31 * ONE_DAY
			});
			await ctx.db.insert('backup_chunks', { backupId: id, chunkIndex: 0, data: 'chunk0' });
			await ctx.db.insert('backup_chunks', { backupId: id, chunkIndex: 1, data: 'chunk1' });
			return id;
		});

		await t.mutation(api.backup.pruneExpiredBackups, {});

		const backup = await t.run(async (ctx) => ctx.db.get(backupId));
		expect(backup).toBeNull();

		const chunks = await t.run(async (ctx) =>
			(await ctx.db.query('backup_chunks').collect()).filter((c) => c.backupId === backupId)
		);
		expect(chunks).toHaveLength(0);
	});
});
