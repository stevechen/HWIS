import { mutation } from './_generated/server';
import { v } from 'convex/values';
import {
	authComponent,
	requireAdminForSensitiveOperation,
	requireSuperForSensitiveOperation
} from './auth';
import {
	resolveDepartmentRoles,
	type Department,
	type DepartmentRole
} from './shared/authorization';

interface TestUser {
	id: string;
	email: string;
	name: string;
}

// Core infrastructure users that should not be deleted during test teardowns
// because they are shared across parallel tests and have valid storageState.
const PROTECTED_EMAILS = new Set([
	'teacher@hwis.test',
	'admin@hwis.test',
	'super@hwis.test',
	'esladmin@hwis.test'
]);

type TestUserKey = 'teacher' | 'admin' | 'super' | 'eslAdmin';

type TestUserSpec = {
	key: TestUserKey;
	email: string;
	name: string;
	role: 'teacher' | 'admin' | 'super';
	/** Departments this account belongs to. Super belongs to both. */
	departments: readonly Department[];
	departmentRoles?: { international?: DepartmentRole; esl?: DepartmentRole };
};

/**
 * The test harness's accounts, one descriptor each.
 *
 * The descriptor is the single source of truth for provision, sessions and the
 * returned ids/tokens, so adding an account is a row rather than another
 * near-identical block. `departments` drives `setupTestUsers({ department })`:
 * an ESL-only run provisions the ESL admin and the universal super account, not
 * International staff it will never sign in as.
 *
 * The ESL admin is provisioned rather than derived: `/esl/admin` refuses anyone
 * without `departmentRoles.esl`, and the only mutation that grants it requires
 * an existing ESL admin. Without this row no e2e test can reach the ESL pages.
 */
const TEST_USER_SPECS: readonly TestUserSpec[] = [
	{
		key: 'teacher',
		email: 'teacher@hwis.test',
		name: 'Test Teacher',
		role: 'teacher',
		departments: ['international']
	},
	{
		key: 'admin',
		email: 'admin@hwis.test',
		name: 'Test Admin',
		role: 'admin',
		departments: ['international']
	},
	{
		key: 'super',
		email: 'super@hwis.test',
		name: 'Test Super Admin',
		role: 'super',
		departments: ['international', 'esl']
	},
	{
		key: 'eslAdmin',
		email: 'esladmin@hwis.test',
		name: 'Test ESL Admin',
		// ESL-only admins are stored with base role `teacher` and the admin rank
		// in `departmentRoles.esl` — exactly the shape `resolveDepartmentRoles`
		// documents. A base `admin` role would wrongly grant International access.
		role: 'teacher',
		departments: ['esl'],
		departmentRoles: { esl: 'admin' }
	}
];

const departmentArg = v.union(v.literal('all'), v.literal('international'), v.literal('esl'));

export const setupTestUsers = mutation({
	args: {
		testToken: v.optional(v.string()),
		department: v.optional(departmentArg)
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);
		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});
		const now = Date.now();
		const department = args.department ?? 'all';
		const specs = TEST_USER_SPECS.filter(
			(spec) => department === 'all' || spec.departments.includes(department)
		);

		const existingUsers = (await adapter.findMany({ model: 'user', where: [] })) as TestUser[];
		// A department-scoped setup is additive: wiping every test account would
		// sign the other department's parallel specs out mid-run. The default
		// `all` setup keeps the original reset semantics.
		if (department === 'all') {
			for (const user of existingUsers) {
				if (
					(user.email.includes('test') || user.email.includes('hwis.test')) &&
					!PROTECTED_EMAILS.has(user.email)
				) {
					await adapter.deleteMany({
						model: 'session',
						where: [{ field: 'userId', value: user.id }]
					});
					await adapter.deleteMany({
						model: 'account',
						where: [{ field: 'userId', value: user.id }]
					});
					await adapter.deleteMany({ model: 'user', where: [{ field: 'id', value: user.id }] });
				}
			}
		}

		const findOrCreate = async (email: string, name: string) => {
			const existing = existingUsers.find((u) => u.email === email);
			if (existing) return existing;
			return await adapter.create({
				model: 'user',
				data: { name, email, emailVerified: true, createdAt: now, updatedAt: now }
			});
		};

		const expiresAt = new Date(now + 24 * 60 * 60 * 1000);
		const provisioned: Partial<Record<TestUserKey, { id: string; token: string }>> = {};

		for (const spec of specs) {
			const user = await findOrCreate(spec.email, spec.name);
			const existingProfile = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', user.id))
				.first();

			if (!existingProfile) {
				await ctx.db.insert('users', {
					authId: user.id,
					name: spec.name,
					role: spec.role,
					status: 'active',
					...(spec.departmentRoles ? { departmentRoles: spec.departmentRoles } : {})
				});
			} else {
				// `departmentRoles` is set on the patch as well as the insert, so a
				// user who once held a different department role does not keep it: a
				// stale grant would silently widen what a test can reach.
				await ctx.db.patch(existingProfile._id, {
					role: spec.role,
					status: 'active',
					...(spec.departmentRoles ? { departmentRoles: spec.departmentRoles } : {})
				});
			}

			const token = `test_${spec.key}_session_${now}`;
			await adapter.deleteMany({
				model: 'session',
				where: [{ field: 'userId', value: user.id }]
			});
			await adapter.create({
				model: 'session',
				data: {
					userId: user.id,
					token,
					ipAddress: '127.0.0.1',
					userAgent: 'Playwright E2E',
					expiresAt,
					createdAt: new Date(now),
					updatedAt: new Date(now)
				}
			});
			provisioned[spec.key] = { id: user.id, token };
		}

		return {
			teacherUserId: provisioned.teacher?.id,
			adminUserId: provisioned.admin?.id,
			superUserId: provisioned.super?.id,
			eslAdminUserId: provisioned.eslAdmin?.id,
			teacherSessionToken: provisioned.teacher?.token,
			adminSessionToken: provisioned.admin?.token,
			superSessionToken: provisioned.super?.token,
			eslAdminSessionToken: provisioned.eslAdmin?.token,
			expiresAt: expiresAt.getTime()
		};
	}
});

