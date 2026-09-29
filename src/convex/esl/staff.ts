import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { resolveDepartmentRoles, type DepartmentRole } from '../shared/authorization';
import { displayStaffName, normalizeStaffName } from '../shared/staff_name';

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

		// An admin must not be able to lock the department out of itself.
		if (args.userId === actor._id && args.eslRole === null) {
			throw new Error('You cannot remove your own ESL admin role');
		}

		const current = resolveDepartmentRoles(user);
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
