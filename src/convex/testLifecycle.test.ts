import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest as rawConvexTest } from 'convex-test';
import { modules } from './test.setup';
import { api } from './_generated/api';
import schema from './schema';
import { authComponent } from './auth';

type BetterAuthUser = {
	id: string;
	email?: string;
	name?: string;
};

type MockAuthAdapter = {
	findMany: ReturnType<typeof vi.fn>;
	findOne: ReturnType<typeof vi.fn>;
	create: ReturnType<typeof vi.fn>;
	deleteMany: ReturnType<typeof vi.fn>;
};

function createMockAdapter(initialUsers: BetterAuthUser[] = []) {
	const users = [...initialUsers];
	const sessions: Array<{ userId: string; token: string }> = [];
	const accounts: Array<{ userId: string }> = [];

	const adapter: MockAuthAdapter = {
		findMany: vi.fn(async ({ model }: { model: string }) => {
			if (model === 'user') return users;
			return [];
		}),
		findOne: vi.fn(
			async ({
				model,
				where
			}: {
				model: string;
				where: Array<{ field: string; value: string }>;
			}) => {
				if (model !== 'user') return null;
				const id = where.find((w) => w.field === 'id')?.value;
				if (!id) return null;
				return users.find((u) => u.id === id) ?? null;
			}
		),
		create: vi.fn(async ({ model, data }: { model: string; data: Record<string, unknown> }) => {
			if (model === 'user') {
				const id = (data.id as string | undefined) ?? `u_${users.length + 1}`;
				const created = { id, email: data.email as string, name: data.name as string };
				users.push(created);
				return created;
			}
			if (model === 'session') {
				sessions.push({ userId: data.userId as string, token: data.token as string });
				return data;
			}
			if (model === 'account') {
				accounts.push({ userId: data.userId as string });
				return data;
			}
			return data;
		}),
		deleteMany: vi.fn(
			async ({
				model,
				where
			}: {
				model: string;
				where: Array<{ field: string; value: string }>;
			}) => {
				const first = where[0];
				if (!first) return;
				if (model === 'user' && first.field === 'id') {
					const idx = users.findIndex((u) => u.id === first.value);
					if (idx >= 0) users.splice(idx, 1);
				}
				if (model === 'session' && first.field === 'userId') {
					for (let i = sessions.length - 1; i >= 0; i--) {
						if (sessions[i].userId === first.value) sessions.splice(i, 1);
					}
				}
				if (model === 'account' && first.field === 'userId') {
					for (let i = accounts.length - 1; i >= 0; i--) {
						if (accounts[i].userId === first.value) accounts.splice(i, 1);
					}
				}
			}
		)
	};

	return { adapter, state: { users, sessions, accounts } };
}