/**
 * Test-only: grant (or clear) a user's ESL department role by email.
 *
 * E2E's seeded users are International staff by construction, so an ESL flow
 * needs one of them promoted before it can touch `requireEslAdmin` writes.
 * Behind `requireAdminForSensitiveOperation` like every other test-only write
 * — reachable from the authenticated Convex HTTP client in specs, never from
 * the app UI. Preserves the user's International assignment, mirroring
 * `esl/staff.setEslRole` (which refuses self-edits; this one does not, since
 * the caller is the admin session, not the target).
 */
export const setEslRoleByEmail = mutation({
	args: {
		email: v.string(),
		eslRole: v.union(v.literal('admin'), v.literal('teacher'), v.null()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx, args.testToken);

		const adapter = await authComponent.adapter(ctx)({
			user: { fields: undefined }
		});
		const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as Array<{
			id: string;
			email?: string;
		}>;
		const baUser = baUsers.find((u) => u.email?.toLowerCase() === args.email.toLowerCase());
		if (!baUser) {
			throw new Error(`Test user not found for email: ${args.email}`);
		}

		const profile = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', baUser.id))
			.first();
		if (!profile) {
			throw new Error(`User profile not found for email: ${args.email}`);
		}
		if (profile.role === 'student') {
			throw new Error('Students cannot hold ESL roles');
		}

		const current = resolveDepartmentRoles(profile);
		const next: { international?: DepartmentRole; esl?: DepartmentRole } = {};
		if (current.international) next.international = current.international;
		if (args.eslRole) next.esl = args.eslRole;

		await ctx.db.patch(profile._id, {
			departmentRoles: Object.keys(next).length > 0 ? next : undefined
		});

		return { success: true, userId: profile._id, eslRole: args.eslRole };
	}
});

/**
 * Test-only: clear all ESL department data.
 *
 * Deletes all ESL tables: cohorts, students, classes, class meetings,
 * teacher availability, semesters, events, teacher notes, and holiday cache.
 * Does NOT touch International tables (students, evaluations, etc.) or users.
 *
 * Requires a Super user (or the unit-test super token) like other sensitive
 * test-only mutations. Useful for manual testing and E2E test teardown.
 */
export const clearEslData = mutation({
	args: {
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireSuperForSensitiveOperation(ctx, args.testToken);

		// Clear ESL tables in dependency order (children first)
		const teacherNotes = await ctx.db.query('teacher_notes').collect();
		for (const note of teacherNotes) await ctx.db.delete(note._id);

		const eslEvents = await ctx.db.query('esl_events').collect();
		for (const event of eslEvents) await ctx.db.delete(event._id);

		const eslSemesters = await ctx.db.query('esl_semesters').collect();
		for (const semester of eslSemesters) await ctx.db.delete(semester._id);

		const eslTeacherAvailability = await ctx.db.query('esl_teacher_availability').collect();
		for (const avail of eslTeacherAvailability) await ctx.db.delete(avail._id);

		const eslClassMeetings = await ctx.db.query('esl_class_meetings').collect();
		for (const meeting of eslClassMeetings) await ctx.db.delete(meeting._id);

		const eslClasses = await ctx.db.query('esl_classes').collect();
		for (const cls of eslClasses) await ctx.db.delete(cls._id);

		const eslStudents = await ctx.db.query('esl_students').collect();
		for (const student of eslStudents) await ctx.db.delete(student._id);

		const eslCohorts = await ctx.db.query('esl_cohorts').collect();
		for (const cohort of eslCohorts) await ctx.db.delete(cohort._id);

		const eslHolidayCache = await ctx.db.query('esl_holiday_cache').collect();
		for (const holiday of eslHolidayCache) await ctx.db.delete(holiday._id);

		return { message: 'ESL data cleared' };
	}
});
