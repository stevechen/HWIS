import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';

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
	_id: any;
	englishName: string;
	chineseName: string;
	studentId: string;
	grade: number;
}

interface Evaluation {
	_id: any;
	details: string;
	category: string;
	subCategory: string;
	value: number;
}

export const list = query({
	args: {
		limit: v.optional(v.number()),
		action: v.optional(v.string()),
		performerId: v.optional(v.id('users'))
	},
	handler: async (ctx, args) => {
		let authUser;
		try {
			authUser = await authComponent.safeGetAuthUser(ctx);
		} catch (e) {
			return [];
		}
		if (!authUser) return [];

		const authId = authUser._id;

		const dbUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!dbUser) return [];
		const role = (dbUser as any)?.role;
		if (role !== 'admin' && role !== 'super') return [];

		let logs = await ctx.db.query('audit_logs').withIndex('by_timestamp').order('desc').take(100);

		if (args.action) {
			logs = logs.filter((l: any) => l.action === args.action);
		}

		if (args.performerId) {
			logs = logs.filter((l: any) => l.performerId === args.performerId);
		}

		const results: any[] = [];
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
					const student = (await ctx.db.get(evalStudentId as any)) as Student | null;
					if (student) {
						studentName = `${student.englishName} (${student.chineseName})`;
						studentGrade = student.grade;
						studentId = student.studentId;
					}
				}
				if (log.targetId) {
					const evaluation = (await ctx.db.get(log.targetId as any)) as Evaluation | null;
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

			results.push({
				...log,
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

export const seed = mutation({
	args: {},
	handler: async (ctx) => {
		const authUser = (await authComponent.getAuthUser(ctx)) as any;
		const authId = authUser._id;

		const dbUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		const role = (dbUser as any)?.role;

		if (role !== 'super') {
			throw new Error('Unauthorized');
		}

		await ctx.db.insert('audit_logs', {
			action: 'seed_data',
			performerId: dbUser!._id,
			targetTable: 'system',
			targetId: 'seed',
			oldValue: null,
			newValue: { description: 'Database seeded' },
			timestamp: Date.now()
		});
	}
});
