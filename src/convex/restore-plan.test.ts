import { expect, test, describe } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { applyRestore, type RestorePayload } from './shared/restore_plan';
import { SNAPSHOT_VERSION } from './shared/backup_snapshot';

function emptyPayload(): RestorePayload {
	return {
		students: [],
		evaluations: [],
		users: [],
		categories: [],
		classes: [],
		houseEvents: []
	};
}

describe('restore plan', () => {
	test('clears existing entity data but preserves users and user audit logs', async () => {
		const t = convexTest(schema, modules);

		await createStudentWithClass(t, {
			englishName: 'Original Student',
			chineseName: '原始學生',
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

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_student',
				performerId: teacherId,
				targetTable: 'students',
				targetId: 'stu-1',
				oldValue: null,
				newValue: { englishName: 'Original Student' },
				timestamp: Date.now()
			});
			await ctx.db.insert('audit_logs', {
				action: 'create_house_event',
				performerId: teacherId,
				targetTable: 'house_events',
				targetId: 'evt-1',
				oldValue: null,
				newValue: { title: 'Old Event' },
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

		await t.run(async (ctx) => applyRestore(ctx, emptyPayload()));

		const students = await t.run(async (ctx) => await ctx.db.query('students').collect());
		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
		const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());
		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		const auditLogs = await t.run(async (ctx) => await ctx.db.query('audit_logs').collect());

		expect(students).toHaveLength(0);
		expect(classes).toHaveLength(0);
		expect(houseEvents).toHaveLength(0);
		expect(users).toHaveLength(1);

		const userAuditLogs = auditLogs.filter((l) => l.targetTable === 'users');
		expect(userAuditLogs).toHaveLength(1);
		expect(auditLogs.filter((l) => l.targetTable === 'students')).toHaveLength(0);
		expect(auditLogs.filter((l) => l.targetTable === 'house_events')).toHaveLength(0);
	});

	test('remaps student, teacher, and category IDs when recreating evaluations', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'restored-teacher',
				name: 'Existing Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const payload: RestorePayload = {
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
			classes: [{ _id: 'old_class_id', grade: 10, class: '1' }],
			houseEvents: []
		};

		await t.run(async (ctx) => applyRestore(ctx, payload));

		const students = await t.run(async (ctx) => await ctx.db.query('students').collect());
		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		const categories = await t.run(async (ctx) => await ctx.db.query('point_categories').collect());
		const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());

		expect(students).toHaveLength(1);
		expect(students[0].house).toBe('Heracles');
		expect(students[0].note).toBe('Restored note');
		expect(classes).toHaveLength(1);
		expect(users).toHaveLength(1);
		expect(categories).toHaveLength(1);
		expect(evaluations).toHaveLength(1);
		expect(evaluations[0].details).toBe('Restored assessment');

		const evalStudent = await t.run(async (ctx) => ctx.db.get(evaluations[0].studentId));
		expect(evalStudent?.englishName).toBe('Restored Student');
		const evalTeacher = await t.run(async (ctx) => ctx.db.get(evaluations[0].teacherId));
		expect(evalTeacher?.name).toBe('Restored Teacher');
		const evalCategory = await t.run(async (ctx) => ctx.db.get(evaluations[0].categoryId));
		expect(evalCategory?.name).toBe('Restored Category');
	});

	test('remaps class homeroom teacher IDs', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'restored-teacher',
				name: 'Existing Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const payload: RestorePayload = {
			students: [],
			evaluations: [],
			users: [
				{
					_id: 'old_teacher_id',
					authId: 'restored-teacher',
					name: 'Restored Teacher',
					role: 'teacher',
					status: 'active'
				}
			],
			categories: [],
			classes: [
				{ _id: 'old_class_id', grade: 10, class: '1', homeroomTeacherId: 'old_teacher_id' }
			],
			houseEvents: []
		};

		await t.run(async (ctx) => applyRestore(ctx, payload));

		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());

		expect(classes).toHaveLength(1);
		expect(users).toHaveLength(1);
		expect(classes[0].homeroomTeacherId).toBe(users[0]._id);
		expect(classes[0].homeroomTeacherId).not.toBe('old_teacher_id');
	});

	test('deduplicates classes with same grade and class within payload', async () => {
		const t = convexTest(schema, modules);

		const payload: RestorePayload = {
			students: [],
			evaluations: [],
			users: [],
			categories: [],
			classes: [
				{ _id: 'class_a', grade: 10, class: '1' },
				{ _id: 'class_b', grade: 10, class: '1' }
			],
			houseEvents: []
		};

		await t.run(async (ctx) => applyRestore(ctx, payload));

		const classes = await t.run(async (ctx) => await ctx.db.query('classes').collect());
		expect(classes).toHaveLength(1);
	});

	test('deduplicates categories with same name within payload', async () => {
		const t = convexTest(schema, modules);

		const payload: RestorePayload = {
			students: [],
			evaluations: [],
			users: [],
			categories: [
				{
					_id: 'cat_a',
					name: 'Same Category',
					meritCriteria: ['criteria A'],
					demeritCriteria: ['demerit A'],
					casAlignment: []
				},
				{
					_id: 'cat_b',
					name: 'Same Category',
					meritCriteria: ['criteria B'],
					demeritCriteria: ['demerit B'],
					casAlignment: []
				}
			],
			classes: [],
			houseEvents: []
		};

		await t.run(async (ctx) => applyRestore(ctx, payload));

		const categories = await t.run(async (ctx) => await ctx.db.query('point_categories').collect());
		expect(categories).toHaveLength(1);
		expect(categories[0].name).toBe('Same Category');
	});

	test('reuses existing users by authId, patching them instead of duplicating', async () => {
		const t = convexTest(schema, modules);

		const existingUserId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'same-auth-id',
				name: 'Old Name',
				role: 'teacher',
				status: 'active'
			});
		});

		const payload: RestorePayload = {
			students: [],
			evaluations: [],
			users: [
				{
					_id: 'old_user',
					authId: 'same-auth-id',
					name: 'Updated Name',
					role: 'admin',
					status: 'active'
				}
			],
			categories: [],
			classes: [],
			houseEvents: []
		};

		await t.run(async (ctx) => applyRestore(ctx, payload));

		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]._id).toBe(existingUserId);
		expect(users[0].name).toBe('Updated Name');
		expect(users[0].role).toBe('admin');
	});

	test('restores house events including optional housePoints', async () => {
		const t = convexTest(schema, modules);

		const payload: RestorePayload = {
			students: [],
			evaluations: [],
			users: [],
			categories: [],
			classes: [],
			houseEvents: [
				{
					title: 'Sports Day',
					startDate: Date.now(),
					endDate: Date.now() + 86400000,
					housePoints: { Heracles: 100 }
				},
				{ title: 'No Points Event', startDate: Date.now(), endDate: Date.now() + 86400000 }
			]
		};

		await t.run(async (ctx) => applyRestore(ctx, payload));

		const houseEvents = await t.run(async (ctx) => await ctx.db.query('house_events').collect());
		expect(houseEvents).toHaveLength(2);
		expect(houseEvents.find((e) => e.title === 'Sports Day')?.housePoints?.Heracles).toBe(100);
		expect(houseEvents.find((e) => e.title === 'No Points Event')?.housePoints).toBeUndefined();
	});

	test('skips deleted users absent from live database, preserving their deletion', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'live-teacher-auth',
				name: 'Live Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const payload: RestorePayload = {
			students: [],
			evaluations: [
				{
					_id: 'eval_deleted_teacher',
					studentId: 'missing_student',
					teacherId: 'deleted_teacher_id',
					value: 1,
					categoryId: 'payload_cat',
					details: 'Eval for deleted teacher',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				}
			],
			users: [
				{
					_id: 'live_teacher_id',
					authId: 'live-teacher-auth',
					name: 'Live Teacher Updated',
					role: 'teacher',
					status: 'active'
				},
				{
					_id: 'deleted_teacher_id',
					authId: 'deleted-teacher-auth',
					name: 'Deleted Teacher',
					role: 'teacher',
					status: 'active'
				}
			],
			categories: [
				{
					_id: 'payload_cat',
					name: 'Restored Category',
					meritCriteria: [],
					demeritCriteria: [],
					casAlignment: []
				}
			],
			classes: [],
			houseEvents: []
		};

		const result = await t.run(async (ctx) => applyRestore(ctx, payload));

		const users = await t.run(async (ctx) => await ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0].authId).toBe('live-teacher-auth');
		expect(users[0].name).toBe('Live Teacher Updated');

		const deletedUser = await t.run(async (ctx) =>
			(await ctx.db.query('users').collect()).find((u) => u.authId === 'deleted-teacher-auth')
		);
		expect(deletedUser).toBeNull();

		expect(result.skippedEvaluations).toHaveLength(1);
		expect(result.skippedEvaluations[0]).toContain('eval_deleted_teacher');
		expect(result.skippedEvaluations[0]).toContain('not found');

		const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());
		expect(evaluations).toHaveLength(0);
	});

	test('reports skipped evaluations with reasons when a referenced entity is missing', async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'teacher',
				name: 'Live Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const payload: RestorePayload = {
			students: [
				{
					_id: 'old_student_id',
					englishName: 'Student',
					chineseName: '學生',
					studentId: 'STU001',
					classId: 'old_class_id',
					status: 'Enrolled'
				}
			],
			evaluations: [
				{
					_id: 'eval_student_missing',
					studentId: 'missing_student',
					teacherId: 'old_teacher_id',
					value: 1,
					categoryId: 'old_category_id',
					details: 'No student',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				},
				{
					_id: 'eval_teacher_missing',
					studentId: 'old_student_id',
					teacherId: 'missing_teacher',
					value: 1,
					categoryId: 'old_category_id',
					details: 'No teacher',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				},
				{
					_id: 'eval_category_missing',
					studentId: 'old_student_id',
					teacherId: 'old_teacher_id',
					value: 1,
					categoryId: 'missing_category',
					details: 'No category',
					timestamp: Date.now(),
					semesterId: '2025-H1'
				}
			],
			users: [
				{
					_id: 'old_teacher_id',
					authId: 'teacher',
					name: 'Teacher',
					role: 'teacher',
					status: 'active'
				}
			],
			categories: [],
			classes: [{ _id: 'old_class_id', grade: 10, class: '1' }],
			houseEvents: []
		};

		const result = await t.run(async (ctx) => applyRestore(ctx, payload));

		expect(result.skippedEvaluations).toHaveLength(3);
		expect(result.skippedEvaluations[0]).toContain('eval_student_missing');
		expect(result.skippedEvaluations[0]).toContain('student not found');
		expect(result.skippedEvaluations[1]).toContain('eval_teacher_missing');
		expect(result.skippedEvaluations[1]).toContain('teacher not found');
		expect(result.skippedEvaluations[2]).toContain('eval_category_missing');
		expect(result.skippedEvaluations[2]).toContain('category not found');

		const evaluations = await t.run(async (ctx) => await ctx.db.query('evaluations').collect());
		expect(evaluations).toHaveLength(0);
	});

	test('refuses restore with incompatible schema version', async () => {
		const t = convexTest(schema, modules);

		const payload: RestorePayload = {
			...emptyPayload(),
			version: '999.0'
		};

		await expect(t.run(async (ctx) => applyRestore(ctx, payload))).rejects.toThrow(
			/Incompatible schema version/
		);
	});

	test('allows restore with matching schema version', async () => {
		const t = convexTest(schema, modules);

		const payload: RestorePayload = {
			...emptyPayload(),
			version: SNAPSHOT_VERSION
		};

		await expect(t.run(async (ctx) => applyRestore(ctx, payload))).resolves.toBeDefined();
	});

	test('allows restore with no version (legacy payload)', async () => {
		const t = convexTest(schema, modules);

		const payload: RestorePayload = {
			...emptyPayload()
		};

		await expect(t.run(async (ctx) => applyRestore(ctx, payload))).resolves.toBeDefined();
	});
});
