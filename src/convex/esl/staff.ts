import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { authComponent, requireEslAdmin, requireEslStaff } from '../auth';
import { resolveDepartmentRoles, type DepartmentRole } from '../shared/authorization';
import { displayStaffName, normalizeStaffName } from '../shared/staff_name';
import { cohortLabel, type EslDay } from '../shared/esl';

type BetterAuthUser = {
	_id?: string;
	id?: string;
	email?: string;
	image?: string | null;
};

/** A staff member as the ESL admin screens them: one row per user, never students. */
type StaffRow = {
	_id: Id<'users'>;
	name: string;
	/** The account's application role. Students never reach this list. */
	role: 'super' | 'admin' | 'teacher';
	status: 'pending' | 'active';
	/** The ESL assignment, or `null` when the user has none. */
	eslRole: DepartmentRole | null;
	/** The International assignment, or `null`. Kept so the UI can show hybrid staff. */
	internationalRole: DepartmentRole | null;
};

/** Narrows the stored role to a staff role, dropping `student` and absent values. */
function staffRole(role: Doc<'users'>['role']): StaffRow['role'] | null {
	return role === 'super' || role === 'admin' || role === 'teacher' ? role : null;
}

/**
 * The ESL department roster with each member's department assignments.
 *
 * `resolveDepartmentRoles` gives legacy rows their International fallback, so
 * this shows the *effective* assignment rather than the raw column.
 *
 * cost: 1 bounded take of the users table (the school has tens of staff, never
 * a full-table scan) — the ESL admin screen is the only caller.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		await requireEslAdmin(ctx);

		const users = await ctx.db.query('users').take(200);

		return users
			.filter((u) => staffRole(u.role) !== null)
			.map((u): StaffRow => {
				const roles = resolveDepartmentRoles(u);
				return {
					_id: u._id,
					name: displayStaffName(u.name),
					role: staffRole(u.role) ?? 'teacher',
					status: u.status ?? 'active',
					eslRole: roles.esl ?? null,
					internationalRole: roles.international ?? null
				};
			})
			.sort((a, b) => normalizeStaffName(a.name).localeCompare(normalizeStaffName(b.name)));
	}
});

/**
 * A teacher's profile for the ESL admin profile page: identity plus the year's
 * teaching assignment.
 *
 * One read seam backs the whole page so the header, the live-status badge, the
 * class list, and the periods-per-week total can never disagree about which
 * year they describe. Email rides the same Better Auth join as the users list
 * (the `users` table holds no email); it is best-effort and simply absent when
 * no linked auth identity exists.
 *
 * Only active classes in active cohorts are returned — archived rows are
 * history, not workload. Classes are sorted grade, then class number, then
 * lesson type, so the page renders them as received.
 *
 * cost: 1 point read of the user + 1 indexed take of the teacher's classes +
 * 1 batched cohort read + 1 indexed meeting read per class + 1 indexed take of
 * the year's cohorts for the year picker. Bounded by one teacher's caseload.
 */
