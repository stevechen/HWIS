import { expect, test, describe } from 'vitest';
import { convexTest, modules, createStudentWithClass } from './test.setup';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';

describe('audit logs (database operations)', () => {
	test('audit.list returns empty array when no logs exist', async () => {
		const t = convexTest(schema, modules);

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toEqual([]);
	});

	test('audit.list returns audit logs for admin user', async () => {
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

		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-subject',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval1',
				oldValue: null,
				newValue: {
					studentId,
					value: 1,
					category: 'Creativity'
				},
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'update_user_role',
				performerId: adminId,
				targetTable: 'users',
				targetId: 'user1',
				oldValue: { role: 'teacher' },
				newValue: { role: 'admin' },
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toHaveLength(2);
		expect(logs[0].action).toBe('create_evaluation');
		expect(logs[1].action).toBe('update_user_role');
	});

	test('audit.list filters by action type', async () => {
		const t = convexTest(schema, modules);

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
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval1',
				oldValue: null,
				newValue: { value: 1 },
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'delete_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval2',
				oldValue: { value: 1 },
				newValue: null,
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		const createLogs = logs.filter((l) => l.action === 'create_evaluation');
		const deleteLogs = logs.filter((l) => l.action === 'delete_evaluation');

		expect(createLogs).toHaveLength(1);
		expect(deleteLogs).toHaveLength(1);
	});

	test('audit.list handles null studentId in newValue/oldValue', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher2-auth-id',
				name: 'Teacher 2',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval3',
				oldValue: null,
				newValue: null,
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].newValue).toBeNull();
		expect(logs[0].oldValue).toBeNull();
	});

	test('audit.logs can be queried with index', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher3-auth-id',
				name: 'Teacher 3',
				role: 'teacher',
				status: 'active'
			});
		});

		const now = Date.now();
		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval4',
				oldValue: null,
				newValue: { value: 1 },
				timestamp: now
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').order('desc').take(10);
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].targetId).toBe('eval4');
	});

	test('audit.logs include performer name when queried', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'teacher4-auth-id',
				name: 'Jane Smith',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacherId,
				targetTable: 'evaluations',
				targetId: 'eval5',
				oldValue: null,
				newValue: { value: 2, category: 'Responsibility' },
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].performerId).toEqual(teacherId);
	});

	test('audit.logs track role updates correctly', async () => {
		const t = convexTest(schema, modules);

		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-updater',
				name: 'Admin User',
				role: 'admin',
				status: 'active'
			});
		});

		const targetUserId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'target-user',
				name: 'Target User',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'update_user_role',
				performerId: adminId,
				targetTable: 'users',
				targetId: targetUserId.toString(),
				oldValue: { role: 'teacher' },
				newValue: { role: 'admin' },
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].action).toBe('update_user_role');
		expect(logs[0].oldValue).toEqual({ role: 'teacher' });
		expect(logs[0].newValue).toEqual({ role: 'admin' });
	});

	test('audit.logs track status updates correctly', async () => {
		const t = convexTest(schema, modules);

		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'admin-status',
				name: 'Status Admin',
				role: 'admin',
				status: 'active'
			});
		});

		const targetUserId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'status-target',
				name: 'Status Target',
				role: 'teacher',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'update_user_status',
				performerId: adminId,
				targetTable: 'users',
				targetId: targetUserId.toString(),
				oldValue: { status: 'active' },
				newValue: { status: 'deactivated' },
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].action).toBe('update_user_status');
		expect(logs[0].oldValue).toEqual({ status: 'active' });
		expect(logs[0].newValue).toEqual({ status: 'deactivated' });
	});

	test('audit.logs track student creation', async () => {
		const t = convexTest(schema, modules);

		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'student-creator',
				name: 'Creator User',
				role: 'admin',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'create_student',
				performerId: adminId,
				targetTable: 'students',
				targetId: 'new-student-id',
				oldValue: null,
				newValue: {
					englishName: 'New Student',
					chineseName: '新學生',
					studentId: 'NEW001',
					grade: 9
				},
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].action).toBe('create_student');
		expect(logs[0].newValue.englishName).toBe('New Student');
	});

	test('audit.logs track student deletion', async () => {
		const t = convexTest(schema, modules);

		const adminId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'student-deleter',
				name: 'Deleter User',
				role: 'admin',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'delete_student',
				performerId: adminId,
				targetTable: 'students',
				targetId: 'deleted-student-id',
				oldValue: {
					englishName: 'Deleted Student',
					chineseName: '已刪除學生',
					studentId: 'DEL001'
				},
				newValue: null,
				timestamp: Date.now()
			});
		});

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').collect();
		});

		expect(logs).toHaveLength(1);
		expect(logs[0].action).toBe('delete_student');
		expect(logs[0].oldValue.englishName).toBe('Deleted Student');
	});

	test('audit.logs multiple entries ordered by timestamp', async () => {
		const t = convexTest(schema, modules);

		const teacherId = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'multi-logger',
				name: 'Multi Logger',
				role: 'teacher',
				status: 'active'
			});
		});

		const timestamps = [1000, 2000, 3000];
		for (let i = 0; i < 3; i++) {
			await t.run(async (ctx) => {
				await ctx.db.insert('audit_logs', {
					action: i % 2 === 0 ? 'create_evaluation' : 'delete_evaluation',
					performerId: teacherId,
					targetTable: 'evaluations',
					targetId: `eval-${i}`,
					oldValue: null,
					newValue: { value: i + 1 },
					timestamp: timestamps[i]
				});
			});
		}

		const logs = await t.run(async (ctx) => {
			return await ctx.db.query('audit_logs').order('desc').take(10);
		});

		expect(logs).toHaveLength(3);
		expect(logs[0].timestamp).toBe(3000);
		expect(logs[1].timestamp).toBe(2000);
		expect(logs[2].timestamp).toBe(1000);
	});
});

