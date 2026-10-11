import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { requireAdminForSensitiveOperation } from './auth';
import * as seed from './esl/seed';

// Re-export seed functions
export const parseHolidayCsv = seed.parseHolidayCsv;
export const uploadCalendarCsv = seed.uploadCalendarCsv;
export const uploadCalendarCsvAction = seed.uploadCalendarCsvAction;
export const getHolidayCache = seed.getHolidayCache;
export const isOffDay = seed.isOffDay;
export const uploadCalendarCsvHandler = seed.uploadCalendarCsvHandler;
export const getHolidayCacheHandler = seed.getHolidayCacheHandler;
export const isOffDayHandler = seed.isOffDayHandler;
export const uploadCalendarCsvActionHandler = seed.uploadCalendarCsvActionHandler;

/**
 * List all ESL semesters.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const semesters = await ctx.db.query('esl_semesters').collect();
		// Sort by year desc, then term
		semesters.sort((a, b) => {
			if (a.year !== b.year) return b.year.localeCompare(a.year);
			return a.term.localeCompare(b.term);
		});
		return semesters;
	}
});

/**
 * Get a single ESL semester by ID.
 */
export const get = query({
	args: {
		semesterId: v.id('esl_semesters')
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.semesterId);
	}
});

/**
 * Create a new ESL semester (admin only).
 */
export const create = mutation({
	args: {
		year: v.string(),
		term: v.string(),
		startDate: v.string(),
		derivedEnd: v.optional(v.string()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		const id = await ctx.db.insert('esl_semesters', {
			year: args.year,
			term: args.term,
			startDate: args.startDate,
			derivedEnd: args.derivedEnd,
			e2eTag: args.e2eTag
		});

		return id;
	}
});

/**
 * Update an ESL semester (admin only).
 */
export const update = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		year: v.string(),
		term: v.string(),
		startDate: v.string(),
		derivedEnd: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);

		await ctx.db.patch(args.semesterId, {
			year: args.year,
			term: args.term,
			startDate: args.startDate,
			derivedEnd: args.derivedEnd
		});
	}
});

/**
 * Delete an ESL semester (admin only).
 */
export const remove = mutation({
	args: {
		semesterId: v.id('esl_semesters')
	},
	handler: async (ctx, args) => {
		await requireAdminForSensitiveOperation(ctx);
		await ctx.db.delete(args.semesterId);
	}
});
