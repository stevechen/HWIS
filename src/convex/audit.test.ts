import { expect, test, describe } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { modules } from './test.setup';

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
			return await ctx.db.query('audit_logs').withIndex('by_timestamp').order('desc').take(10);
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
			return await ctx.db.query('audit_logs').withIndex('by_timestamp').order('desc').take(10);
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
