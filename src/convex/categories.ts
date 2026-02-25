import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminRole, getAuthenticatedUser } from './auth';

export const list = query({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return [];
		return await ctx.db.query('point_categories').collect();
	}
});

export const getEvaluationCount = query({
	args: {
		categoryId: v.id('point_categories'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return 0;
		const matches = await ctx.db
			.query('evaluations')
			.withIndex('by_categoryId', (q) => q.eq('categoryId', args.categoryId))
			.collect();
		return matches.length;
	}
});

export const seed = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const existing = await ctx.db.query('point_categories').collect();
		if (existing.length > 0) {
			return;
		}

		const categories = [
			{ name: 'Responsibility' },
			{ name: 'Excellence' },
			{ name: 'Service' },
			{ name: 'Persistence' },
			{ name: 'Enthusiasm' },
			{ name: 'Collaboration' },
			{ name: 'Timeliness' }
		];

		for (const cat of categories) {
			await ctx.db.insert('point_categories', cat);
		}
	}
});

export const create = mutation({
	args: {
		name: v.string(),
		testToken: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const data: {
			name: string;
			e2eTag?: string;
		} = {
			name: args.name
		};

		if (args.e2eTag) {
			data.e2eTag = args.e2eTag;
		}

		const id = await ctx.db.insert('point_categories', data);
		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('point_categories'),
		name: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		await ctx.db.patch(args.id, {
			name: args.name
		});
	}
});

export const remove = mutation({
	args: {
		id: v.id('point_categories'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		const category = await ctx.db.get(args.id);
		if (!category) throw new Error('Category not found');

		// Cascade delete all evaluations with this categoryId
		const relatedEvaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_categoryId', (q) => q.eq('categoryId', args.id))
			.collect();

		for (const eval_ of relatedEvaluations) {
			await ctx.db.delete(eval_._id);
		}

		await ctx.db.delete(args.id);

		return { deletedEvaluationCount: relatedEvaluations.length };
	}
});
