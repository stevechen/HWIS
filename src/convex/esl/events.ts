import { mutation, query, type MutationCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { assertValidEslEvent, describeEslEventError, type EslEventType } from '../shared/esl';

const typeValidator = v.union(
	v.literal('task_due'),
	v.literal('homework_due'),
	v.literal('quiz'),
	v.literal('off'),
	v.literal('no_class'),
	v.literal('partial'),
	v.literal('exam'),
	v.literal('start_school')
);

const targetValidator = v.union(
	v.literal('all'),
	v.literal('CLIL'),
	v.literal('Comm'),
	v.literal('G9')
);

/**
 * Dates an event occupies, inclusive. Ranged due-types span date..endDate;
 * every other type occupies its single date. Lexical stepping is safe: all
 * dates are zero-padded YYYY-MM-DD, so string order is calendar order.
 */
function occupiedDates(args: { date: string; endDate?: string }): string[] {
	if (args.endDate === undefined || args.endDate === args.date) return [args.date];
	const dates: string[] = [];
	let current = args.date;
	while (current <= args.endDate) {
		dates.push(current);
		const [year, month, day] = current.split('-').map(Number);
		current = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
	}
	return dates;
}

/**
 * Refuse a write that would break the views' exclusivity invariant: off and
 * exam days are exclusive — no other event may share one of their dates, and
 * no off/exam may land on an occupied date. Ranges are checked date by date,
 * so a due window crossing an exam day is refused with the date named.
 *
 * cost: 1 `by_semester_date` lookup per occupied date — the event's own span
 * (days), not the table.
 */
async function assertExclusive(
	ctx: MutationCtx,
	args: {
		semesterId: Doc<'esl_semesters'>['_id'];
		type: EslEventType;
		date: string;
		endDate?: string;
	}
): Promise<void> {
	const exclusive = args.type === 'off' || args.type === 'exam';
	for (const date of occupiedDates(args)) {
		const occupants = await ctx.db
			.query('esl_events')
			.withIndex('by_semester_date', (q) => q.eq('semesterId', args.semesterId).eq('date', date))
			.collect();
		if (occupants.length === 0) continue;
		const collision = exclusive
			? occupants[0]
			: occupants.find((event) => event.type === 'off' || event.type === 'exam');
		if (collision) {
			const cause =
				collision.type === 'off'
					? `a day off (${collision.label})`
					: `an exam (${collision.label})`;
			throw new Error(
				`${date} already holds ${cause}. Off and exam days are exclusive — move one of them first.`
			);
		}
	}
}

/**
 * Create a typed event on a semester.
 *
 * Writes sit behind `requireEslAdmin`; reads are teacher-visible. Ranges live
 * on due-types only, partial bounds on partials only, one partial per date —
 * each refused with the admin-facing sentence from `describeEslEventError`.
 *
 * cost: field validation (no reads) + exclusivity lookups + 1 insert.
 */
export const create = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		type: typeValidator,
		label: v.string(),
		target: v.optional(targetValidator),
		date: v.string(),
		endDate: v.optional(v.string()),
		note: v.optional(v.string()),
		startPeriod: v.optional(v.number()),
		endPeriod: v.optional(v.number()),
		provenance: v.optional(v.union(v.literal('holiday_api'), v.literal('admin_typed'))),
		unverified: v.optional(v.boolean()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');

		const label = args.label.trim();
		if (label === '') throw new Error('An event label is required.');

		const fieldError = assertValidEslEvent({
			type: args.type,
			date: args.date,
			endDate: args.endDate,
			startPeriod: args.startPeriod,
			endPeriod: args.endPeriod
		});
		if (fieldError) throw new Error(describeEslEventError(fieldError));

		if (args.type === 'partial') {
			const sameDay = await ctx.db
				.query('esl_events')
				.withIndex('by_semester_date', (q) =>
					q.eq('semesterId', args.semesterId).eq('date', args.date)
				)
				.collect();
			if (sameDay.some((event) => event.type === 'partial')) {
				throw new Error(`${args.date} already has a partial day. Only one partial per date.`);
			}
		}

		await assertExclusive(ctx, {
			semesterId: args.semesterId,
			type: args.type,
			date: args.date,
			endDate: args.endDate
		});

		const note = args.note?.trim();

		return await ctx.db.insert('esl_events', {
			semesterId: args.semesterId,
			type: args.type,
			label,
			target: args.target ?? 'all',
			date: args.date,
			...(args.endDate === undefined ? {} : { endDate: args.endDate }),
			...(note === undefined || note === '' ? {} : { note }),
			...(args.startPeriod === undefined ? {} : { startPeriod: args.startPeriod }),
			...(args.endPeriod === undefined ? {} : { endPeriod: args.endPeriod }),
			...(args.provenance === undefined ? {} : { provenance: args.provenance }),
			...(args.unverified === undefined ? {} : { unverified: args.unverified }),
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});
	}
});

/**
 * One event by id. cost: 1 point read.
 */
export const get = query({
	args: { eventId: v.id('esl_events') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const event = await ctx.db.get(args.eventId);
		if (!event) throw new Error('Event not found');
		return event;
	}
});

/**
 * A semester's events in date order, for the admin detail screen and the
 * teacher join core. cost: 1 indexed take of the semester's events (tens of
 * rows), not the table.
 */
export const listBySemester = query({
	args: { semesterId: v.id('esl_semesters') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const events = await ctx.db
			.query('esl_events')
			.withIndex('by_semester', (q) => q.eq('semesterId', args.semesterId))
			.collect();
		return events.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
	}
});
