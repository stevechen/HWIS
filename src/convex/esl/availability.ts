import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { ESL_PERIODS } from '../shared/esl';

/** The day validator, mirroring every meeting-shaped argument (Mon–Fri). */
const dayValidator = v.union(
	v.literal('Monday'),
	v.literal('Tuesday'),
	v.literal('Wednesday'),
	v.literal('Thursday'),
	v.literal('Friday')
);

/** One blocked slot as the dialog stages it. */
const blockValidator = v.object({
	day: dayValidator,
	period: v.number(),
	note: v.optional(v.string())
});

/**
 * Every teacher's blocked slots in a school year, for the Classes page.
 *
 * Read as a whole year rather than per teacher because the page needs the
 * blocks for whichever teachers its cards show — a subscription per teacher
 * would be one per card — and the rows are sparse: a handful of teachers
 * blocking a handful of slots. The dialog and the schedule picker's gate both
 * read from this one payload, so the blocked slots a save is judged against
 * are the ones the dialog displays.
 *
 * cost: 1 indexed take of `by_year`. Free-Quota Impact: one year's blocks
 * (tens of rows), not the table.
 */
export const listByYear = query({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		return await ctx.db
			.query('esl_teacher_availability')
			.withIndex('by_year', (q) => q.eq('year', args.year))
			.collect();
	}
});

/**
 * Replace one teacher's blocked slots for a whole year — the dialog's staged
 * Save.
 *
 * Replace-all rather than per-slot writes because the editor stages a complete
 * set: the admin toggles cells, then commits. A diff would have to send
 * deletes for rows it read, which a second admin editing the same teacher
 * between read and write would invalidate — the rows to delete would no longer
 * be the ones that exist. One delete pass plus one insert pass in one
 * transaction states the year's blocks unambiguously.
 *
 * `e2eTag` is passed only by end-to-end runs, on the same tag pattern as every
 * other ESL table, so teardown stays one indexed read.
 *
 * cost: 1 point read of the teacher, 1 indexed take of the old rows, then one
 * delete per old row and one insert per new block.
 */
export const setBlocks = mutation({
	args: {
		teacherId: v.id('users'),
		year: v.string(),
		blocks: v.array(blockValidator),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const teacher = await ctx.db.get(args.teacherId);
		if (!teacher) throw new Error('Teacher not found');

		// Both guards name the offending slot: the admin is looking at a grid of
		// them, and "invalid input" would send them back to find a typo by eye.
		const seen = new Set<string>();
		for (const block of args.blocks) {
			if (!ESL_PERIODS.some((slot) => slot.period === block.period)) {
				throw new Error(`Period ${block.period} is not on the school timetable.`);
			}
			const key = `${block.day} P${block.period}`;
			if (seen.has(key)) {
				throw new Error(`${key} is blocked twice; each slot may be blocked once.`);
			}
			seen.add(key);
		}

		const previous = await ctx.db
			.query('esl_teacher_availability')
			.withIndex('by_teacher_year', (q) => q.eq('teacherId', args.teacherId).eq('year', args.year))
			.collect();
		for (const row of previous) {
			await ctx.db.delete(row._id);
		}

		for (const block of args.blocks) {
			// Trimmed, and a blank dropped rather than stored: the note is shown in
			// the picker as "The teacher is not available: <note>", and an empty one
			// there would read as a sentence trailing off.
			const note = block.note?.trim();
			await ctx.db.insert('esl_teacher_availability', {
				teacherId: args.teacherId,
				year: args.year,
				day: block.day,
				period: block.period,
				...(note === undefined || note === '' ? {} : { note }),
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
		}

		return { success: true, teacherId: args.teacherId, count: args.blocks.length };
	}
});
