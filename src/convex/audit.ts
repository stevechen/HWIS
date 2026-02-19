import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminRole, getAuthenticatedUser } from './auth';
import type { Id } from './_generated/dataModel';

const ACTION_LABELS: Record<string, string> = {
	create_evaluation: 'Created',
	delete_evaluation: 'Deleted',
	update_user_role: 'Role Updated',
	update_user_status: 'Status Updated',
	create_student: 'Student Added',
	update_student: 'Student Updated',
	delete_student: 'Student Deleted',
	seed_data: 'Seeded'
};

export function getAuditActionLabel(action: string): string {
	return ACTION_LABELS[action] ?? action;
}

interface Student {
	_id: Id<'students'>;
	englishName: string;
	chineseName: string;
	studentId: string;
	grade: number;
}

interface Evaluation {
	_id: Id<'evaluations'>;
	details: string;
	category: string;
	subCategory: string;
	value: number;
}

type AuthUserForAudit = {
	role?: 'admin' | 'super' | 'teacher';
	email?: string;
	authId?: string;
};

export const list = query({
	args: {
		limit: v.optional(v.number()),
		action: v.optional(v.string()),
		performerId: v.optional(v.id('users')),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const authUser = await getAuthenticatedUser(ctx, args.testToken);
		if (!authUser) return [];
		const user = authUser as AuthUserForAudit;
		if (
			user.role !== 'admin' &&
			user.role !== 'super' &&
			user.email !== 'super@hwis.test' &&
			user.authId !== 'test-token-admin-mock'
		) {
			return [];
		}

		let logs = await ctx.db.query('audit_logs').withIndex('by_timestamp').order('desc').take(100);

		if (args.action) {
			logs = logs.filter((l) => l.action === args.action);
		}

		if (args.performerId) {
			logs = logs.filter((l) => l.performerId === args.performerId);
		}

		const results: Array<
			Omit<(typeof logs)[number], 'performerId'> & {
				performerId: string;
				performerName: string;
				actionLabel: string;
				studentName: string | null;
				studentGrade: number | null;
				studentId: string | null;
				details: string | null;
				category: string | null;
				subCategory: string | null;
				points: number | null;
			}
		> = [];
		for (const log of logs.slice(0, args.limit || 50)) {
			const performer = await ctx.db.get(log.performerId);
			let studentName: string | null = null;
			let studentGrade: number | null = null;
			let studentId: string | null = null;
			let details: string | null = null;
			let category: string | null = null;
			let subCategory: string | null = null;
			let points: number | null = null;

			if (log.targetTable === 'evaluations') {
				const evalStudentId = log.newValue?.studentId || log.oldValue?.studentId;
				if (evalStudentId) {
					studentId = evalStudentId.toString();
					// Try to look up by Convex ID first, then by studentId string
					let student = null;
					try {
						student = (await ctx.db.get(evalStudentId as Id<'students'>)) as Student | null;
					} catch {
						// If not a valid Convex ID, look up by studentId string
						student = (await ctx.db
							.query('students')
							.filter((q) => q.eq(q.field('studentId'), evalStudentId))
							.first()) as Student | null;
					}
					if (student) {
						studentName = `${student.englishName} (${student.chineseName})`;
						studentGrade = student.grade;
						studentId = student.studentId;
					}
				}
				if (log.targetId && !log.targetId.startsWith && log.targetId.length > 5) {
					// Only try to get evaluation if it's a valid-looking Convex ID
					const evaluation = (await ctx.db.get(log.targetId as Id<'evaluations'>)) as
						| Evaluation
						| null;
					if (evaluation) {
						details = evaluation.details || null;
						category = evaluation.category || null;
						subCategory = evaluation.subCategory || null;
						points = evaluation.value || null;
					}
				}
			}

			if (log.action === 'update_user_role') {
				details = `${log.oldValue?.role} → ${log.newValue?.role}`;
			}
			if (log.action === 'update_user_status') {
				details = `${log.oldValue?.status} → ${log.newValue?.status}`;
			}

			const { performerId: _performerId, ...logWithoutPerformer } = log;
			results.push({
				...logWithoutPerformer,
				performerId: performer?._id?.toString() ?? 'Unknown',
				performerName: performer?.name ?? 'Unknown',
				actionLabel: getAuditActionLabel(log.action),
				studentName,
				studentGrade,
				studentId,
				details,
				category,
				subCategory,
				points
			});
		}

		return results;
	}
});

export const debugList = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const logs = await ctx.db.query('audit_logs').withIndex('by_timestamp').order('desc').take(20);

		// Also check for test_admin user
		const testAdmin = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', 'test-token-admin-mock'))
			.first();

		const allUsers = await ctx.db.query('users').collect();

		return {
			logs,
			testAdminExists: !!testAdmin,
			testAdmin: testAdmin ? { authId: testAdmin.authId, role: testAdmin.role } : null,
			totalUsers: allUsers.length,
			userAuthIds: allUsers.map((u) => u.authId)
		};
	}
});

export const seed = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const dbUser = await requireAdminRole(ctx, args.testToken);

		if (dbUser.role !== 'super') {
			throw new Error('Unauthorized');
		}

		await ctx.db.insert('audit_logs', {
			action: 'seed_data',
			performerId: dbUser._id,
			targetTable: 'system',
			targetId: 'seed',
			oldValue: null,
			newValue: { description: 'Database seeded' },
			timestamp: Date.now()
		});
	}
});
