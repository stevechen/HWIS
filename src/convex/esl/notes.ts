import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { requireUserProfile } from '../auth';
import { isValidEslDate } from '../shared/esl';

/**
 * A teacher's private per-meeting notes (ticket #196, model #187): free text
 * keyed by `(classId, date)`, last-write-wins, no history, no edit cutoff.
 * Calendar-only surface — the list view never reads this table.
 *
 * The gate is strictly the assigned teacher (`teacherId == viewer`). ESL
 * admins, covering teachers, and super users without the assignment are all
 * refused with no override path, which is why every function below funnels
 * through `requireAssignedTeacher` instead of `requireEslStaff`.
 *
 * cost: every read is one indexed take on `by_class_teacher_date` /
 * `by_teacher`; writes are one indexed lookup + one insert/patch/delete.
 * Free-Quota Impact: one teacher's notes on one class, never the table.
 */
const MAX_NOTE_LENGTH = 2000;

type NotesCtx = QueryCtx | MutationCtx;

/**
 * The viewer, when they teach this class. Refuses anyone else — including
 * staff and admins — so notes stay visible only to their owner.
 */
async function requireAssignedTeacher(ctx: NotesCtx, classId: Id<'esl_classes'>) {
	const viewer = await requireUserProfile(ctx);
	const classRecord = await ctx.db.get(classId);
	if (!classRecord) throw new Error('Class not found');
	if (classRecord.teacherId !== viewer._id) {
		throw new Error('Forbidden: only the assigned teacher reads these notes.');
	}
	return { viewer, classRecord };
}

function assertValidNoteDate(date: string) {
	if (!isValidEslDate(date)) {
		throw new Error(`${date} is not a valid date. Use YYYY-MM-DD.`);
	}
}

/**
 * The teacher's note for one meeting date, or null when nothing is written.
 * An absent row and a cleared box read identically, so the calendar's note
 * boxes degrade to empty while the query loads or when untouched.
 */
export const get = query({
	args: {
		classId: v.id('esl_classes'),
		date: v.string()
	},
	handler: async (ctx, args) => {
		const { viewer } = await requireAssignedTeacher(ctx, args.classId);
		assertValidNoteDate(args.date);
		const note = await ctx.db
			.query('teacher_notes')
			.withIndex('by_class_teacher_date', (q) =>
				q.eq('classId', args.classId).eq('teacherId', viewer._id).eq('date', args.date)
			)
			.first();
		return note ? note.text : null;
	}
});

/**
 * Every note the viewer wrote on one class, oldest date first. The calendar
 * builds its `date → text` map from this in one read instead of one query
 * per card.
 */
export const listByClass = query({
	args: { classId: v.id('esl_classes') },
	handler: async (ctx, args) => {
		const { viewer } = await requireAssignedTeacher(ctx, args.classId);
		const notes = await ctx.db
			.query('teacher_notes')
			.withIndex('by_class_teacher_date', (q) =>
				q.eq('classId', args.classId).eq('teacherId', viewer._id)
			)
			.take(500);
		return notes
			.map((note) => ({ date: note.date, text: note.text, updatedAt: note.updatedAt }))
			.sort((a, b) => a.date.localeCompare(b.date));
	}
});

/**
 * Write (or rewrite) the teacher's note for a meeting date. Saving blank
 * text deletes the row, so clearing the box and deleting mean the same
 * thing and no empty rows accumulate.
 */
export const upsert = mutation({
	args: {
		classId: v.id('esl_classes'),
		date: v.string(),
		text: v.string(),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const { viewer } = await requireAssignedTeacher(ctx, args.classId);
		assertValidNoteDate(args.date);
		if (args.text.length > MAX_NOTE_LENGTH) {
			throw new Error(`Notes hold ${MAX_NOTE_LENGTH} characters at most.`);
		}
		const existing = await ctx.db
			.query('teacher_notes')
			.withIndex('by_class_teacher_date', (q) =>
				q.eq('classId', args.classId).eq('teacherId', viewer._id).eq('date', args.date)
			)
			.first();
		if (args.text.trim() === '') {
			if (existing) await ctx.db.delete(existing._id);
			return null;
		}
		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				text: args.text,
				updatedAt: now,
				updatedBy: viewer._id
			});
			return existing._id;
		}
		return await ctx.db.insert('teacher_notes', {
			classId: args.classId,
			date: args.date,
			teacherId: viewer._id,
			text: args.text,
			updatedAt: now,
			updatedBy: viewer._id,
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});
	}
});

/** Remove the teacher's note for a meeting date; absent rows stay absent. */
export const clear = mutation({
	args: {
		classId: v.id('esl_classes'),
		date: v.string()
	},
	handler: async (ctx, args) => {
		const { viewer } = await requireAssignedTeacher(ctx, args.classId);
		assertValidNoteDate(args.date);
		const existing = await ctx.db
			.query('teacher_notes')
			.withIndex('by_class_teacher_date', (q) =>
				q.eq('classId', args.classId).eq('teacherId', viewer._id).eq('date', args.date)
			)
			.first();
		if (existing) await ctx.db.delete(existing._id);
		return null;
	}
});