describe('audit action labels', () => {
	test('ACTION_LABELS has all expected actions', () => {
		const expectedLabels = [
			'create_evaluation',
			'delete_evaluation',
			'update_user_role',
			'update_user_status',
			'create_student',
			'update_student',
			'delete_student',
			'seed_data'
		];

		expect(expectedLabels).toHaveLength(8);
	});
});

// --- Enrichment tests ---

describe('audit.list enrichment', () => {
	async function createAuditChain(t: ReturnType<typeof convexTest>) {
		const teacher = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'audit-teacher',
				name: 'Audit Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const { classId, studentId } = await createStudentWithClass(t, {
			englishName: 'Audit Student',
			chineseName: '審計學生',
			studentId: '7001001',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Creativity',
				casAlignment: ['Creativity']
			});
		});

		const evaluationId = await t.run(async (ctx) => {
			return await ctx.db.insert('evaluations', {
				studentId,
				teacherId: teacher,
				value: 2,
				categoryId,
				details: 'Good work',
				timestamp: Date.now(),
				semesterId: 'sem-1'
			});
		});

		const auditLogId = await t.run(async (ctx) => {
			return await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacher,
				targetTable: 'evaluations',
				targetId: evaluationId,
				oldValue: null,
				newValue: {
					studentId,
					value: 2,
					category: 'Creativity'
				},
				timestamp: Date.now()
			});
		});

		return { teacher, classId, studentId, categoryId, evaluationId, auditLogId };
	}

	test('audit.list returns fully enriched entries', async () => {
		const t = convexTest(schema, modules);

		const { teacher } = await createAuditChain(t);

		const tAuthed = t.withIdentity({ authId: 'test-token-admin-mock' });

		const results = await tAuthed.query(api.audit.list, {});

		expect(results).toHaveLength(1);
		const entry = results[0];

		expect(entry.performerId).toBe(teacher.toString());
		expect(entry.performerName).toBe('Audit Teacher');
		expect(entry.actionLabel).toBe('Created');
		expect(entry.studentName).toBe('Audit Student');
		expect(entry.studentId).toBe('7001001');
		expect(entry.studentGrade).toBe(10);
		expect(entry.studentGradeDisplay).toBe('10-1');
		expect(entry.category).toBe('Creativity');
		expect(entry.points).toBe(2);
		expect(entry.details).toBe('Good work');
	});

	test('audit.list falls back when student is deleted', async () => {
		const t = convexTest(schema, modules);

		const { studentId } = await createAuditChain(t);

		await t.run(async (ctx) => {
			await ctx.db.delete(studentId as Id<'students'>);
		});

		const tAuthed = t.withIdentity({ authId: 'test-token-admin-mock' });

		const results = await tAuthed.query(api.audit.list, {});

		expect(results).toHaveLength(1);
		const entry = results[0];

		expect(entry.studentName).toBeNull();
		expect(entry.studentId).toBeNull();
		expect(entry.studentGrade).toBeNull();
		expect(entry.studentGradeDisplay).toBeNull();
	});

	test('audit.list respects limit and returns correct order', async () => {
		const t = convexTest(schema, modules);

		const teacher = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'audit-teacher-pagination',
				name: 'Pagination Teacher',
				role: 'teacher',
				status: 'active'
			});
		});

		const { studentId } = await createStudentWithClass(t, {
			englishName: 'Pagination Student',
			chineseName: '分頁學生',
			studentId: '7001002',
			grade: 10,
			classNum: '1',
			status: 'Enrolled'
		});

		const categoryId = await t.run(async (ctx) => {
			return await ctx.db.insert('point_categories', {
				name: 'Creativity',
				casAlignment: ['Creativity']
			});
		});

		for (let i = 0; i < 3; i++) {
			const evalId = await t.run(async (ctx) => {
				return await ctx.db.insert('evaluations', {
					studentId,
					teacherId: teacher,
					value: i + 1,
					categoryId,
					details: `Eval ${i}`,
					timestamp: Date.now() + i,
					semesterId: 'sem-1'
				});
			});

			await t.run(async (ctx) => {
				await ctx.db.insert('audit_logs', {
					action: 'create_evaluation',
					performerId: teacher,
					targetTable: 'evaluations',
					targetId: evalId,
					oldValue: null,
					newValue: {
						studentId,
						value: i + 1,
						category: 'Creativity'
					},
					timestamp: Date.now() + i
				});
			});
		}

		const tAuthed = t.withIdentity({ authId: 'test-token-admin-mock' });

		const limited = await tAuthed.query(api.audit.list, { limit: 2 });

		expect(limited).toHaveLength(2);
		expect(limited[0].points).toBe(3);
		expect(limited[1].points).toBe(2);

		const allResults = await tAuthed.query(api.audit.list, {});
		expect(allResults).toHaveLength(3);
		expect(allResults[0].points).toBe(3);
		expect(allResults[1].points).toBe(2);
		expect(allResults[2].points).toBe(1);
	});

	test('audit.list action labels map correctly', async () => {
		const t = convexTest(schema, modules);

		const admin = await t.run(async (ctx) => {
			return await ctx.db.insert('users', {
				authId: 'audit-admin-labels',
				name: 'Label Admin',
				role: 'admin',
				status: 'active'
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'update_user_role',
				performerId: admin,
				targetTable: 'users',
				targetId: 'target-user',
				oldValue: { role: 'teacher' },
				newValue: { role: 'admin' },
				timestamp: Date.now()
			});
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('audit_logs', {
				action: 'delete_student',
				performerId: admin,
				targetTable: 'students',
				targetId: 'deleted-student',
				oldValue: { englishName: 'Deleted' },
				newValue: null,
				timestamp: Date.now()
			});
		});

		const tAuthed = t.withIdentity({ authId: 'test-token-admin-mock' });

		const results = await tAuthed.query(api.audit.list, {});

		const roleUpdate = results.find((r) => r.action === 'update_user_role');
		const studentDelete = results.find((r) => r.action === 'delete_student');

		expect(roleUpdate?.actionLabel).toBe('Role Updated');
		expect(studentDelete?.actionLabel).toBe('Student Deleted');
	});
});
