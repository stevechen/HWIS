import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { verifyJWT } from 'better-auth/crypto';
import { requireAdminRole, requireSuperRole, getAuthenticatedUser } from './auth';
import { extractStudentIdFromEmail, isStudentEmail } from './auth';

export const viewer = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) return null;

		// Check if this is the mock Super Admin from dev mode
		// We use a specific email/role check to avoid DB lookup for the fake user
		const auth = authUser as { email?: string; role?: string };
		if (auth.email === 'super@hwis.test' && auth.role === 'super') {
			return {
				...authUser,
				authId: 'super@hwis.test',
				role: 'super' as const,
				status: 'active' as const
			};
		}

		const authIdLookup =
			(authUser as { authId?: string; id?: string; _id?: string }).authId ||
			(authUser as { id?: string }).id ||
			(authUser as { _id?: string })._id;

		if (!authIdLookup) {
			return null;
		}
		const dbUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authIdLookup))
			.first();

		if (!dbUser) {
			return {
				...authUser,
				authId: undefined,
				role: undefined,
				status: undefined,
				profileExists: false
			};
		}

		// Fetch student record if this is a student user
		let studentRecord = null;
		if (dbUser.role === 'student' && dbUser.studentRecordId) {
			studentRecord = await ctx.db.get(dbUser.studentRecordId);
		}

		return {
			...authUser,
			authId: dbUser.authId,
			role: dbUser.role ?? 'teacher',
			status: dbUser.status ?? 'pending',
			profileExists: true,
			studentRecordId: dbUser.studentRecordId,
			studentId: studentRecord?.studentId,
			enrollmentStatus: studentRecord?.status
		};
	}
});

export const list = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		const typedUser = user as { role?: string; email?: string } | null;
		if (
			!typedUser ||
			(typedUser.role !== 'admin' &&
				typedUser.role !== 'super' &&
				typedUser.email !== 'super@hwis.test')
		) {
			return [];
		}

		const allUsers = await ctx.db.query('users').collect();
		// Filter out students - only show staff (teachers, admins, super)
		return allUsers
			.filter((u) => u.role !== 'student')
			.map((u) => ({
				...u,
				role: u.role ?? 'teacher',
				status: u.status ?? 'active'
			}));
	}
});

// Optimized query to fetch only teachers and admins (for class assignment)
export const getTeachers = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		const typedUser = user as { role?: string; email?: string } | null;
		if (
			!typedUser ||
			(typedUser.role !== 'admin' &&
				typedUser.role !== 'super' &&
				typedUser.email !== 'super@hwis.test')
		) {
			return [];
		}

		const allUsers = await ctx.db.query('users').collect();
		// Filter to only teachers, admins, and super users
		const teachers = allUsers
			.filter((u) => u.role === 'teacher' || u.role === 'admin' || u.role === 'super')
			.map((u) => ({
				...u,
				role: u.role ?? 'teacher',
				status: u.status ?? 'active'
			}))
			.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

		return teachers;
	}
});

export const update = mutation({
	args: {
		id: v.id('users'),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// First fetch the target user to check their current role
		const targetUser = await ctx.db.get(args.id);
		if (!targetUser) throw new Error('User not found');

		// If promoting to super role, require super role
		let currentUser;
		if (args.role === 'super' && targetUser.role !== 'super') {
			currentUser = await requireSuperRole(ctx, args.testToken);
		} else {
			currentUser = await requireAdminRole(ctx, args.testToken);
		}

		const { id, ...updates } = args;
		delete (updates as Record<string, unknown>).testToken;

		const shouldInvalidateSessions = args.status === 'pending' || args.role !== undefined;

		await ctx.db.patch(id, updates);

		if (shouldInvalidateSessions) {
			const sessions = await ctx.db
				.query('sessions')
				.filter((q) => q.eq(q.field('userId'), id))
				.collect();
			for (const session of sessions) {
				await ctx.db.delete(session._id);
			}
		}

		const performerId = currentUser?._id;
		// Skip audit logs for test users (both admin and super test tokens)
		const isTestUser = performerId === 'test-user-id' || performerId === 'test-super-user-id';
		if (performerId && !isTestUser) {
			if (args.role !== undefined && args.role !== targetUser.role) {
				await ctx.db.insert('audit_logs', {
					action: 'update_user_role',
					performerId,
					targetTable: 'users',
					targetId: id.toString(),
					oldValue: { role: targetUser.role },
					newValue: { role: args.role },
					timestamp: Date.now()
				});
			}

			if (args.status !== undefined && args.status !== targetUser.status) {
				await ctx.db.insert('audit_logs', {
					action: 'update_user_status',
					performerId,
					targetTable: 'users',
					targetId: id.toString(),
					oldValue: { status: targetUser.status },
					newValue: { status: args.status },
					timestamp: Date.now()
				});
			}
		}
	}
});