describe('test data lifecycle', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('teardownByTag scope all removes tagged rows across every table and leaves untagged data', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const taggedClass = await ctx.db.insert('classes', {
				grade: 7,
				class: '1',
				e2eTag: 'e2e-test_x'
			});
			const untaggedClass = await ctx.db.insert('classes', { grade: 8, class: '1' });
			const teacher = await ctx.db.insert('users', {
				authId: 'e2e_teacher1',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
			const taggedStudent = await ctx.db.insert('students', {
				englishName: 'Tagged Student',
				chineseName: '標記',
				studentId: 'TS1',
				classId: taggedClass,
				status: 'Enrolled',
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('students', {
				englishName: 'Real Student',
				chineseName: '真實',
				studentId: 'RS1',
				classId: untaggedClass,
				status: 'Enrolled'
			});
			const category = await ctx.db.insert('point_categories', {
				name: 'Tagged Category',
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('evaluations', {
				studentId: taggedStudent,
				teacherId: teacher,
				value: 1,
				categoryId: category,
				details: '',
				timestamp: 1,
				semesterId: 'S1',
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('audit_logs', {
				action: 'create',
				performerId: teacher,
				targetTable: 'students',
				targetId: 'x',
				timestamp: 1,
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('house_events', {
				title: 'Tagged Event',
				startDate: 1,
				endDate: 2,
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('house_events', {
				title: 'Untagged Event',
				startDate: 1,
				endDate: 2
			});
			await ctx.db.insert('backups', {
				filename: 'tagged.json',
				data: {},
				createdAt: 1,
				e2eTag: 'e2e-test_x'
			});
		});

		const result = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'all',
			e2eTag: 'e2e-test_x'
		});
		expect(result.deleted).toEqual({
			students: 1,
			evaluations: 1,
			audit_logs: 1,
			point_categories: 1,
			house_events: 1,
			backups: 1,
			classes: 1
		});

		const snapshot = await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const categories = await ctx.db.query('point_categories').collect();
			const evaluations = await ctx.db.query('evaluations').collect();
			const audit = await ctx.db.query('audit_logs').collect();
			const events = await ctx.db.query('house_events').collect();
			const backups = await ctx.db.query('backups').collect();
			const classes = await ctx.db.query('classes').collect();
			return { students, categories, evaluations, audit, events, backups, classes };
		});

		expect(snapshot.students.map((s) => s.studentId)).toEqual(['RS1']);
		expect(snapshot.categories).toHaveLength(0);
		expect(snapshot.evaluations).toHaveLength(0);
		expect(snapshot.audit).toHaveLength(0);
		expect(snapshot.events.map((e) => e.title)).toEqual(['Untagged Event']);
		expect(snapshot.backups).toHaveLength(0);
		// The tagged student's class became orphaned; the untagged class survives.
		expect(snapshot.classes).toHaveLength(1);
	});

	it('teardownByTag cascades to untagged evaluations and audit logs of tagged students', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const cls = await ctx.db.insert('classes', {
				grade: 7,
				class: '1',
				e2eTag: 'e2e-test_x'
			});
			const teacher = await ctx.db.insert('users', {
				authId: 'e2e_teacher1',
				name: 'Teacher',
				role: 'teacher',
				status: 'active'
			});
			const student = await ctx.db.insert('students', {
				englishName: 'S',
				chineseName: '',
				studentId: 'S1',
				classId: cls,
				status: 'Enrolled',
				e2eTag: 'e2e-test_x'
			});
			const category = await ctx.db.insert('point_categories', { name: 'Cat' });
			// Untagged evaluation referencing the tagged student.
			const evaluation = await ctx.db.insert('evaluations', {
				studentId: student,
				teacherId: teacher,
				value: 1,
				categoryId: category,
				details: '',
				timestamp: 1,
				semesterId: 'S1'
			});
			// Untagged audit log referencing the deleted evaluation.
			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: teacher,
				targetTable: 'evaluations',
				targetId: evaluation,
				timestamp: 1
			});
		});

		const result = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'students',
			e2eTag: 'e2e-test_x'
		});
		expect(result.deleted.students).toBe(1);
		expect(result.deleted.evaluations).toBe(1);
		expect(result.deleted.audit_logs).toBe(1);

		const snapshot = await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const evaluations = await ctx.db.query('evaluations').collect();
			const audit = await ctx.db.query('audit_logs').collect();
			return { students, evaluations, audit };
		});
		expect(snapshot.students).toHaveLength(0);
		expect(snapshot.evaluations).toHaveLength(0);
		expect(snapshot.audit).toHaveLength(0);
	});

	it('teardownByTag preserves untagged classes and classes owned by another tag', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const owned = await ctx.db.insert('classes', {
				grade: 7,
				class: '1',
				e2eTag: 'e2e-test_a'
			});
			await ctx.db.insert('classes', { grade: 7, class: '2' });
			await ctx.db.insert('classes', { grade: 7, class: '3', e2eTag: 'e2e-test_b' });
			await ctx.db.insert('students', {
				englishName: 'Owned',
				chineseName: '',
				studentId: 'OWNED',
				classId: owned,
				status: 'Enrolled',
				e2eTag: 'e2e-test_a'
			});
		});

		await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'all',
			e2eTag: 'e2e-test_a'
		});

		const classes = await t.run(async (ctx) => ctx.db.query('classes').collect());
		expect(classes.map((cls) => cls.class).sort()).toEqual(['2', '3']);
	});

	it('teardownByTag scope categories only removes tagged categories', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const cls = await ctx.db.insert('classes', { grade: 7, class: '1' });
			await ctx.db.insert('students', {
				englishName: 'S',
				chineseName: '',
				studentId: 'S1',
				classId: cls,
				status: 'Enrolled',
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('point_categories', { name: 'Cat', e2eTag: 'e2e-test_x' });
		});

		const result = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'categories',
			e2eTag: 'e2e-test_x'
		});
		expect(result.deleted).toEqual({ point_categories: 1 });

		const snapshot = await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const categories = await ctx.db.query('point_categories').collect();
			return { students, categories };
		});
		expect(snapshot.students).toHaveLength(1);
		expect(snapshot.categories).toHaveLength(0);
	});

	it('teardownByTag scope houseEvents removes tagged events only', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert('house_events', {
				title: 'Tagged',
				startDate: 1,
				endDate: 2,
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('house_events', { title: 'Untagged', startDate: 1, endDate: 2 });
		});

		const result = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'houseEvents',
			e2eTag: 'e2e-test_x'
		});
		expect(result.deleted).toEqual({ house_events: 1 });

		const events = await t.run(async (ctx) => ctx.db.query('house_events').collect());
		expect(events.map((e) => e.title)).toEqual(['Untagged']);
	});

	it('teardownByTag scope backups removes tagged backups only', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert('backups', {
				filename: 'tagged.json',
				data: {},
				createdAt: 1,
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('backups', { filename: 'real.json', data: {}, createdAt: 1 });
		});

		const result = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'backups',
			e2eTag: 'e2e-test_x'
		});
		expect(result.deleted).toEqual({ backups: 1 });

		const backups = await t.run(async (ctx) => ctx.db.query('backups').collect());
		expect(backups.map((b) => b.filename)).toEqual(['real.json']);
	});

	it('teardownByTag scope auditLogs removes tagged logs and the test performer user', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const performer = await ctx.db.insert('users', {
				authId: 'e2e-audit-abc',
				name: 'Performer',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('audit_logs', {
				action: 'student_created',
				performerId: performer,
				targetTable: 'students',
				targetId: 'x',
				timestamp: 1,
				e2eTag: 'e2e-audit-abc'
			});
			await ctx.db.insert('audit_logs', {
				action: 'other',
				performerId: performer,
				targetTable: 'students',
				targetId: 'y',
				timestamp: 2,
				e2eTag: 'other-tag'
			});
		});

		const result = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'auditLogs',
			e2eTag: 'e2e-audit-abc'
		});
		expect(result.deleted.audit_logs).toBe(1);
		expect(result.deleted.users).toBe(1);

		const snapshot = await t.run(async (ctx) => {
			const audit = await ctx.db.query('audit_logs').collect();
			const users = await ctx.db.query('users').collect();
			return { audit, users };
		});
		expect(snapshot.audit).toHaveLength(1);
		expect(snapshot.audit[0].e2eTag).toBe('other-tag');
		expect(snapshot.users).toHaveLength(0);
	});

	it('teardownByTag is idempotent', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const cls = await ctx.db.insert('classes', { grade: 7, class: '1' });
			await ctx.db.insert('students', {
				englishName: 'S',
				chineseName: '',
				studentId: 'S1',
				classId: cls,
				status: 'Enrolled',
				e2eTag: 'e2e-test_x'
			});
		});

		const first = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'all',
			e2eTag: 'e2e-test_x'
		});
		const second = await t.mutation(api.testLifecycle.teardownByTag, {
			scope: 'all',
			e2eTag: 'e2e-test_x'
		});
		expect(first.deleted.students).toBe(1);
		expect(second.deleted).toEqual({});
	});

	it('teardownAllTagged removes any tagged rows and leaves untagged data', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const cls = await ctx.db.insert('classes', { grade: 7, class: '1' });
			await ctx.db.insert('students', {
				englishName: 'Tagged',
				chineseName: '',
				studentId: 'S1',
				classId: cls,
				status: 'Enrolled',
				e2eTag: 'e2e-test_a'
			});
			await ctx.db.insert('students', {
				englishName: 'Untagged',
				chineseName: '',
				studentId: 'S2',
				classId: cls,
				status: 'Enrolled'
			});
			await ctx.db.insert('point_categories', { name: 'Cat', e2eTag: 'e2e-test_b' });
		});

		const result = await t.mutation(api.testLifecycle.teardownAllTagged, {});
		expect(result.deleted.students).toBe(1);
		expect(result.deleted.point_categories).toBe(1);

		const snapshot = await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const categories = await ctx.db.query('point_categories').collect();
			return { students, categories };
		});
		expect(snapshot.students.map((s) => s.studentId)).toEqual(['S2']);
		expect(snapshot.categories).toHaveLength(0);
	});

	it('teardownTestUsers removes test users while preserving protected users', async () => {
		const mock = createMockAdapter([
			{ id: 'teacher-id', email: 'teacher@hwis.test', name: 'Protected Teacher' },
			{ id: 'temp-id', email: 'e2e-temp@hwis.test', name: 'Delete Me' },
			{ id: 'real-id', email: 'real@example.com', name: 'Keep Me' }
		]);
		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'temp-id',
				name: 'Temp',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'teacher-id',
				name: 'Protected',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'e2e_teacher1',
				name: 'Test',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'orphan-id',
				name: 'Orphan',
				role: 'teacher',
				status: 'active'
			});
		});

		const result = await t.mutation(api.testLifecycle.teardownTestUsers, {});
		expect(result.deleted.users).toBe(3);

		const convexUsers = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(convexUsers.map((u) => u.authId)).toEqual(['teacher-id']);
		expect(mock.state.users.some((u) => u.email === 'e2e-temp@hwis.test')).toBe(false);
		expect(mock.state.users.some((u) => u.email === 'teacher@hwis.test')).toBe(true);
		expect(mock.state.users.some((u) => u.email === 'real@example.com')).toBe(true);
	});

	it('teardownTestUsers is idempotent', async () => {
		const mock = createMockAdapter([
			{ id: 'teacher-id', email: 'teacher@hwis.test', name: 'Protected Teacher' },
			{ id: 'temp-id', email: 'e2e-temp@hwis.test', name: 'Delete Me' }
		]);
		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'temp-id',
				name: 'Temp',
				role: 'teacher',
				status: 'active'
			});
		});

		const first = await t.mutation(api.testLifecycle.teardownTestUsers, {});
		const second = await t.mutation(api.testLifecycle.teardownTestUsers, {});
		expect(first.deleted.users).toBe(1);
		expect(second.deleted.users).toBe(0);
	});

	it('teardownBackupsByTimestamp respects the since cutoff', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert('backups', { filename: 'new.json', data: {}, createdAt: 100 });
			await ctx.db.insert('backups', { filename: 'old.json', data: {}, createdAt: 50 });
		});

		const result = await t.mutation(api.testLifecycle.teardownBackupsByTimestamp, { since: 100 });
		expect(result.deleted).toEqual({ backups: 1 });

		const backups = await t.run(async (ctx) => ctx.db.query('backups').collect());
		expect(backups.map((b) => b.filename)).toEqual(['old.json']);
	});

	it('verifyCleanTeardown reports remaining rows and is empty after teardown', async () => {
		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const cls = await ctx.db.insert('classes', { grade: 7, class: '1' });
			await ctx.db.insert('students', {
				englishName: 'S',
				chineseName: '',
				studentId: 'S1',
				classId: cls,
				status: 'Enrolled',
				e2eTag: 'e2e-test_x'
			});
		});

		const before = await t.query(api.testLifecycle.verifyCleanTeardown, { e2eTag: 'e2e-test_x' });
		expect(before.remaining.students).toBe(1);

		await t.mutation(api.testLifecycle.teardownByTag, { scope: 'all', e2eTag: 'e2e-test_x' });

		const after = await t.query(api.testLifecycle.verifyCleanTeardown, { e2eTag: 'e2e-test_x' });
		expect(after.remaining).toEqual({});
	});
});
