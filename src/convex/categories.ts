import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query('point_categories').collect();
	}
});

export const getEvaluationCount = query({
	args: { categoryName: v.string() },
	handler: async (ctx, args) => {
		const allEvaluations = await ctx.db.query('evaluations').collect();
		let count = 0;
		for (const e of allEvaluations) {
			if (e.category === args.categoryName) {
				count++;
			}
		}
		return count;
	}
});

export const getSubCategoryEvaluationCount = query({
	args: { categoryName: v.string(), subCategory: v.string() },
	handler: async (ctx, args) => {
		const allEvaluations = await ctx.db.query('evaluations').collect();
		let count = 0;
		for (const e of allEvaluations) {
			if (e.category === args.categoryName && e.subCategory === args.subCategory) {
				count++;
			}
		}
		return count;
	}
});

export const seed = mutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db.query('point_categories').collect();
		if (existing.length > 0) return;

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
		subCategories: v.array(v.string())
	},
	handler: async (ctx, args) => {
		return await ctx.db.insert('point_categories', {
			name: args.name,
			subCategories: args.subCategories
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('point_categories'),
		name: v.string(),
		subCategories: v.array(v.string())
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			name: args.name,
			subCategories: args.subCategories
		});
	}
});

export const remove = mutation({
	args: {
		id: v.id('point_categories')
	},
	handler: async (ctx, args) => {
		const category = await ctx.db.get(args.id);
		if (!category) throw new Error('Category not found');

		const allEvaluations = await ctx.db.query('evaluations').collect();
		const relatedEvaluations = allEvaluations.filter((e) => e.category === category.name);

		for (const eval_ of relatedEvaluations) {
			await ctx.db.delete(eval_._id);
		}

		await ctx.db.delete(args.id);
	}
});