export const seedTestAdmin = mutation({
	args: {
		userId: v.id('users'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const existing = await ctx.db.get(args.userId);
		if (!existing) {
			await ctx.db.insert('users', {
				role: 'admin',
				status: 'active'
			});
		} else {
			await ctx.db.patch(args.userId, {
				role: 'admin',
				status: 'active'
			});
		}
	}
});

export const setUserRole = mutation({
	args: {
		userId: v.id('users'),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// First fetch the target user to check their current role
		const targetUser = await ctx.db.get(args.userId);
		if (!targetUser) throw new Error('User not found');

		// If promoting to super role, require super role
		if (args.role === 'super' && targetUser.role !== 'super') {
			await requireSuperRole(ctx, args.testToken);
		} else {
			await requireAdminRole(ctx, args.testToken);
		}

		await ctx.db.patch(args.userId, {
			role: args.role,
			status: args.status
		});

		const shouldInvalidateSessions = args.status === 'pending' || args.role !== undefined;
		if (shouldInvalidateSessions) {
			const sessions = await ctx.db
				.query('sessions')
				.filter((q) => q.eq(q.field('userId'), args.userId))
				.collect();
			for (const session of sessions) {
				await ctx.db.delete(session._id);
			}
		}
	}
});

export const setRoleByEmail = mutation({
	args: {
		email: v.string(),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// First find the user to check their current role
		const allUsers = await ctx.db.query('users').collect();
		const user = allUsers.find((u) => u.authId === args.email);
		if (!user) {
			throw new Error(`User not found for email: ${args.email}`);
		}

		// If promoting to super role, require super role
		if (args.role === 'super' && user.role !== 'super') {
			await requireSuperRole(ctx, args.testToken);
		} else {
			await requireAdminRole(ctx, args.testToken);
		}

		await ctx.db.patch(user._id, {
			role: args.role,
			status: args.status
		});

		const shouldInvalidateSessions = args.status === 'pending' || args.role !== undefined;
		if (shouldInvalidateSessions) {
			const sessions = await ctx.db
				.query('sessions')
				.filter((q) => q.eq(q.field('userId'), user._id))
				.collect();
			for (const session of sessions) {
				await ctx.db.delete(session._id);
			}
		}

		return { success: true, userId: user._id, role: args.role };
	}
});

export const setRoleByToken = mutation({
	args: {
		token: v.string(),
		role: v.optional(v.union(v.literal('super'), v.literal('admin'), v.literal('teacher'))),
		status: v.optional(v.union(v.literal('pending'), v.literal('active'))),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		try {
			const secret = process.env.BETTER_AUTH_SECRET;
			if (!secret) {
				throw new Error('BETTER_AUTH_SECRET is not configured');
			}

			const decodedToken = decodeURIComponent(args.token);
			const verified = await verifyJWT(decodedToken, secret);
			if (!verified) {
				throw new Error('Invalid or expired token');
			}
			const authId = verified.sub ?? verified.userId ?? verified.email;
			if (!authId) {
				throw new Error('Could not extract user ID from token');
			}

			const allUsers = await ctx.db.query('users').collect();
			const user = allUsers.find((u) => u.authId === authId);

			if (!user) {
				throw new Error(`User not found for authId: ${authId}`);
			}

			// If promoting to super role, require super role
			if (args.role === 'super' && user.role !== 'super') {
				await requireSuperRole(ctx, args.testToken);
			} else {
				await requireAdminRole(ctx, args.testToken);
			}

			await ctx.db.patch(user._id, {
				role: args.role,
				status: args.status
			});

			const shouldInvalidateSessions = args.status === 'pending' || args.role !== undefined;
			if (shouldInvalidateSessions) {
				const sessions = await ctx.db
					.query('sessions')
					.filter((q) => q.eq(q.field('userId'), user._id))
					.collect();
				for (const session of sessions) {
					await ctx.db.delete(session._id);
				}
			}

			return { success: true, userId: user._id, role: args.role, authId };
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : 'Unknown error';
			throw new Error(`Failed to set role: ${errorMessage}`);
		}
	}
});

// Set up a student user by linking to their student record
// This is called after a student logs in for the first time
export const setupStudentUser = mutation({
	args: {
		authId: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Verify this is a student email
		if (!isStudentEmail(args.email)) {
			return {
				success: false,
				error: 'Not a student email'
			};
		}

		// Extract studentId from email
		const studentId = extractStudentIdFromEmail(args.email);
		if (!studentId) {
			return {
				success: false,
				error: 'Invalid student email format'
			};
		}

		// Check if student record exists
		const studentRecord = await ctx.db
			.query('students')
			.withIndex('by_studentId', (q) => q.eq('studentId', studentId))
			.first();

		if (!studentRecord) {
			return {
				success: false,
				error: 'STUDENT_NOT_FOUND',
				message: 'This email is not registered in the system. Please contact administration.'
			};
		}

		// Check if user already exists
		const existingUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();

		if (existingUser) {
			// Update existing user with student link if needed
			if (!existingUser.studentRecordId) {
				await ctx.db.patch(existingUser._id, {
					role: 'student',
					status: 'active',
					studentRecordId: studentRecord._id,
					name: args.name || existingUser.name
				});
			}
			return {
				success: true,
				userId: existingUser._id,
				studentRecordId: studentRecord._id,
				enrollmentStatus: studentRecord.status
			};
		}

		// Create new student user
		const userId = await ctx.db.insert('users', {
			authId: args.authId,
			role: 'student',
			status: 'active',
			studentRecordId: studentRecord._id,
			name: args.name
		});

		return {
			success: true,
			userId,
			studentRecordId: studentRecord._id,
			enrollmentStatus: studentRecord.status
		};
	}
});
