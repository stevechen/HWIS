import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { convexTest as rawConvexTest } from 'convex-test';
import { modules, mockAuthUser, seedUser } from './test.setup';
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

		// The three pre-existing infrastructure users survive, the junk user is
		// deleted, and the four provisioned test users exist. The ESL admin is in
		// that count because `/esl/admin` needs `departmentRoles.esl` and only an
		// existing ESL admin can grant it.
		expect(authIds).toEqual(['admin-id', 'u_2', 'u_3', 'u_4']);
		expect(mock.state.users.some((u) => u.email === 'e2e-audit-user@hwis.test')).toBe(false);
		expect(mock.state.users.some((u) => u.email === 'teacher@hwis.test')).toBe(true);
		expect(mock.state.users.some((u) => u.email === 'super@hwis.test')).toBe(true);
		expect(mock.state.users.some((u) => u.email === 'esladmin@hwis.test')).toBe(true);
	});

	it('gives the ESL test admin the department role the ESL admin pages require', async () => {
		const mock = createMockAdapter([]);
		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);
		await t.mutation(api.testSetup.setupTestUsers, {});

		// Collected and filtered here rather than with `.filter(...)`, which the
		// query builder does not type for an arbitrary predicate.
		const eslAdmin = await t.run(async (ctx) => {
			const users = await ctx.db.query('users').collect();
			return users.find((user) => user.name === 'Test ESL Admin');
		});

		// Without this, `/esl/admin` refuses the only user the harness can sign in
		// as, and no e2e test can reach the department's pages.
		expect(eslAdmin?.departmentRoles).toEqual({ esl: 'admin' });
		// The real ESL-only shape: base role `teacher`, admin rank in the
		// department. A base `admin` role would leak International access.
		expect(eslAdmin?.role).toBe('teacher');
		expect(eslAdmin?.status).toBe('active');
	});

	it('setupTestUsers can provision a single department', async () => {
		const mock = createMockAdapter([]);
		vi.spyOn(authComponent, 'adapter').mockImplementation(() => {
			return (() => Promise.resolve(mock.adapter)) as never;
		});

		const t = rawConvexTest(schema, modules);
		const result = await t.mutation(api.testSetup.setupTestUsers, { department: 'esl' });

		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		const names = users.map((u) => u.name).sort();
		expect(names).toEqual(['Test ESL Admin', 'Test Super Admin']);

		const eslAdmin = users.find((u) => u.name === 'Test ESL Admin');
		expect(eslAdmin?.departmentRoles).toEqual({ esl: 'admin' });
		expect(result.eslAdminUserId).toBeTruthy();
		// The ESL-only setup does not fabricate International staff.
		expect(result.teacherUserId).toBeUndefined();
		expect(result.adminUserId).toBeUndefined();
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
			const cls = await ctx.db.insert('classes', {
				grade: 7,
				class: '1',
				homeroomTeacherId: teacher
			});
			const student = await ctx.db.insert('students', {
				englishName: 'To Delete',
				chineseName: '刪',
				studentId: 'DEL1',
				classId: cls,
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

		expect(snapshot.categories).toHaveLength(7);
		expect(snapshot.students).toHaveLength(5);
		expect(snapshot.evaluations).toHaveLength(0);
		expect(snapshot.audits).toHaveLength(0);
	});

	it('testSetup.clearEslData clears all ESL tables', async () => {
		const t = rawConvexTest(schema, modules);
		const superId = await seedUser(t, {
			authId: 'clear-esl-super',
			name: 'Clear ESL Super',
			role: 'super',
			status: 'active'
		});
		mockAuthUser({
			_id: superId,
			authId: 'clear-esl-super',
			name: 'Clear ESL Super',
			role: 'super',
			status: 'active'
		});

		// Seed ESL data across all ESL tables
		await t.run(async (ctx) => {
			// Create cohort
			const cohortId = await ctx.db.insert('esl_cohorts', {
				year: '2025-2026',
				grade: 7,
				level: 'CLIL',
				classNumber: '01',
				status: 'active',
				createdAt: Date.now()
			});

			// Create class
			const classId = await ctx.db.insert('esl_classes', {
				cohortId,
				type: 'CLIL',
				name: 'G7 CLIL',
				status: 'active',
				createdAt: Date.now()
			});

			// Create student
			await ctx.db.insert('esl_students', {
				cohortId,
				englishName: 'Test Student',
				chineseName: '測試學生',
				schoolStudentId: '123456',
				status: 'active',
				enrolledAt: Date.now()
			});

			// Create class meeting
			await ctx.db.insert('esl_class_meetings', {
				classId,
				year: '2025-2026',
				day: 'Monday',
				period: 1
			});

			// Create teacher availability
			await ctx.db.insert('esl_teacher_availability', {
				teacherId: (await ctx.db.query('users').first())!._id,
				year: '2025-2026',
				day: 'Monday',
				period: 2
			});

			// Create semester
			const semesterId = await ctx.db.insert('esl_semesters', {
				year: '2025-2026',
				term: 'S1',
				startDate: '2025-09-01'
			});

			// Create event
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'start_school',
				title: 'First Day',
				target: 'all',
				date: '2025-09-01'
			});

			// Create teacher note
			await ctx.db.insert('teacher_notes', {
				classId,
				date: '2025-09-01',
				teacherId: (await ctx.db.query('users').first())!._id,
				text: 'Test note',
				updatedAt: Date.now(),
				updatedBy: (await ctx.db.query('users').first())!._id
			});

			// Create holiday cache
			await ctx.db.insert('esl_holiday_cache', {
				year: '2025',
				date: '20250901',
				isHoliday: false,
				caption: '',
				fetchedAt: Date.now()
			});
		});

		// Verify data exists before clearing
		const before = await t.run(async (ctx) => ({
			cohorts: (await ctx.db.query('esl_cohorts').collect()).length,
			classes: (await ctx.db.query('esl_classes').collect()).length,
			students: (await ctx.db.query('esl_students').collect()).length,
			meetings: (await ctx.db.query('esl_class_meetings').collect()).length,
			availability: (await ctx.db.query('esl_teacher_availability').collect()).length,
			semesters: (await ctx.db.query('esl_semesters').collect()).length,
			events: (await ctx.db.query('esl_events').collect()).length,
			notes: (await ctx.db.query('teacher_notes').collect()).length,
			holidayCache: (await ctx.db.query('esl_holiday_cache').collect()).length
		}));

		expect(before.cohorts).toBe(1);
		expect(before.classes).toBe(1);
		expect(before.students).toBe(1);
		expect(before.meetings).toBe(1);
		expect(before.availability).toBe(1);
		expect(before.semesters).toBe(1);
		expect(before.events).toBe(1);
		expect(before.notes).toBe(1);
		expect(before.holidayCache).toBe(1);

		// Call clearEslData
		await t.mutation(api.testSetup.clearEslData, {});

		// Verify all ESL data is cleared
		const after = await t.run(async (ctx) => ({
			cohorts: (await ctx.db.query('esl_cohorts').collect()).length,
			classes: (await ctx.db.query('esl_classes').collect()).length,
			students: (await ctx.db.query('esl_students').collect()).length,
			meetings: (await ctx.db.query('esl_class_meetings').collect()).length,
			availability: (await ctx.db.query('esl_teacher_availability').collect()).length,
			semesters: (await ctx.db.query('esl_semesters').collect()).length,
			events: (await ctx.db.query('esl_events').collect()).length,
			notes: (await ctx.db.query('teacher_notes').collect()).length,
			holidayCache: (await ctx.db.query('esl_holiday_cache').collect()).length
		}));

		expect(after.cohorts).toBe(0);
		expect(after.classes).toBe(0);
		expect(after.students).toBe(0);
		expect(after.meetings).toBe(0);
		expect(after.availability).toBe(0);
		expect(after.semesters).toBe(0);
		expect(after.events).toBe(0);
		expect(after.notes).toBe(0);
		expect(after.holidayCache).toBe(0);
	});

	it('testSetup.clearEslData refuses a non-super caller', async () => {
		const t = rawConvexTest(schema, modules);
		const teacherId = await seedUser(t, {
			authId: 'clear-esl-teacher',
			name: 'Not Super',
			role: 'teacher',
			status: 'active'
		});
		mockAuthUser({
			_id: teacherId,
			authId: 'clear-esl-teacher',
			name: 'Not Super',
			role: 'teacher',
			status: 'active'
		});

		await expect(t.mutation(api.testSetup.clearEslData, {})).rejects.toThrow(/Forbidden/);
	});
});