export const getProfile = query({
	args: {
		userId: v.id('users'),
		year: v.string()
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const user = await ctx.db.get(args.userId);
		if (!user) throw new Error('User not found');
		if (staffRole(user.role) === null) throw new Error('Students cannot hold ESL roles');

		const roles = resolveDepartmentRoles(user);

		let email: string | undefined;
		let image: string | null | undefined;
		try {
			const adapter = await authComponent.adapter(ctx)({
				user: { fields: undefined }
			});
			const baUsers = (await adapter.findMany({ model: 'user', where: [] })) as BetterAuthUser[];
			const match = user.authId
				? baUsers.find((u) => u._id === user.authId || u.id === user.authId)
				: undefined;
			email = match?.email;
			image = match?.image;
		} catch (e) {
			console.error('esl.staff.getProfile: BetterAuth user lookup failed', e);
		}

		const assigned = await ctx.db
			.query('esl_classes')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', args.userId))
			.take(200);

		const cohorts = await Promise.all(assigned.map((cls) => ctx.db.get(cls.cohortId)));

		const classes = (
			await Promise.all(
				assigned.map(async (cls, index) => {
					const cohort = cohorts[index];
					if (!cohort || cohort.year !== args.year) return null;
					if (cls.status !== 'active' || cohort.status !== 'active') return null;
					const meetings = (
						await ctx.db
							.query('esl_class_meetings')
							.withIndex('by_classId', (q) => q.eq('classId', cls._id))
							.collect()
					)
						.filter((row) => row.year === args.year)
						.map(({ day, period }) => ({ day: day as EslDay, period }));
					return {
						_id: cls._id,
						name: cls.name,
						type: cls.type,
						room: cls.room ?? null,
						cohortId: cls.cohortId,
						cohortLabel: cohortLabel(cohort),
						cohortGrade: cohort.grade,
						cohortClassNumber: cohort.classNumber,
						meetings
					};
				})
			)
		)
			.filter((row) => row !== null)
			.sort(
				(a, b) =>
					a.cohortGrade - b.cohortGrade ||
					a.cohortClassNumber.localeCompare(b.cohortClassNumber) ||
					a.type.localeCompare(b.type)
			);

		// Every school year on record, newest first, so the page's year picker
		// offers the teacher's years and the department's history alike.
		const allCohorts = await ctx.db
			.query('esl_cohorts')
			.withIndex('by_year')
			.order('desc')
			.take(100);
		const years = [...new Set(allCohorts.map((cohort) => cohort.year))];

		return {
			_id: user._id,
			name: displayStaffName(user.name),
			role: staffRole(user.role) ?? 'teacher',
			status: user.status ?? 'active',
			eslRole: roles.esl ?? null,
			internationalRole: roles.international ?? null,
			email,
			image,
			years,
			classes
		};
	}
});
/**
 * The staff a class teacher may be drawn from.
 *
 * Any active staff member can teach an ESL class, whether or not they hold an
 * ESL assignment, so this deliberately does not filter on `departmentRoles`.
 * Available to ESL staff (not just admins) because a teacher sees the same
 * dropdown on their own roster.
 *
 * cost: 1 bounded users take.
 */
export const listAssignable = query({
	args: {},
	handler: async (ctx) => {
		await requireEslStaff(ctx);

		const users = await ctx.db.query('users').take(200);

		return users
			.filter((u) => staffRole(u.role) !== null && (u.status ?? 'active') === 'active')
			.map((u) => ({ _id: u._id, name: displayStaffName(u.name) }))
			.sort((a, b) => normalizeStaffName(a.name).localeCompare(normalizeStaffName(b.name)));
	}
});

/**
 * Assign (or clear) a user's ESL department role.
 *
 * Only the `esl` slot is touched: the International assignment is rewritten
 * from the value already in effect, so saving an ESL role never silently drops
 * a legacy International fallback. Passing `null` removes the ESL assignment,
 * which is how a teacher leaves the department.
 *
 * cost: 1 point read + 1 patch.
 */
export const setEslRole = mutation({
	args: {
		userId: v.id('users'),
		eslRole: v.union(v.literal('admin'), v.literal('teacher'), v.null())
	},
	handler: async (ctx, args) => {
		const actor = await requireEslAdmin(ctx);

		const user = await ctx.db.get(args.userId);
		if (!user) throw new Error('User not found');
		if (user.role === 'student') throw new Error('Students cannot hold ESL roles');

		const current = resolveDepartmentRoles(user);
		// An admin must not be able to lock themselves (or the department) out:
		// granting the mutation requires ESL admin, so any self-directed change
		// away from the current assignment is a demotion or removal the actor
		// could never undo. Only an exact no-op write is allowed on yourself.
		if (args.userId === actor._id && args.eslRole !== (current.esl ?? null)) {
			throw new Error('You cannot change your own ESL role');
		}

		const international = current.international;
		const next = {
			...(international ? { international } : {}),
			...(args.eslRole ? { esl: args.eslRole } : {})
		};

		await ctx.db.patch(args.userId, {
			departmentRoles: Object.keys(next).length > 0 ? next : undefined
		});

		return { success: true, userId: args.userId, eslRole: args.eslRole };
	}
});
