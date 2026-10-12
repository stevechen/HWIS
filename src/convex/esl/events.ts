import { mutation, query, type MutationCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	EXAM_SEED_WEEKDAYS,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	describeEslEventError,
	expandExamDays,
	isNoteHiddenForEventType,
	isProtectedSeedEvent,
	migrateLegacyEslEvent,
	type EslEventType
} from '../shared/esl';

const typeValidator = v.union(
	v.literal('start_school'),
	v.literal('quiz'),
	v.literal('no_school'),
	v.literal('no_class'),
	v.literal('partial'),
	v.literal('exam'),
	v.literal('passport_due'),
	v.literal('recording_due'),
	v.literal('task'),
	v.literal('g9_mock')
);

const targetValidator = v.union(
	v.literal('all'),
	v.literal('CLIL'),
	v.literal('Comm'),
	v.literal('G7'),
	v.literal('G8'),
	v.literal('G9'),
	v.literal('H1')
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
 * Refuse a write that would break the views' exclusivity invariant: no-school
 * and exam days are exclusive — no other event may share one of their dates,
 * and no no-school/exam may land on an occupied date. Ranges are checked date
 * by date, so a due window crossing an exam day is refused with the date named.
 *
 * cost: 1 `by_semester_date` lookup per occupied date — the event's own span
 * (days), not the table.
 *
 * Exported for the seed service, which writes drafts under the same invariant
 * (a mutation cannot call another mutation, so the seed reuses the guard
 * rather than the `create` entry point).
 */
export async function assertExclusive(
	ctx: MutationCtx,
	args: {
		semesterId: Doc<'esl_semesters'>['_id'];
		type: EslEventType;
		date: string;
		endDate?: string;
		/** The row being edited — its own dates never collide with itself. */
		excludeId?: Id<'esl_events'>;
	}
): Promise<void> {
	const exclusive = args.type === 'no_school' || args.type === 'exam';
	for (const date of occupiedDates(args)) {
		const occupants = await ctx.db
			.query('esl_events')
			.withIndex('by_semester_date', (q) => q.eq('semesterId', args.semesterId).eq('date', date))
			.collect();
		const others =
			args.excludeId === undefined
				? occupants
				: occupants.filter((event) => event._id !== args.excludeId);
		if (others.length === 0) continue;
		const collision = exclusive
			? others[0]
			: others.find((event) => event.type === 'no_school' || event.type === 'exam');
		if (collision) {
			const cause =
				collision.type === 'no_school'
					? `a no-school day (${collision.title})`
					: `an exam (${collision.title})`;
			throw new Error(
				`${date} already holds ${cause}. No-school and exam days are exclusive — move one of them first.`
			);
		}
	}
}

/**
 * The exam groups a semester already holds, keyed by `examGroup` with a
 * title fallback for rows written before the field existed. One group per
 * locked title is the invariant: the titles bound the groups at three, so a
 * fourth create necessarily duplicates — and refuses as either a duplicate
 * title or a fourth group, whichever the admin hit first.
 */
function examGroupsOf(
	events: readonly { type: string; title: string; date: string; examGroup?: string }[]
) {
	const groups = new Map<string, string[]>();
	for (const event of events) {
		if (event.type !== 'exam') continue;
		const key = event.examGroup ?? event.title;
		const dates = groups.get(key) ?? [];
		dates.push(event.date);
		groups.set(key, dates);
	}
	return groups;
}

/**
 * Refuse an exam write that would break the one-group-per-title invariant:
 * a title that already holds days, or a fourth group past the locked three.
 * `knownDates` names the existing days of a duplicated title so the refusal
 * points at what to move instead.
 */
function assertExamGroupAllowed(
	groups: Map<string, string[]>,
	title: string,
	knownDates: readonly string[]
): void {
	if (groups.size >= 3) {
		throw new Error(
			`This semester already holds three exam groups (${[...groups.keys()].join(', ')}). Move one of them instead of adding another.`
		);
	}
	if (groups.has(title)) {
		throw new Error(
			`${title} already has its days (${knownDates.join(', ')}). Move them instead — one group per exam.`
		);
	}
}

/**
 * Fan one exam start out to its teaching-day rows, each sharing the title
 * as its `examGroup`. Exams and their groups are locked together: the title
 * is the group key, so a duplicate title or a fourth group refuses before
 * anything is written, and every generated day runs the same exclusivity
 * an off landing on an exam day would hit from the other side.
 *
 * cost: 1 indexed take of the semester's events (tens of rows) + 1
 * exclusivity lookup per generated day + 1 insert per day.
 */
async function createExamGroup(
	ctx: MutationCtx,
	semesterId: Doc<'esl_semesters'>['_id'],
	args: { title: string; startDate: string; e2eTag?: string }
): Promise<Id<'esl_events'>[]> {
	const existing = await ctx.db
		.query('esl_events')
		.withIndex('by_semester', (q) => q.eq('semesterId', semesterId))
		.collect();

	const groups = examGroupsOf(existing);
	assertExamGroupAllowed(groups, args.title, groups.get(args.title) ?? []);

	const offDates = new Set(
		existing.filter((event) => event.type === 'no_school').map((event) => event.date)
	);
	const days = expandExamDays({
		startDate: args.startDate,
		dayCount: EXAM_SEED_WEEKDAYS[args.title] ?? 2,
		offDates
	});

	for (const date of days) {
		await assertExclusive(ctx, { semesterId, type: 'exam', date });
	}

	const ids: Id<'esl_events'>[] = [];
	for (const date of days) {
		ids.push(
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'exam',
				title: args.title,
				target: 'all',
				date,
				examGroup: args.title,
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			})
		);
	}
	return ids;
}

