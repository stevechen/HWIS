import { mutation } from './_generated/server';
import { v } from 'convex/values';
import {
	getAuthenticatedUser,
	requireUserProfile,
	getAllowlistedRole,
	isAuthorizedEmail,
	authComponent,
	requireAdminForSensitiveOperation
} from './auth';
import { isStudentEmailAddress } from './shared/student';
import { isAdmin } from './shared/authorization';
import { normalizeStaffName } from './shared/staff_name';

type BetterAuthUser = {
	email?: string;
};

/** Map a global role to an ESL department role. Super users map to admin. */
function mapRoleToEsl(role: 'super' | 'admin' | 'teacher'): 'admin' | 'teacher' {
	return role === 'teacher' ? 'teacher' : 'admin';
}

/** Map a global role to an International department role. Super users map to admin. */
function mapRoleToInternational(role: 'super' | 'admin' | 'teacher'): 'admin' | 'teacher' {
	return role === 'super' ? 'admin' : role;
}

export const ensureUserProfile = mutation({
	args: {},
	handler: async (ctx) => {
		const authUser = await getAuthenticatedUser(ctx);

		if (!authUser) {
			throw new Error('Not authenticated');
		}

		const authId = authUser.authId || (typeof authUser._id === 'string' ? authUser._id : undefined);
		if (!authId) {
			throw new Error('Missing authId');
		}

		// Get email directly from Better Auth (not from profile, which doesn't have email field)
		const betterAuthUser = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
		const userEmail = betterAuthUser?.email?.toLowerCase();

		// Students never get a user profile — their identity is email-derived.
		if (isStudentEmailAddress(userEmail)) {
			return { created: false, role: 'student' as const, status: 'active' as const };
		}

		// Only HWIS staff domains and the exception allowlist may own a profile.
		if (!isAuthorizedEmail(userEmail)) {
			throw new Error('Forbidden: HWIS staff account required');
		}

		const allowlistedRole = getAllowlistedRole(userEmail);

		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		const role = allowlistedRole ?? 'teacher';
		const status = allowlistedRole ? 'active' : (existing?.status ?? 'pending');
		const eslRole = mapRoleToEsl(role);
		const internationalRole = mapRoleToInternational(role);

		const departmentRoles = {
			international: internationalRole,
			esl: eslRole
		};

		if (existing) {
			// Self-heal privileged owner users that may have been created as pending previously.
			await ctx.db.patch(existing._id, {
				name: normalizeStaffName(authUser.name),
				role,
				status,
				departmentRoles
			});
			return {
				created: false,
				role,
				status,
				eslRole
			};
		}

		await ctx.db.insert('users', {
			authId: authId,
			name: normalizeStaffName(authUser.name),
			role,
			status,
			departmentRoles,
			createdAt: Date.now()
		});
		return { created: true, role, status, eslRole };
	}
});

/**
 * Ensures the authenticated user has an ESL department role.
 * Call this from ESL pages when the user might have an old profile
 * missing the `departmentRoles.esl` field.
 */
export const ensureEslDepartmentRole = mutation({
	args: {},
	handler: async (ctx) => {
		const authUser = await getAuthenticatedUser(ctx);

		if (!authUser) {
			throw new Error('Not authenticated');
		}

		const authId = authUser.authId || (typeof authUser._id === 'string' ? authUser._id : undefined);
		if (!authId) {
			throw new Error('Missing authId');
		}

		// Get email directly from Better Auth (not from profile, which doesn't have email field)
		const betterAuthUser = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
		const userEmail = betterAuthUser?.email?.toLowerCase();

		// Students don't need ESL department roles
		if (isStudentEmailAddress(userEmail)) {
			return { updated: false, reason: 'student' };
		}

		const allowlistedRole = getAllowlistedRole(userEmail);
		const role = allowlistedRole ?? 'teacher';
		const eslRole = mapRoleToEsl(role);
		const internationalRole = mapRoleToInternational(role);

		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!existing) {
			// No profile yet - ensureUserProfile will create it
			return { updated: false, reason: 'no_profile' };
		}

		// Check if ESL department role is already set correctly
		const currentRoles = existing.departmentRoles ?? {};
		const currentEslRole = currentRoles.esl;

		if (currentEslRole === eslRole && currentRoles.international === internationalRole) {
			return { updated: false, reason: 'already_correct', eslRole: currentEslRole };
		}

		// Update the department roles
		await ctx.db.patch(existing._id, {
			departmentRoles: {
				international: internationalRole,
				esl: eslRole
			}
		});

		return { updated: true, eslRole, previousEslRole: currentEslRole ?? null };
	}
});

export const setMyRole = mutation({
	args: {
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active')))
	},
	handler: async (ctx, args) => {
		const userDoc = await requireUserProfile(ctx);
		const desiredRole = args.role ?? userDoc.role;
		const desiredStatus = args.status ?? userDoc.status;

		const allUsers = await ctx.db.query('users').collect();
		const hasPrivilegedUser = allUsers.some((user) => isAdmin(user));

		if (!hasPrivilegedUser) {
			const betterAuthUser = (await authComponent.getAuthUser(ctx)) as BetterAuthUser | null;
			const userEmail = betterAuthUser?.email?.toLowerCase();
			const allowlistedRole = getAllowlistedRole(userEmail);
			if (!allowlistedRole) {
				throw new Error('Bootstrap is restricted to allowlisted owner emails.');
			}
			if (desiredRole !== 'admin' && desiredRole !== 'super') {
				throw new Error('Initial bootstrap role must be admin or super.');
			}
			if (allowlistedRole === 'teacher') {
				throw new Error('This allowlisted user cannot bootstrap privileged roles.');
			}
			if (allowlistedRole === 'admin' && desiredRole === 'super') {
				throw new Error('This allowlisted user can bootstrap admin but not super.');
			}

			await ctx.db.patch(userDoc._id, {
				role: desiredRole,
				status: desiredStatus
			});
			return { created: false, bootstrap: true };
		}

		await requireAdminForSensitiveOperation(ctx);

		await ctx.db.patch(userDoc._id, {
			role: desiredRole,
			status: desiredStatus
		});
		return { created: false };
	}
});

export const createUserProfile = mutation({
	args: {
		authId: v.string(),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active')))
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();

		if (!existing) {
			await ctx.db.insert('users', {
				authId: args.authId,
				role: args.role ?? 'teacher',
				status: args.status ?? 'active',
				createdAt: Date.now()
			});
			return { created: true };
		}
		await ctx.db.patch(existing._id, {
			role: args.role,
			status: args.status
		});
		return { created: false };
	}
});

export const deleteAllUserProfiles = mutation({
	args: {},
	handler: async (ctx) => {
		await requireAdminForSensitiveOperation(ctx);
		const allUsers = await ctx.db.query('users').collect();
		for (const user of allUsers) {
			await ctx.db.delete(user._id);
		}
		return { deleted: allUsers.length };
	}
});

export const updateUserName = mutation({
	args: {
		authId: v.string(),
		name: v.string()
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		const existing = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();

		if (!existing) {
			await ctx.db.insert('users', {
				authId: args.authId,
				name: normalizeStaffName(args.name),
				role: 'teacher',
				status: 'active',
				createdAt: Date.now()
			});
			return { created: true };
		}

		await ctx.db.patch(existing._id, {
			name: normalizeStaffName(args.name)
		});
		return { created: false };
	}
});
