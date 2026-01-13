/* eslint-disable @typescript-eslint/no-explicit-any */
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';

export const getUserByAuthId = query({
	args: { authId: v.string() },
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.first();
		if (user) {
			return { authId: user.authId, role: user.role, status: user.status };
		}
		return null;
	}
});

export const create = mutation({
	args: {
		studentIds: v.array(v.id('students')),
		value: v.number(),
		category: v.string(),
		subCategory: v.string(),
		details: v.string(),
		semesterId: v.string()
	},
	handler: async (ctx, args) => {
		let authUser;
		try {
			authUser = await authComponent.getAuthUser(ctx);
		} catch {
			throw new Error('Unauthorized');
		}
		const authId = authUser._id;

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) {
			throw new Error('User profile not found. Please contact an administrator.');
		}

		const teacherId = userDoc._id;
		const timestamp = Date.now();
		const evaluationIds: string[] = [];

		for (const studentId of args.studentIds) {
			const evaluationId = await ctx.db.insert('evaluations', {
				studentId,
				teacherId,
				value: args.value,
				category: args.category,
				subCategory: args.subCategory,
				details: args.details,
				timestamp,
				semesterId: args.semesterId
			});

			evaluationIds.push(evaluationId);

			await ctx.db.insert('audit_logs', {
				action: 'create_evaluation',
				performerId: userDoc._id,
				targetTable: 'evaluations',
				targetId: evaluationId.toString(),
				oldValue: null,
				newValue: {
					studentId,
					value: args.value,
					category: args.category
				},
				timestamp
			});
		}

		return evaluationIds;
	}
});

export const remove = mutation({
	args: { id: v.id('evaluations') },
	handler: async (ctx, args) => {
		let authUser;
		try {
			authUser = await authComponent.getAuthUser(ctx);
		} catch {
			throw new Error('Unauthorized');
		}
		const authId = authUser._id;

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) {
			throw new Error('User profile not found');
		}

		const evaluation = await ctx.db.get(args.id);
		if (!evaluation) {
			throw new Error('Evaluation not found');
		}

		await ctx.db.delete(args.id);

		await ctx.db.insert('audit_logs', {
			action: 'delete_evaluation',
			performerId: userDoc._id,
			targetTable: 'evaluations',
			targetId: args.id.toString(),
			oldValue: {
				studentId: evaluation.studentId,
				value: evaluation.value,
				category: evaluation.category
			},
			newValue: null,
			timestamp: Date.now()
		});
	}
});

export const listRecent = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		let authUser;
		try {
			authUser = await authComponent.safeGetAuthUser(ctx);
		} catch {
			return [];
		}
		if (!authUser) return [];

		const authId = authUser._id;

		const userDoc = await ctx.db
			.query('users')
			.withIndex('by_authId', (q) => q.eq('authId', authId))
			.first();

		if (!userDoc) return [];

		const evaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', userDoc._id))
			.order('desc')
			.take(args.limit || 50);

		const results: {
			/* eslint-disable @typescript-eslint/no-explicit-any */
			_id: any;
			studentName: string;
			studentIdCode: string;
			value: number;
			category: string;
			subCategory: string;
			details: string;
			timestamp: number;
		}[] = [];
		for (const eval_ of evaluations) {
			const student = await ctx.db.get(eval_.studentId);
			results.push({
				_id: eval_._id,
				studentName: student
					? `${student.englishName} (${student.chineseName})`
					: 'Unknown Student',
				studentIdCode: student?.studentId || 'N/A',
				value: eval_.value,
				category: eval_.category,
				subCategory: eval_.subCategory,
				details: eval_.details,
				timestamp: eval_.timestamp
			});
		}
		return results;
	}
});
