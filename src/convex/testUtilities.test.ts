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

describe('test utilities', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('testSetup.setupTestUsers is idempotent and keeps protected users', async () => {
		const mock = createMockAdapter([
			{ id: 'admin-id', email: 'admin@hwis.test', name: 'Existing Admin' },
			{ id: 'junk-id', email: 'e2e-audit-user@hwis.test', name: 'Should Delete' }
		]);

		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);

		await t.mutation(api.testSetup.setupTestUsers, {});
		await t.mutation(api.testSetup.setupTestUsers, {});

		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		const authIds = users.map((u) => u.authId).sort();

		expect(authIds).toEqual(['admin-id', 'u_2', 'u_3']);
		expect(mock.state.users.some((u) => u.email === 'e2e-audit-user@hwis.test')).toBe(false);
		expect(mock.state.users.some((u) => u.email === 'teacher@hwis.test')).toBe(true);
		expect(mock.state.users.some((u) => u.email === 'super@hwis.test')).toBe(true);
	});

	it('testSetup.cleanupTestUsers removes only non-protected test users', async () => {
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
		});

		const result = await t.mutation(api.testSetup.cleanupTestUsers, {});
		expect(result.deleted).toBe(1);

		const convexUsers = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(convexUsers.some((u) => u.authId === 'temp-id')).toBe(false);
		expect(convexUsers.some((u) => u.authId === 'teacher-id')).toBe(true);
		expect(mock.state.users.some((u) => u.id === 'temp-id')).toBe(false);
		expect(mock.state.users.some((u) => u.id === 'teacher-id')).toBe(true);
	});

	it('testCleanup.cleanupAllTestData deletes only tagged/prefixed test data', async () => {
		const mock = createMockAdapter([
			{ id: 'teacher-id', email: 'teacher@hwis.test', name: 'Protected Teacher' },
			{ id: 'real-id', email: 'real@example.com', name: 'Real User' }
		]);
		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const protectedUser = await ctx.db.insert('users', {
				authId: 'teacher-id',
				name: 'Protected',
				role: 'teacher',
				status: 'active'
			});
			const testUser = await ctx.db.insert('users', {
				authId: 'e2e_teacher1',
				name: 'Test',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'real-id',
				name: 'Real',
				role: 'teacher',
				status: 'active'
			});

			const taggedStudent = await ctx.db.insert('students', {
				englishName: 'Tagged Student',
				chineseName: '測試',
				studentId: 'TS1',
				grade: 10,
				status: 'Enrolled',
				e2eTag: 'e2e-test_x'
			});
			const category = await ctx.db.insert('point_categories', {
				name: 'Tagged Category',
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('evaluations', {
				studentId: taggedStudent,
				teacherId: protectedUser,
				value: 1,
				categoryId: category,
				details: 'details',
				timestamp: Date.now(),
				semesterId: '2026-S1',
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('audit_logs', {
				action: 'create',
				performerId: testUser,
				targetTable: 'students',
				targetId: 'x',
				timestamp: Date.now(),
				e2eTag: 'e2e-test_x'
			});
			await ctx.db.insert('students', {
				englishName: 'Real Student',
				chineseName: '真實',
				studentId: 'RS1',
				grade: 10,
				status: 'Enrolled'
			});
		});

		const result = await t.mutation(api.testCleanup.cleanupAllTestData, {});
		expect(result.deletedData).toBe(4);
		expect(result.deletedUsers).toBe(1);

		const counts = await t.run(async (ctx) => {
			const students = await ctx.db.query('students').collect();
			const categories = await ctx.db.query('point_categories').collect();
			const evaluations = await ctx.db.query('evaluations').collect();
			const audit = await ctx.db.query('audit_logs').collect();
			const users = await ctx.db.query('users').collect();
			return { students, categories, evaluations, audit, users };
		});

		expect(counts.students).toHaveLength(1);
		expect(counts.categories).toHaveLength(0);
		expect(counts.evaluations).toHaveLength(0);
		expect(counts.audit).toHaveLength(0);
		expect(counts.users.some((u) => u.authId === 'teacher-id')).toBe(true);
		expect(counts.users.some((u) => u.authId === 'e2e_teacher1')).toBe(false);
	});

	it('dedupeUsers keeps newest per authId and is idempotent', async () => {
		const mock = createMockAdapter([
			{ id: 'ba-test', email: 'e2e-dup@hwis.test', name: 'Test BA' },
			{ id: 'ba-real', email: 'real@example.com', name: 'Real BA' }
		]);
		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert('users', {
				authId: 'same-auth',
				name: 'Older',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'same-auth',
				name: 'Newer',
				role: 'teacher',
				status: 'active'
			});
			await ctx.db.insert('users', {
				authId: 'unique-auth',
				name: 'Unique',
				role: 'teacher',
				status: 'active'
			});
		});

		const first = await t.mutation(api.dedupeUsers.dedupeUsers, {});
		const second = await t.mutation(api.dedupeUsers.dedupeUsers, {});

		expect(first.deleted).toBe(1);
		expect(second.deleted).toBe(0);

		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(users.filter((u) => u.authId === 'same-auth')).toHaveLength(1);
		expect(mock.state.users.some((u) => u.id === 'ba-test')).toBe(false);
		expect(mock.state.users.some((u) => u.id === 'ba-real')).toBe(true);
	});

	it('resetDb.resetDatabase re-seeds deterministic baseline', async () => {
		const mock = createMockAdapter([
			{ id: 'ba-test', email: 'temp@hwis.test', name: 'Delete Me' },
			{ id: 'ba-real', email: 'real@example.com', name: 'Keep Me' }
		]);
		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);
		await t.run(async (ctx) => {
			const teacher = await ctx.db.insert('users', {
				authId: 'orphan-auth',
				name: 'Orphan',
				role: 'teacher',
				status: 'active'
			});
			const student = await ctx.db.insert('students', {
				englishName: 'To Delete',
				chineseName: '刪',
				studentId: 'DEL1',
				grade: 10,
				status: 'Enrolled'
			});
			const category = await ctx.db.insert('point_categories', {
				name: 'Old Category'
			});
			await ctx.db.insert('evaluations', {
				studentId: student,
				teacherId: teacher,
				value: 1,
				categoryId: category,
				details: '',
				timestamp: Date.now(),
				semesterId: '2026-S1'
			});
			await ctx.db.insert('audit_logs', {
				action: 'seed',
				performerId: teacher,
				targetTable: 'students',
				targetId: 'DEL1',
				timestamp: Date.now()
			});
		});

		await t.mutation(api.resetDb.resetDatabase, {});
		await t.mutation(api.resetDb.resetDatabase, {});

		const snapshot = await t.run(async (ctx) => {
			const categories = await ctx.db.query('point_categories').collect();
			const students = await ctx.db.query('students').collect();
			const evaluations = await ctx.db.query('evaluations').collect();
			const audits = await ctx.db.query('audit_logs').collect();
			return { categories, students, evaluations, audits };
		});

		expect(snapshot.categories).toHaveLength(4);
		expect(snapshot.students).toHaveLength(5);
		expect(snapshot.evaluations).toHaveLength(0);
		expect(snapshot.audits).toHaveLength(0);
	});
});
