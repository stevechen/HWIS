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
			{
				name: 'Responsibility',
				casAlignment: ['Service'],
				meritCriteria: [
					'Takes responsibility for actions and commitments',
					'Follows school rules and procedures',
					'Corrects mistakes independently'
				],
				demeritCriteria: [
					'Repeated rule violations',
					'Avoids responsibility or shifts blame',
					'Neglects assigned duties'
				]
			},
			{
				name: 'Excellence',
				casAlignment: ['Creativity', 'Activity'],
				meritCriteria: [
					'Exceeds expected standards',
					'Demonstrates initiative or leadership',
					'Produces high-quality work or performance'
				],
				demeritCriteria: [
					'Careless or low-effort work',
					'Does not meet expected standards',
					'Repeated lack of quality or commitment'
				]
			},
			{
				name: 'Service',
				casAlignment: ['Service'],
				meritCriteria: [
					'Voluntarily helps peers or staff',
					'Contributes positively to the school community',
					'Participates actively in service activities'
				],
				demeritCriteria: [
					'Refuses to support expected service tasks',
					'Disrupts or undermines service activities',
					'Shows disrespect during service involvement'
				]
			},
			{
				name: 'Persistence',
				casAlignment: ['Activity', 'Creativity'],
				meritCriteria: [
					'Perseveres through challenges',
					'Completes tasks despite difficulty',
					'Demonstrates resilience and effort'
				],
				demeritCriteria: [
					'Gives up easily',
					'Avoids challenges',
					'Leaves tasks unfinished without valid reason'
				]
			},
			{
				name: 'Enthusiasm',
				casAlignment: ['Creativity', 'Activity'],
				meritCriteria: [
					'Actively engages in learning or activities',
					'Shows positive attitude and motivation',
					'Encourages peers through participation'
				],
				demeritCriteria: [
					'Displays negative or disengaged attitude',
					'Refuses to participate',
					'Consistently disengaged'
				]
			},
			{
				name: 'Collaboration',
				casAlignment: ['Service', 'Creativity'],
				meritCriteria: [
					'Works respectfully in teams',
					'Communicates effectively',
					'Contributes fairly to group work'
				],
				demeritCriteria: [
					'Disrupts group work',
					'Refuses to cooperate',
					'Excludes or dominates others'
				]
			},
			{
				name: 'Timeliness',
				casAlignment: ['Service'],
				meritCriteria: [
					'Punctual and prepared',
					'Meets deadlines consistently',
					'Manages time responsibly'
				],
				demeritCriteria: [
					'Repeated lateness',
					'Missed deadlines without valid reason',
					'Unprepared for class or activities'
				]
			}
		];

		for (const cat of categories) {
			await ctx.db.insert(
				'point_categories',
				cat as {
					name: string;
					casAlignment: ('Creativity' | 'Activity' | 'Service')[];
					meritCriteria: string[];
					demeritCriteria: string[];
				}
			);
		}
	}
});

export const create = mutation({
	args: {
		name: v.string(),
		meritCriteria: v.optional(v.array(v.string())),
		demeritCriteria: v.optional(v.array(v.string())),
		casAlignment: v.optional(
			v.array(v.union(v.literal('Creativity'), v.literal('Activity'), v.literal('Service')))
		),
		testToken: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const data: {
			name: string;
			meritCriteria?: string[];
			demeritCriteria?: string[];
			casAlignment?: ('Creativity' | 'Activity' | 'Service')[];
			e2eTag?: string;
		} = {
			name: args.name
		};

		if (args.meritCriteria) {
			data.meritCriteria = args.meritCriteria;
		}
		if (args.demeritCriteria) {
			data.demeritCriteria = args.demeritCriteria;
		}
		if (args.casAlignment && args.casAlignment.length > 0) {
			data.casAlignment = args.casAlignment;
		}
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
		meritCriteria: v.optional(v.array(v.string())),
		demeritCriteria: v.optional(v.array(v.string())),
		casAlignment: v.optional(
			v.array(v.union(v.literal('Creativity'), v.literal('Activity'), v.literal('Service')))
		),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const patchData: {
			name: string;
			meritCriteria?: string[];
			demeritCriteria?: string[];
			casAlignment?: ('Creativity' | 'Activity' | 'Service')[];
		} = {
			name: args.name
		};

		if (args.meritCriteria !== undefined) {
			patchData.meritCriteria = args.meritCriteria;
		}
		if (args.demeritCriteria !== undefined) {
			patchData.demeritCriteria = args.demeritCriteria;
		}
		if (args.casAlignment !== undefined) {
			patchData.casAlignment = args.casAlignment;
		}

		await ctx.db.patch(args.id, patchData);
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

// Migration: Convert old string casAlignment to array format
export const migrateCasAlignment = mutation({
	args: { testToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const categories = await ctx.db.query('point_categories').collect();
		const migrated: string[] = [];

		for (const category of categories) {
			// Check if casAlignment exists and is a string (old format)
			const casAlignment = (category as unknown as { casAlignment?: string | string[] })
				.casAlignment;
			if (casAlignment && typeof casAlignment === 'string') {
				// Parse the old string format into array
				const alignments: ('Creativity' | 'Activity' | 'Service')[] = [];

				// Handle formats like "Service" or "Creativity / Activity" or "Service / Creativity"
				const parts = casAlignment.split('/').map((p) => p.trim());
				for (const part of parts) {
					if (part === 'Creativity' || part === 'Activity' || part === 'Service') {
						alignments.push(part);
					}
				}

				if (alignments.length > 0) {
					await ctx.db.patch(category._id, { casAlignment: alignments });
					migrated.push(category.name);
				}
			}
		}

		return { migratedCount: migrated.length, migratedCategories: migrated };
	}
});
