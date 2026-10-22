import { mutation, query, type MutationCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	ESL_START_SCHOOL_PERIODS,
	EXAM_SEED_WEEKDAYS,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	defaultTargetForEventType,
	describeEslEventError,
	expandExamDays,
	g9MockDates,
	isEslEventType,
	isNoteHiddenForEventType,
	isProtectedSeedEvent,
	migrateLegacyEslEvent,
	migrateToReminderEslEvent,
	takesPeriodBounds,
	type EslEventTarget,
	type EslEventType,
	type EslReminderKind
} from '../shared/esl';

const typeValidator = v.union(
	v.literal('start_school'),
	v.literal('reminder'),
	v.literal('no_school'),
	v.literal('no_class'),
	v.literal('partial'),
	v.literal('exam'),
	v.literal('g9_mock')
);

const reminderKindValidator = v.union(
	v.literal('quiz'),
	v.literal('passport'),
	v.literal('recording'),
	v.literal('task'),
	v.literal('passport_check'),
	v.literal('workbook_check')
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
	const spanned = occupiedDates(args);
	for (const date of spanned) {
		// A ranged reminder is a "give teachers this window" marker, not a set
		// of classes: a quiz spans a whole Mon–Fri week, so it necessarily
		// covers the non-class days (Tue/Thu) and very often a public holiday
		// inside that week. Refusing it because a no-school day fell between
		// its first and last date made most weeks unusable. So for a range we
		// only require the ENDPOINTS to be clear, plus every date to be clear
		// of an EXAM — an exam is real teaching time and a reminder running
		// through one is never intended.
		const interior = date !== args.date && date !== spanned[spanned.length - 1];
		const skipNoSchoolCheck = !exclusive && interior;
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
			: others.find((event) =>
					skipNoSchoolCheck
						? event.type === 'exam'
						: event.type === 'no_school' || event.type === 'exam'
				);
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
 * The period bounds a write carries (#217): a partial day keeps exactly
 * what the admin sent, while the first day of school always carries a
 * window — P1–P2 by default, so the day's teaching starts at P3 and the
 * first-day schedule is explicit data rather than an unwritten rule. An
 * admin may still widen the window; the reversed pair is refused.
 */
export function periodBoundsFor(
	type: EslEventType,
	sent: { startPeriod?: number; endPeriod?: number }
): { startPeriod?: number; endPeriod?: number } {
	if (type !== 'start_school') return sent;
	return {
		startPeriod: sent.startPeriod ?? ESL_START_SCHOOL_PERIODS.startPeriod,
		endPeriod: sent.endPeriod ?? ESL_START_SCHOOL_PERIODS.endPeriod
	};
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
 * Fan one G9 mock start out to its two consecutive single-date rows (#217):
 * the fixed two-day pair written as two dates rather than as a range,
 * because a mock is never exam-typed — it anchors no term boundary and
 * shares no `examGroup`. Not exclusive itself, so it still runs the same
 * guard every write runs and refuses against an off or an exam day.
 *
 * cost: 1 exclusivity lookup per day + 1 insert per day.
 */
async function createG9MockGroup(
	ctx: MutationCtx,
	semesterId: Doc<'esl_semesters'>['_id'],
	args: { title: string; target: EslEventTarget; startDate: string; e2eTag?: string }
): Promise<Id<'esl_events'>[]> {
	const dates = g9MockDates(args.startDate);
	for (const date of dates) {
		await assertExclusive(ctx, { semesterId, type: 'g9_mock', date });
	}

	const ids: Id<'esl_events'>[] = [];
	for (const date of dates) {
		ids.push(
			await ctx.db.insert('esl_events', {
				semesterId,
				type: 'g9_mock',
				title: args.title,
				target: args.target,
				date,
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
 * on due-types only, partial bounds on partials and the first day only, one
 * partial per date, targets behind the per-type gate — each refused with the
 * admin-facing sentence from `describeEslEventError`.
 *
 * Exams and G9 mocks fan out: the date is the group's start, and the create
 * writes one row per day (2 for Exam 1/2, 3 for the Final, 2 consecutive
 * single dates for a mock), pushing past weekends and off days, every exam row
 * sharing the title as its `examGroup`. A duplicate title or a fourth group
 * refuses; an off landing on an exam day refuses through the same exclusivity
 * every other write runs.
 *
 * cost: field validation (no reads) + exclusivity lookups + 1 insert per
 * row (1 for every type but exam and g9_mock).
 */
export const create = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		type: typeValidator,
		reminderKind: v.optional(reminderKindValidator),
		isBanner: v.optional(v.boolean()),
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
		const titleError = assertValidEslTitle(args.type, title, args.reminderKind);
		if (titleError) throw new Error(describeEslEventError(titleError));

		// The locked target is also the default, so a write that names the
		// wrong one still refuses rather than silently retargeting.
		const target = args.target ?? defaultTargetForEventType(args.type, args.reminderKind);
		const targetError = assertValidEslTarget(args.type, target, args.reminderKind);
		if (targetError) throw new Error(describeEslEventError(targetError));

		const bounds = periodBoundsFor(args.type, {
			startPeriod: args.startPeriod,
			endPeriod: args.endPeriod
		});

		const fieldError = assertValidEslEvent({
			type: args.type,
			date: args.date,
			endDate: args.endDate,
			startPeriod: bounds.startPeriod,
			endPeriod: bounds.endPeriod,
			...(args.reminderKind === undefined ? {} : { reminderKind: args.reminderKind }),
			...(args.isBanner === undefined ? {} : { isBanner: args.isBanner })
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

		// Banner-only types carry no note (#211, #216) — a client-supplied note is
		// dropped, never stored. Task-kind reminders keep their optional note.
		const note = isNoteHiddenForEventType(args.type, args.reminderKind)
			? undefined
			: args.note?.trim();

		if (args.type === 'exam') {
			return await createExamGroup(ctx, args.semesterId, {
				title,
				startDate: args.date,
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
		}

		if (args.type === 'g9_mock') {
			return await createG9MockGroup(ctx, args.semesterId, {
				title,
				target,
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

		// A reminder is the only ranged type, and its window stays optional:
		// a due with one date reads `due` in the views while a window reads
		// `due window X–Y`. Every occupied date runs the exclusivity guard,
		// so a window can never straddle an exam or an off day (#217) — a
		// wizard that wants N school days past an exam builds the window with
		// `dueWindowDates` rather than hoping the write lands.
		return await ctx.db.insert('esl_events', {
			semesterId: args.semesterId,
			type: args.type,
			...(args.reminderKind === undefined ? {} : { reminderKind: args.reminderKind }),
			...(args.type === 'reminder' ? { isBanner: args.isBanner ?? true } : {}),
			title,
			target,
			date: args.date,
			...(args.endDate === undefined ? {} : { endDate: args.endDate }),
			...(note === undefined || note === '' ? {} : { note }),
			...(bounds.startPeriod === undefined ? {} : { startPeriod: bounds.startPeriod }),
			...(bounds.endPeriod === undefined ? {} : { endPeriod: bounds.endPeriod }),
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
 * `clearPeriods` drops both partial bounds — and re-stamps the first day's
 * P1–P2 window, which a Start row always carries (#217).
 *
 * cost: 1 point read + exclusivity lookups over the new span + 1 patch.
 */
export const update = mutation({
	args: {
		eventId: v.id('esl_events'),
		type: v.optional(typeValidator),
		reminderKind: v.optional(reminderKindValidator),
		clearReminderKind: v.optional(v.boolean()),
		isBanner: v.optional(v.boolean()),
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
		const reminderKind =
			args.clearReminderKind === true
				? undefined
				: ((args.reminderKind ?? event.reminderKind) as EslReminderKind | undefined);
		const isBanner = args.isBanner ?? event.isBanner;
		const title = args.title === undefined ? event.title : args.title.trim();
		const titleError = assertValidEslTitle(type, title, reminderKind);
		if (titleError) throw new Error(describeEslEventError(titleError));

		const target = args.target ?? event.target;
		const targetError = assertValidEslTarget(type, target, reminderKind);
		if (targetError) throw new Error(describeEslEventError(targetError));

		const date = args.date ?? event.date;
		const endDate = args.clearEndDate === true ? undefined : (args.endDate ?? event.endDate);
		const sentBounds = {
			startPeriod: args.clearPeriods === true ? undefined : (args.startPeriod ?? event.startPeriod),
			endPeriod: args.clearPeriods === true ? undefined : (args.endPeriod ?? event.endPeriod)
		};
		// A row retyped off a bounded type drops its stale bounds instead of
		// being refused over fields the new type does not take at all.
		const bounds = takesPeriodBounds(type)
			? periodBoundsFor(type, sentBounds)
			: { startPeriod: undefined, endPeriod: undefined };
		const startPeriod = bounds.startPeriod;
		const endPeriod = bounds.endPeriod;

		const fieldError = assertValidEslEvent({
			type,
			date,
			endDate,
			startPeriod,
			endPeriod,
			...(reminderKind === undefined ? {} : { reminderKind }),
			...(type === 'reminder' && isBanner !== undefined ? { isBanner } : {})
		});
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

		// Banner-only types carry no note (#211, #216): the incoming note is ignored
		// and a retarget onto a hidden type clears the stored note.
		// Task-kind reminders keep their optional note.
		const note = isNoteHiddenForEventType(type, reminderKind)
			? undefined
			: args.note === undefined
				? event.note
				: args.note.trim();

		await ctx.db.patch(args.eventId, {
			type,
			title,
			target,
			date,
			...(reminderKind === undefined ? { reminderKind: undefined } : { reminderKind }),
			...(type === 'reminder'
				? { isBanner: args.isBanner ?? event.isBanner ?? true }
				: { isBanner: undefined }),
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
 * One-time v3 migration (#210, #216): `homework_due` rows become `reminder`
 * kind=task, `task_due` becomes kind=task, `quiz`/`passport_due`/
 * `recording_due` their kinds, `off` becomes `no_school`, and every row's
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
				reminderKind?: unknown;
			};
			const hasTitle = typeof legacy.title === 'string' && legacy.title.trim() !== '';
			// Rows already on the current union need nothing: v3 single-date
			// types stamp no extra fields, reminders already carry their kind.
			if (hasTitle && isEslEventType(legacy.type)) {
				if (legacy.type !== 'reminder') continue;
				if (typeof legacy.reminderKind === 'string' && legacy.reminderKind.trim() !== '') {
					continue;
				}
			}
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
			const mappedKind =
				mapped.type === 'reminder'
					? (mapped as { reminderKind: EslReminderKind }).reminderKind
					: undefined;
			const currentKind = typeof legacy.reminderKind === 'string' ? legacy.reminderKind : undefined;
			if (
				hasTitle &&
				legacy.type === mapped.type &&
				rawTitle === mapped.title &&
				(rawNote ?? undefined) === (mapped.note ?? undefined) &&
				currentKind === mappedKind
			) {
				continue;
			}
			await ctx.db.patch(event._id, {
				type: mapped.type,
				title: mapped.title,
				...(mapped.note === undefined ? { note: undefined } : { note: mapped.note }),
				...(mapped.type === 'reminder'
					? {
							reminderKind: (mapped as { reminderKind: EslReminderKind }).reminderKind,
							isBanner: true
						}
					: {})
			});
			migrated += 1;
		}
		return { total: events.length, migrated, skipped };
	}
});

/**
 * One-time reminder consolidation (#216): v3 `quiz` → `reminder`
 * kind=quiz, `passport_due` → kind=passport, `recording_due` →
 * kind=recording, `task` → kind=task (titles ride through, `isBanner`
 * stamps true).
 *
 * Admin-only and idempotent: re-running reports zero migrated rows.
 *
 * cost: 1 full take of `esl_events` + 1 patch per legacy due row.
 */
export const migrateToReminder = mutation({
	args: {},
	handler: async (ctx) => {
		await requireEslAdmin(ctx);

		const events = await ctx.db.query('esl_events').collect();
		let migrated = 0;
		const skipped: string[] = [];
		for (const event of events) {
			const legacy = event as unknown as {
				type: string;
				title?: unknown;
				note?: unknown;
			};
			const rawTitle = typeof legacy.title === 'string' ? legacy.title : '';
			const rawNote = typeof legacy.note === 'string' ? legacy.note : undefined;
			const mapped = migrateToReminderEslEvent({
				type: legacy.type,
				title: rawTitle,
				...(rawNote === undefined ? {} : { note: rawNote })
			});
			if (mapped === null) continue;
			await ctx.db.patch(event._id, {
				type: mapped.type,
				title: mapped.title,
				...(mapped.note === undefined ? { note: undefined } : { note: mapped.note }),
				reminderKind: mapped.reminderKind,
				isBanner: true
			});
			migrated += 1;
		}
		return { total: events.length, migrated, skipped };
	}
});
