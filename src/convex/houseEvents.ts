import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminRole, getAuthenticatedUser } from './auth';

const HOUSE_POINTS_SCHEMA = v.object({
	Heracles: v.optional(v.number()),
	Wukong: v.optional(v.number()),
	Ixbalam: v.optional(v.number()),
	Setna: v.optional(v.number())
});

export const list = query({
	args: {
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return [];

		const events = await ctx.db
			.query('house_events')
			.withIndex('by_startDate', (q) => q)
			.collect();

		return events.sort((a, b) => a.startDate - b.startDate);
	}
});

export const getById = query({
	args: {
		id: v.id('house_events'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await getAuthenticatedUser(ctx, args.testToken);
		if (!user) return null;

		const event = await ctx.db.get(args.id);
		return event ?? null;
	}
});

export const create = mutation({
	args: {
		title: v.string(),
		startDate: v.number(),
		endDate: v.number(),
		housePoints: v.optional(HOUSE_POINTS_SCHEMA),
		e2eTag: v.optional(v.string()),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		if (args.endDate < args.startDate) {
			throw new Error('End date must be on or after the start date');
		}

		const id = await ctx.db.insert('house_events', {
			title: args.title,
			startDate: args.startDate,
			endDate: args.endDate,
			housePoints: args.housePoints ?? undefined,
			e2eTag: args.e2eTag
		});

		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('house_events'),
		title: v.optional(v.string()),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		housePoints: v.optional(HOUSE_POINTS_SCHEMA),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const event = await ctx.db.get(args.id);
		if (!event) throw new Error('Event not found');

		const newStartDate = args.startDate ?? event.startDate;
		const newEndDate = args.endDate ?? event.endDate;

		if (newEndDate < newStartDate) {
			throw new Error('End date must be on or after the start date');
		}

		await ctx.db.patch(args.id, {
			...(args.title !== undefined && { title: args.title }),
			...(args.startDate !== undefined && { startDate: args.startDate }),
			...(args.endDate !== undefined && { endDate: args.endDate }),
			...(args.housePoints !== undefined && { housePoints: args.housePoints })
		});
	}
});

export const remove = mutation({
	args: {
		id: v.id('house_events'),
		testToken: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminRole(ctx, args.testToken);

		const event = await ctx.db.get(args.id);
		if (!event) throw new Error('Event not found');

		const hasPoints =
			event.housePoints != null &&
			Object.values(event.housePoints).some((v) => v !== undefined && v !== 0);

		if (hasPoints) {
			console.warn(
				`[houseEvents] Deleting event "${event.title}" (${event._id}) that has house points data.`
			);
		}

		await ctx.db.delete(args.id);
	}
});