/**
 * Create a typed event on a semester.
 *
 * Writes sit behind `requireEslAdmin`; reads are teacher-visible. Ranges live
 * on due-types only, partial bounds on partials only, one partial per date,
 * targets behind the per-type gate — each refused with the admin-facing
 * sentence from `describeEslEventError`.
 *
 * Exams fan out: the date is the group's start, and the create writes one
 * row per teaching day (2 for Exam 1/2, 3 for the Final), pushing past
 * weekends and off days, every row sharing the title as its `examGroup`.
 * A duplicate title or a fourth group refuses; an off landing on an exam
 * day refuses through the same exclusivity every other write runs.
 *
 * cost: field validation (no reads) + exclusivity lookups + 1 insert per
 * row (1 for every type but exam).
 */
export const create = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		type: typeValidator,
		title: v.string(),
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

		const title = args.title.trim();
		const titleError = assertValidEslTitle(args.type, title);
		if (titleError) throw new Error(describeEslEventError(titleError));

		const targetError = assertValidEslTarget(args.type, args.target ?? 'all');
		if (targetError) throw new Error(describeEslEventError(targetError));

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

		// Banner-only types carry no note (#211) — a client-supplied note is
		// dropped, never stored.
		const note = isNoteHiddenForEventType(args.type) ? undefined : args.note?.trim();

		if (args.type === 'exam') {
			return await createExamGroup(ctx, args.semesterId, {
				title,
				startDate: args.date,
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
		}

		await assertExclusive(ctx, {
			semesterId: args.semesterId,
			type: args.type,
			date: args.date,
			endDate: args.endDate
		});

		return await ctx.db.insert('esl_events', {
			semesterId: args.semesterId,
			type: args.type,
			title,
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
 * Edit an event in place — the seed rows stay fill-or-edit drafts, exams
 * included ("always editable"). Re-runs every guard `create` runs: field
 * validation, one-partial-per-date, and off/exam exclusivity over the merged
 * row (the row's own dates never collide with itself).
 *
 * Clearing: an empty `note` clears it; `clearEndDate` drops the range end;
 * `clearPeriods` drops both partial bounds.
 *
 * cost: 1 point read + exclusivity lookups over the new span + 1 patch.
 */
export const update = mutation({
	args: {
		eventId: v.id('esl_events'),
		type: v.optional(typeValidator),
		title: v.optional(v.string()),
		target: v.optional(targetValidator),
		date: v.optional(v.string()),
		endDate: v.optional(v.string()),
		clearEndDate: v.optional(v.boolean()),
		note: v.optional(v.string()),
		startPeriod: v.optional(v.number()),
		endPeriod: v.optional(v.number()),
		clearPeriods: v.optional(v.boolean()),
		provenance: v.optional(v.union(v.literal('holiday_api'), v.literal('admin_typed'))),
		unverified: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const event = await ctx.db.get(args.eventId);
		if (!event) throw new Error('Event not found');

		const type = args.type ?? event.type;
		const title = args.title === undefined ? event.title : args.title.trim();
		const titleError = assertValidEslTitle(type, title);
		if (titleError) throw new Error(describeEslEventError(titleError));

		const target = args.target ?? event.target;
		const targetError = assertValidEslTarget(type, target);
		if (targetError) throw new Error(describeEslEventError(targetError));

		const date = args.date ?? event.date;
		const endDate = args.clearEndDate === true ? undefined : (args.endDate ?? event.endDate);
		const startPeriod =
			args.clearPeriods === true ? undefined : (args.startPeriod ?? event.startPeriod);
		const endPeriod = args.clearPeriods === true ? undefined : (args.endPeriod ?? event.endPeriod);

		const fieldError = assertValidEslEvent({ type, date, endDate, startPeriod, endPeriod });
		if (fieldError) throw new Error(describeEslEventError(fieldError));

		if (type === 'partial') {
			const sameDay = await ctx.db
				.query('esl_events')
				.withIndex('by_semester_date', (q) => q.eq('semesterId', event.semesterId).eq('date', date))
				.collect();
			if (sameDay.some((other) => other._id !== args.eventId && other.type === 'partial')) {
				throw new Error(`${date} already has a partial day. Only one partial per date.`);
			}
		}

		await assertExclusive(ctx, {
			semesterId: event.semesterId,
			type,
			date,
			endDate,
			excludeId: args.eventId
		});

		// Exam rows carry their title as the group key, and the
		// one-group-per-title invariant holds across edits too: moving a day
		// onto an occupied title (or converting a row into a fourth group)
		// refuses, while leaving the type clears the key with it.
		let examGroup: string | undefined;
		if (type === 'exam') {
			const currentKey = event.type === 'exam' ? (event.examGroup ?? event.title) : null;
			if (title !== currentKey) {
				const siblings = await ctx.db
					.query('esl_events')
					.withIndex('by_semester', (q) => q.eq('semesterId', event.semesterId))
					.collect();
				const groups = examGroupsOf(siblings.filter((other) => other._id !== args.eventId));
				assertExamGroupAllowed(groups, title, groups.get(title) ?? []);
			}
			examGroup = title;
		}

		// Banner-only types carry no note (#211): the incoming note is ignored
		// and a retarget onto a hidden type clears the stored note.
		const note = isNoteHiddenForEventType(type)
			? undefined
			: args.note === undefined
				? event.note
				: args.note.trim();

		await ctx.db.patch(args.eventId, {
			type,
			title,
			target,
			date,
			...(examGroup === undefined ? { examGroup: undefined } : { examGroup }),
			...(endDate === undefined ? { endDate: undefined } : { endDate }),
			...(note === undefined || note === '' ? { note: undefined } : { note }),
			...(startPeriod === undefined ? { startPeriod: undefined } : { startPeriod }),
			...(endPeriod === undefined ? { endPeriod: undefined } : { endPeriod }),
			...(args.provenance === undefined ? {} : { provenance: args.provenance }),
			...(args.unverified === undefined ? {} : { unverified: args.unverified })
		});
	}
});

/**
 * Delete an event. Dues, checks, Sport's Day and every other
 * deletable seeded row go here — but exams and the graduation ceremony are
 * anchors the views derive from, so they are protected and the refusal names
 * the row.
 *
 * cost: 1 point read + 1 delete.
 */
export const remove = mutation({
	args: { eventId: v.id('esl_events') },
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const event = await ctx.db.get(args.eventId);
		if (!event) throw new Error('Event not found');
		if (isProtectedSeedEvent(event)) {
			throw new Error(
				`${event.title} is protected against deletion — exams and the ceremony anchor the semester. Move it instead.`
			);
		}
		await ctx.db.delete(args.eventId);
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
		return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
	}
});

/**
 * One-time v3 migration (#210): `homework_due` rows become `task`,
 * `task_due` becomes `task`, `off` becomes `no_school`, and every row's
 * legacy `label` becomes the explicit `title` (see `migrateLegacyEslEvent`
 * for the mapping).
 *
 * Admin-only and idempotent: re-running reports zero migrated rows.
 *
 * cost: 1 full take of `esl_events` (tens of rows per semester) + 1 patch
 * per row that still needs it.
 */
export const migrateToV3 = mutation({
	args: {},
	handler: async (ctx) => {
		await requireEslAdmin(ctx);

		const events = await ctx.db.query('esl_events').collect();
		let migrated = 0;
		const skipped: string[] = [];
		for (const event of events) {
			// Pre-v3 rows predate the `title` field, so read the legacy shape
			// through an unknown-narrowed view rather than the v3 document.
			const legacy = event as unknown as {
				type: string;
				title?: unknown;
				label?: unknown;
				note?: unknown;
			};
			const rawTitle =
				typeof legacy.title === 'string' && legacy.title.trim() !== ''
					? legacy.title.trim()
					: typeof legacy.label === 'string'
						? legacy.label.trim()
						: '';
			const rawNote = typeof legacy.note === 'string' ? legacy.note : undefined;
			const mapped = migrateLegacyEslEvent({
				type: legacy.type,
				label: rawTitle,
				...(rawNote === undefined ? {} : { note: rawNote })
			});
			if (mapped === null) {
				skipped.push(`${event._id} (unknown type ${legacy.type})`);
				continue;
			}
			// The skip needs a title to already exist: a title-less row
			// whose label already reads canonical (e.g. exam "Exam 1")
			// still needs its title stamped, or a re-tightened schema
			// keeps rejecting the deployment on restart.
			const hasTitle = typeof legacy.title === 'string' && legacy.title.trim() !== '';
			if (
				hasTitle &&
				legacy.type === mapped.type &&
				rawTitle === mapped.title &&
				(rawNote ?? undefined) === (mapped.note ?? undefined)
			) {
				continue;
			}
			await ctx.db.patch(event._id, {
				type: mapped.type,
				title: mapped.title,
				...(mapped.note === undefined ? { note: undefined } : { note: mapped.note })
			});
			migrated += 1;
		}
		return { total: events.length, migrated, skipped };
	}
});
