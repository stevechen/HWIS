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
		categoryName: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return 0;
		const matches = await ctx.db
			.query('evaluations')
			.withIndex('by_category', (q) => q.eq('category', args.categoryName))
			.collect();
		return matches.length;
	}
});

export const getSubCategoryEvaluationCount = query({
	args: {
		categoryName: v.string(),
		subCategory: v.string(),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return 0;
		const matches = await ctx.db
			.query('evaluations')
			.withIndex('by_category_subCategory', (q) =>
				q.eq('category', args.categoryName).eq('subCategory', args.subCategory)
			)
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
			{ name: 'Creativity', subCategories: ['Leadership', 'Designing & Creating'] },
			{ name: 'Activity', subCategories: ['Sports', 'Club Participation'] },
			{ name: 'Service', subCategories: ['Volunteering', 'School Service'] },
			{ name: 'Academic', subCategories: ['Homework', 'Participation'] },
			{ name: "Parents' Day", subCategories: [] },
			{ name: 'Other Issues', subCategories: [] }
		];

		for (const cat of categories) {
			await ctx.db.insert('point_categories', cat);
		}
	}
});

export const create = mutation({
	args: {
		name: v.string(),
		subCategories: v.array(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const id = await ctx.db.insert('point_categories', {
			name: args.name,
			subCategories: args.subCategories
		});
		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('point_categories'),
		name: v.string(),
		subCategories: v.array(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);
		await ctx.db.patch(args.id, {
			name: args.name,
			subCategories: args.subCategories
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

		const relatedEvaluations = await ctx.db
			.query('evaluations')
			.withIndex('by_category', (q) => q.eq('category', category.name))
			.collect();

		for (const eval_ of relatedEvaluations) {
			await ctx.db.delete(eval_._id);
		}

		await ctx.db.delete(args.id);
	}
});
