import { action, internalMutation, internalQuery } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { periodBoundsFor } from './events';
import {
	ESL_EVENT_TITLES,
	ESL_LOCKED_NOTES,
	ESL_REMINDER_TITLES,
	EXAM_SEED_WEEKDAYS,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	defaultTargetForEventType,
	describeEslEventError,
	expandExamDays,
	g9MockDates,
	isNoteHiddenForEventType,
	isProtectedSeedEvent,
	isValidEslDate,
	type EslEventTarget,
	type EslEventType,
	type EslReminderKind
} from '../shared/esl';

/**
 * One-transaction semester save for the setup wizard (ticket #223, spec
 * #215 stories 27–30), and — since #253 — the reconcile save for the edit
 * wizard: same payload shape, diffed against the rows a semester already
 * holds so checklist drafts, holiday imports and manual edits survive.
 *
 * The wizard writes NOTHING until Save: Step 2's holiday preview stages
 * off days into wizard state, Steps 3–4 only fill state, and the save
 * actions turn that state into `esl_events` rows. `saveSemester` creates
 * the semester then inserts every event; `updateSemester` patches the
 * semester row and reconciles only the wizard-owned rows that changed.
 * Every row re-validates (locked titles/targets, exam fan-out,
 * exclusivity), so an invalid payload fails loudly naming the date.
 * Callers must keep wizard rows inside the UI gates
 * (refuse-by-construction), which makes mid-save failure unreachable in
 * practice; the duplicate-semester guard runs before the first write.
 *
 * cost (save): 1 duplicate lookup + 1 semester insert + 1 `events.create`
 * (with its own bounded lookups) per event — tens of sequential mutations.
 * cost (update): 1 semester read + 1 indexed take of the semester's events
 * + pure diffing + one transaction of inserts/patches/deletes.
 */

const targetValidator = v.union(
	v.literal('all'),
	v.literal('CLIL'),
	v.literal('Comm'),
	v.literal('G7'),
	v.literal('G8'),
	v.literal('G9'),
	v.literal('H1')
);

const examLabelValidator = v.union(v.literal('Exam 1'), v.literal('Exam 2'), v.literal('Final'));

const nullableDates = v.union(v.array(v.string()), v.null());

const customValidator = v.object({
	id: v.string(),
	type: v.union(v.literal('meeting'), v.literal('banner')),
	date: v.optional(v.string()),
	target: v.optional(targetValidator),
	subType: v.optional(v.union(v.literal('partial'), v.literal('no_class'), v.literal('task'))),
	note: v.optional(v.string()),
	startDate: v.optional(v.string()),
	endDate: v.optional(v.string()),
	bannerText: v.optional(v.string())
});

export type WizardSaveCustom = {
	id: string;
	type: 'meeting' | 'banner';
	date?: string;
	target?: EslEventTarget;
	subType?: 'partial' | 'no_class' | 'task';
	note?: string;
	startDate?: string;
	endDate?: string;
	bannerText?: string;
};

/** The payload fields `buildSavePayload` produces, shared by both saves. */
const semesterPayloadArgs = {
	year: v.string(),
	term: v.union(v.literal('S1'), v.literal('S2')),
	startDate: v.string(),
	offDays: v.array(v.object({ date: v.string(), name: v.string() })),
	exams: v.array(v.object({ label: examLabelValidator, dates: v.array(v.string()) })),
	singles: v.object({
		anniv: v.union(v.string(), v.null()),
		makeup: v.union(v.string(), v.null()),
		sports: v.union(v.string(), v.null()),
		grad: v.union(v.string(), v.null()),
		bbq: v.union(v.string(), v.null())
	}),
	sportsOn: v.boolean(),
	// Seed-service extras folded in (#229): named no-school days the
	// template cannot know — spring-break ranges (expanded per calendar
	// day like the seed did), ad-hoc days off, and explicit lunar
	// fallbacks when the gov import has no row (lunar auto-resolution
	// stays with the Step 2 gov import, which reads the same cache).
	extras: v.array(
		v.object({
			name: v.string(),
			startDate: v.string(),
			endDate: v.optional(v.string())
		})
	),
	pairs: v.object({
		mock1: nullableDates,
		mock2: nullableDates,
		mock3: nullableDates
	}),
	ranges: v.object({
		q1: nullableDates,
		q2: nullableDates,
		q3: nullableDates,
		q4: nullableDates,
		q5: nullableDates,
		q6: nullableDates,
		pd1: nullableDates,
		pd2: nullableDates,
		pd3: nullableDates,
		rd1: nullableDates,
		rd2: nullableDates,
		rd3: nullableDates,
		pcheck: nullableDates,
		wcheck: nullableDates
	}),
	customs: v.array(customValidator)
};

/** The TypeScript shape of {@link semesterPayloadArgs}, for the shared builders. */
export type WizardSavePayload = {
	year: string;
	term: 'S1' | 'S2';
	startDate: string;
	offDays: { date: string; name: string }[];
	exams: { label: 'Exam 1' | 'Exam 2' | 'Final'; dates: string[] }[];
	singles: {
		anniv: string | null;
		makeup: string | null;
		sports: string | null;
		grad: string | null;
		bbq: string | null;
	};
	sportsOn: boolean;
	extras: { name: string; startDate: string; endDate?: string }[];
	pairs: { mock1: string[] | null; mock2: string[] | null; mock3: string[] | null };
	ranges: Record<
		| 'q1'
		| 'q2'
		| 'q3'
		| 'q4'
		| 'q5'
		| 'q6'
		| 'pd1'
		| 'pd2'
		| 'pd3'
		| 'rd1'
		| 'rd2'
		| 'rd3'
		| 'pcheck'
		| 'wcheck',
		string[] | null
	>;
	customs: WizardSaveCustom[];
};

/** Duplicate-semester guard: runs before the first write. */
export const findByYearTerm = internalQuery({
	args: { year: v.string(), term: v.union(v.literal('S1'), v.literal('S2')) },
	handler: async (ctx, args): Promise<Doc<'esl_semesters'> | null> => {
		return await ctx.db
			.query('esl_semesters')
			.withIndex('by_year_term', (q) => q.eq('year', args.year).eq('term', args.term))
			.first();
	}
});

type EventWrite = {
	type: 'start_school' | 'reminder' | 'no_school' | 'no_class' | 'partial' | 'exam' | 'g9_mock';
	title: string;
	target?: EslEventTarget;
	date: string;
	endDate?: string;
	reminderKind?: EslReminderKind;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
};

/**
 * Which wizard slot a desired row came from — the ownership key the
 * reconcile matches existing rows by (#253). Exam and quiz families key on
 * their locked title, reminder families on their kind, customs on their
 * temp id; singles on the locked note strings.
 */
type Family =
	| { kind: 'start' }
	| { kind: 'off' }
	| { kind: 'anniv' }
	| { kind: 'makeup' }
	| { kind: 'sports' }
	| { kind: 'grad' }
	| { kind: 'bbq' }
	| { kind: 'mock' }
	| { kind: 'exam'; title: string }
	| { kind: 'quiz'; title: string }
	| { kind: 'rem'; reminderKind: EslReminderKind }
	| { kind: 'custom'; id: string };

type DesiredRow = EventWrite & { family: Family; examGroup?: string };

const EXAM_TITLE: Record<'Exam 1' | 'Exam 2' | 'Final', string> = {
	'Exam 1': 'Exam 1',
	'Exam 2': 'Exam 2',
	Final: 'Final Exam'
};

/**
 * The event rows the wizard's payload stands for, before exam/mock fan-out:
 * one write per wizard slot, tagged with the family the reconcile matches
 * by. `saveSemester` inserts these through `events.create` (which fans
 * exams and mocks); the reconcile expands them itself against the
 * semester's effective off days.
 */
function buildWizardWrites(payload: WizardSavePayload): DesiredRow[] {
	const writes: DesiredRow[] = [];

	// The first-day window: P1–P2 read as no_class on the start date.
	writes.push({
		type: 'start_school',
		title: ESL_EVENT_TITLES.start_school,
		target: 'all',
		date: payload.startDate,
		startPeriod: 1,
		endPeriod: 2,
		family: { kind: 'start' }
	});

	// Off days first: exam fan-out skips no_school days already in the DB.
	// A caption-less row (the checklist drafts unnamed holidays that way)
	// stays note-less so the round-trip matches it byte-for-byte.
	for (const day of payload.offDays) {
		writes.push({
			type: 'no_school',
			title: ESL_EVENT_TITLES.no_school,
			target: 'all',
			date: day.date,
			...(day.name.trim() === '' ? {} : { note: day.name }),
			family: { kind: 'off' }
		});
	}

	// Exams fan out from their start date inside `events.create`
	// (2/2/3 class days, examGroup = title).
	for (const exam of payload.exams) {
		const start = exam.dates[0];
		if (start === undefined) continue;
		const title = EXAM_TITLE[exam.label];
		writes.push({
			type: 'exam',
			title,
			target: 'all',
			date: start,
			family: { kind: 'exam', title }
		});
	}

	if (payload.singles.anniv !== null) {
		writes.push({
			type: 'no_class',
			title: ESL_EVENT_TITLES.no_class,
			target: 'all',
			date: payload.singles.anniv,
			note: ESL_LOCKED_NOTES.anniversary,
			family: { kind: 'anniv' }
		});
	}
	if (payload.singles.makeup !== null) {
		writes.push({
			type: 'no_school',
			title: ESL_EVENT_TITLES.no_school,
			target: 'all',
			date: payload.singles.makeup,
			note: ESL_LOCKED_NOTES.anniversaryMakeup,
			family: { kind: 'makeup' }
		});
	}
	if (payload.sportsOn && payload.singles.sports !== null) {
		writes.push({
			type: 'no_class',
			title: ESL_EVENT_TITLES.no_class,
			target: 'all',
			date: payload.singles.sports,
			note: ESL_LOCKED_NOTES.sportsDay,
			family: { kind: 'sports' }
		});
	}
	if (payload.singles.grad !== null) {
		writes.push({
			type: 'no_class',
			title: ESL_EVENT_TITLES.no_class,
			target: 'G9',
			date: payload.singles.grad,
			note: ESL_LOCKED_NOTES.graduation,
			family: { kind: 'grad' }
		});
	}
	// BBQ (S1-only starter, folded from the seed): a partial afternoon —
	// endPeriod only, like the seed wrote it — with the occasion in the
	// note, since partial titles are locked.
	if (payload.singles.bbq !== null) {
		writes.push({
			type: 'partial',
			title: ESL_EVENT_TITLES.partial,
			target: 'all',
			date: payload.singles.bbq,
			endPeriod: 4,
			note: ESL_LOCKED_NOTES.bbq,
			family: { kind: 'bbq' }
		});
	}
	// Extra no-school days, one row per calendar day (weekends count —
	// a break is a break). Ranges refuse a backwards window; blank
	// names refuse with the field named.
	for (const extra of payload.extras) {
		const name = extra.name.trim();
		if (name === '') throw new Error('An extra no-school day needs a name for its note.');
		if (!isValidEslDate(extra.startDate)) {
			throw new Error(`${extra.startDate} is not a valid date. Use YYYY-MM-DD.`);
		}
		const end = extra.endDate ?? extra.startDate;
		if (!isValidEslDate(end)) {
			throw new Error(`${end} is not a valid date. Use YYYY-MM-DD.`);
		}
		if (end < extra.startDate) {
			throw new Error(`The extra break end ${end} is before its start ${extra.startDate}.`);
		}
		for (let date = extra.startDate; date <= end; date = nextCalendarDate(date)) {
			writes.push({
				type: 'no_school',
				title: ESL_EVENT_TITLES.no_school,
				target: 'all',
				date,
				note: name,
				family: { kind: 'off' }
			});
		}
	}

	// G9 mocks fan out to their two consecutive days inside `events.create`.
	for (const pair of [payload.pairs.mock1, payload.pairs.mock2, payload.pairs.mock3]) {
		const start = pair?.[0];
		if (start === undefined) continue;
		writes.push({
			type: 'g9_mock',
			title: ESL_EVENT_TITLES.g9_mock,
			target: 'G9',
			date: start,
			family: { kind: 'mock' }
		});
	}

	const ranged = (
		reminderKind: EslReminderKind,
		family: Family,
		target: EslEventTarget,
		title: string,
		dates: string[] | null
	) => {
		if (dates === null || dates.length === 0) return;
		const first = dates[0] as string;
		const last = dates[dates.length - 1] as string;
		writes.push({
			type: 'reminder',
			reminderKind,
			target,
			title,
			date: first,
			...(last === first ? {} : { endDate: last }),
			family
		});
	};
	const ranges = payload.ranges;
	const quizIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
	// Quizzes keep free-text numbered titles (quiz kind allows them);
	// dues and checks carry their locked canonical titles — the window
	// badge on each row is what tells them apart. Each quiz row keys on
	// its own title: the kind alone cannot tell `Quiz 2` from `Quiz 3`.
	quizIds.forEach((id, i) => {
		const title = `Quiz ${i + 1}`;
		ranged('quiz', { kind: 'quiz', title }, 'CLIL', title, ranges[id]);
	});
	const passportIds = ['pd1', 'pd2', 'pd3'] as const;
	for (const id of passportIds) {
		ranged(
			'passport',
			{ kind: 'rem', reminderKind: 'passport' },
			'Comm',
			ESL_REMINDER_TITLES.passport,
			ranges[id]
		);
	}
	const recordingIds = ['rd1', 'rd2', 'rd3'] as const;
	for (const id of recordingIds) {
		ranged(
			'recording',
			{ kind: 'rem', reminderKind: 'recording' },
			'Comm',
			ESL_REMINDER_TITLES.recording,
			ranges[id]
		);
	}
	ranged(
		'passport_check',
		{ kind: 'rem', reminderKind: 'passport_check' },
		'Comm',
		ESL_REMINDER_TITLES.passport_check,
		ranges.pcheck
	);
	ranged(
		'workbook_check',
		{ kind: 'rem', reminderKind: 'workbook_check' },
		'CLIL',
		ESL_REMINDER_TITLES.workbook_check,
		ranges.wcheck
	);

	for (const custom of payload.customs) {
		writes.push({ ...customWrite(custom), family: { kind: 'custom', id: custom.id } });
	}

	return writes;
}

/**
 * Deterministic mapping errors fail before any write — `events.create`
 * re-checks every row at insert, but by then the semester would already
 * exist. (Exclusivity against the DB needs no pre-check on create: the
 * semester is brand new, so only intra-batch collisions matter, and the
 * wizard gates forbid those at pick time. The reconcile validates the
 * merged final state separately.)
 */
function assertWizardWritesValid(writes: EventWrite[]): void {
	for (const event of writes) {
		const titleError = assertValidEslTitle(event.type, event.title, event.reminderKind);
		if (titleError !== null) throw new Error(describeEslEventError(titleError));
		const target = event.target ?? defaultTargetForEventType(event.type, event.reminderKind);
		const targetError = assertValidEslTarget(event.type, target, event.reminderKind);
		if (targetError !== null) throw new Error(describeEslEventError(targetError));
		const bounds = periodBoundsFor(event.type, {
			startPeriod: event.startPeriod,
			endPeriod: event.endPeriod
		});
		const fieldError = assertValidEslEvent({
			type: event.type,
			date: event.date,
			...(event.endDate === undefined ? {} : { endDate: event.endDate }),
			startPeriod: bounds.startPeriod,
			endPeriod: bounds.endPeriod,
			...(event.reminderKind === undefined ? {} : { reminderKind: event.reminderKind })
		});
		if (fieldError !== null) throw new Error(describeEslEventError(fieldError));
	}
}

export const saveSemester = action({
	args: { ...semesterPayloadArgs, e2eTag: v.optional(v.string()) },
	handler: async (
		ctx,
		args
	): Promise<{ semesterId: Id<'esl_semesters'>; eventIds: Id<'esl_events'>[] }> => {
		await ctx.runQuery(internal.esl.admin.checkEslAdmin, {});

		const duplicate = await ctx.runQuery(internal.esl.wizards.findByYearTerm, {
			year: args.year,
			term: args.term
		});
		if (duplicate !== null) {
			throw new Error(`${args.year} ${args.term} already exists.`);
		}

		const writes: EventWrite[] = buildWizardWrites(args).map(eventOf);
		assertWizardWritesValid(writes);

		const semesterId = await ctx.runMutation(api.esl.semesters.create, {
			year: args.year,
			term: args.term,
			startDate: args.startDate,
			...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
		});

		const eventIds: Id<'esl_events'>[] = [];
		for (const event of writes) {
			const created = await ctx.runMutation(api.esl.events.create, {
				semesterId,
				...event,
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
			if (Array.isArray(created)) eventIds.push(...created);
			else eventIds.push(created);
		}
		return { semesterId, eventIds };
	}
});

/** Step a `YYYY-MM-DD` date forward one calendar day (weekends count — a break is a break). */
function nextCalendarDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

function customWrite(custom: WizardSaveCustom): EventWrite {
	const text = (custom.note ?? custom.bannerText ?? '').trim();
	if (text === '') {
		throw new Error(`Custom event ${custom.id} needs text.`);
	}
	if (custom.type === 'banner') {
		if (custom.startDate === undefined || custom.endDate === undefined) {
			throw new Error(`Banner ${custom.id} needs a start and end date.`);
		}
		return {
			type: 'reminder',
			reminderKind: 'task',
			title: text,
			target: custom.target ?? 'all',
			date: custom.startDate,
			endDate: custom.endDate,
			note: text
		};
	}
	if (custom.date === undefined) {
		throw new Error(`Custom event ${custom.id} needs a date.`);
	}
	if (custom.subType === 'task') {
		return {
			type: 'reminder',
			reminderKind: 'task',
			title: text,
			target: custom.target ?? 'all',
			date: custom.date,
			note: text
		};
	}
	return {
		type: custom.subType ?? 'no_class',
		title: ESL_EVENT_TITLES.no_class,
		target: custom.target ?? 'all',
		date: custom.date,
		note: text
	};
}

/** Strip the reconcile-only family tag back to a plain `events.create` write. */
function eventOf(row: DesiredRow): EventWrite {
	return {
		type: row.type,
		...(row.reminderKind === undefined ? {} : { reminderKind: row.reminderKind }),
		title: row.title,
		...(row.target === undefined ? {} : { target: row.target }),
		date: row.date,
		...(row.endDate === undefined ? {} : { endDate: row.endDate }),
		...(row.note === undefined ? {} : { note: row.note }),
		...(row.startPeriod === undefined ? {} : { startPeriod: row.startPeriod }),
		...(row.endPeriod === undefined ? {} : { endPeriod: row.endPeriod })
	};
}

/**
 * Reconcile save for an existing semester (#253).
 *
 * The desired event set is built exactly as `saveSemester` builds it, then
 * diffed against the rows the semester already holds: matched rows patch
 * only when a wizard-owned field changed, new slots insert, and removed
 * wizard-owned rows delete — never touching checklist drafts
 * (`checklist.createMissing` output), holiday-import rows, or manually
 * edited rows. Ownership is shape-based (the decided rule): rows the
 * wizard's own write shapes can produce are matched family by family;
 * anything else is preserved byte-for-byte.
 *
 * Ambiguity is resolved toward preservation. Off days, G9 mock pairs, and
 * passport/recording reminders are shape-identical to checklist-draft and
 * import rows, so leftovers of those shapes survive a save even when the
 * wizard no longer names them (a deleted off day or mock pair lingers
 * until someone removes it by hand). Quiz rows (`Quiz N` titles — drafts
 * read `Unit N Quiz Due`), the locked single-note strings, and the check
 * reminders are unambiguously wizard-owned and do get removed.
 *
 * Exams and the graduation row are protected (`isProtectedSeedEvent`): a
 * payload that drops one refuses with the same error `events.remove`
 * raises, before anything is written. Exam groups are re-fanned with
 * `expandExamDays` over the effective off days — the payload's off days
 * plus every surviving foreign off day — so a moved anchor shifts its
 * whole group in place instead of deleting protected rows.
 *
 * The whole read-diff-apply runs in one internal mutation, so a failed
 * reconcile writes nothing and a successful one is atomic — unlike the
 * create save's sequential per-event mutations.
 *
 * cost: 1 semester read + 1 indexed take of the semester's events (tens of
 * rows) + pure diffing + 1 insert/patch/delete per changed row.
 */

/** The fields a reconcile patch may write; `undefined` removes the field. */
type EventPatchFields = {
	date?: string;
	endDate?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
};

/** A full row shape ready for `db.insert`. */
type NewEventRow = {
	type: EventWrite['type'];
	reminderKind?: EslReminderKind;
	isBanner?: boolean;
	title: string;
	target: EslEventTarget;
	date: string;
	endDate?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
	examGroup?: string;
	e2eTag?: string;
};

type ReconcilePlan = {
	inserts: NewEventRow[];
	patches: { id: Id<'esl_events'>; fields: EventPatchFields; title: string; date: string }[];
	deletes: { id: Id<'esl_events'>; title: string; date: string }[];
};

/** The change summary the edit wizard shows before confirming a save. */
export type ReconcileSummary = {
	added: number;
	changed: number;
	removed: number;
	startDateChanged: boolean;
	dryRun: boolean;
	addedEvents: { type: string; title: string; date: string }[];
	changedEvents: { eventId: Id<'esl_events'>; title: string; date: string }[];
	removedEvents: { eventId: Id<'esl_events'>; title: string; date: string }[];
};

/** The note a row carries once the hidden-note rule (#211, #216) is applied. */
function visibleNoteOf(row: {
	type: EslEventType;
	reminderKind?: EslReminderKind;
	note?: string;
}): string | undefined {
	return isNoteHiddenForEventType(row.type, row.reminderKind) ? undefined : row.note;
}

/**
 * The canonical shape a row is compared on: every field the wizard writes,
 * normalized the way `events.create` stores it (defaults filled, hidden
 * notes dropped). Identical keys mean the row is already exactly what the
 * wizard would write — the no-op guarantee.
 */
function rowKey(row: {
	type: EslEventType;
	reminderKind?: EslReminderKind;
	title: string;
	target?: EslEventTarget;
	date: string;
	endDate?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
	examGroup?: string;
}): string {
	return JSON.stringify({
		type: row.type,
		reminderKind: row.reminderKind ?? null,
		title: row.title,
		target: row.target ?? defaultTargetForEventType(row.type, row.reminderKind),
		date: row.date,
		endDate: row.endDate ?? null,
		note: visibleNoteOf(row) ?? null,
		startPeriod: row.startPeriod ?? null,
		endPeriod: row.endPeriod ?? null,
		examGroup: row.examGroup ?? null
	});
}

/** Day number for date distance (dates are zero-padded `YYYY-MM-DD`). */
function dayNumber(date: string): number {
	const [year, month, day] = date.split('-').map(Number);
	return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** Whether an existing row is a leftover only the wizard could have written. */
function isWizardLeftover(row: Doc<'esl_events'>): boolean {
	if (
		row.type === 'no_class' &&
		(row.note === ESL_LOCKED_NOTES.anniversary || row.note === ESL_LOCKED_NOTES.sportsDay)
	) {
		return true;
	}
	if (row.type === 'no_school' && row.note === ESL_LOCKED_NOTES.anniversaryMakeup) return true;
	if (row.type === 'partial' && row.note === ESL_LOCKED_NOTES.bbq) return true;
	if (row.type === 'reminder' && row.reminderKind === 'quiz' && /^Quiz \d+$/.test(row.title)) {
		return true;
	}
	return (
		row.type === 'reminder' &&
		(row.reminderKind === 'passport_check' || row.reminderKind === 'workbook_check')
	);
}

/** Whether an existing row can serve a desired row's family in phase 2. */
function matchesFamily(family: Family, desired: DesiredRow, row: Doc<'esl_events'>): boolean {
	switch (family.kind) {
		case 'start':
			return row.type === 'start_school';
		case 'off':
			// Off days are one per date (exclusivity), so the date is the
			// identity — never a nearest-date match that could steal a
			// foreign row from a neighbouring day.
			return row.type === 'no_school' && row.date === desired.date;
		case 'anniv':
			return row.type === 'no_class' && row.note === ESL_LOCKED_NOTES.anniversary;
		case 'makeup':
			return row.type === 'no_school' && row.note === ESL_LOCKED_NOTES.anniversaryMakeup;
		case 'sports':
			return row.type === 'no_class' && row.note === ESL_LOCKED_NOTES.sportsDay;
		case 'grad':
			return row.type === 'no_class' && row.note === ESL_LOCKED_NOTES.graduation;
		case 'bbq':
			return row.type === 'partial' && row.note === ESL_LOCKED_NOTES.bbq;
		case 'mock':
			return row.type === 'g9_mock' && row.title === ESL_EVENT_TITLES.g9_mock;
		case 'exam':
			return row.type === 'exam' && (row.examGroup ?? row.title) === family.title;
		case 'quiz':
			return row.type === 'reminder' && row.reminderKind === 'quiz' && row.title === family.title;
		case 'rem':
			return (
				row.type === 'reminder' &&
				row.reminderKind === family.reminderKind &&
				row.title === ESL_REMINDER_TITLES[family.reminderKind]
			);
		case 'custom':
			// Customs are never stored with their temp id, so the shape is the
			// identity: same type, kind, target, and text. A custom whose text
			// changed finds no old row and inserts fresh — the old row stays,
			// since it is indistinguishable from a manual one.
			return (
				row.type === desired.type &&
				row.reminderKind === desired.reminderKind &&
				row.target === desired.target &&
				row.title === desired.title &&
				visibleNoteOf(row) === visibleNoteOf(desired)
			);
	}
}

/** The fields a family owns — everything else on the row is left alone. */
function familyPatch(
	family: Family,
	desired: DesiredRow,
	row: Doc<'esl_events'>
): EventPatchFields {
	const fields: EventPatchFields = {};
	switch (family.kind) {
		case 'start':
			if (row.date !== desired.date) fields.date = desired.date;
			if (row.startPeriod !== desired.startPeriod) fields.startPeriod = desired.startPeriod;
			if (row.endPeriod !== desired.endPeriod) fields.endPeriod = desired.endPeriod;
			return fields;
		case 'off':
			if (row.note !== desired.note) fields.note = desired.note;
			return fields;
		case 'quiz':
		case 'rem':
		case 'custom':
			if (row.date !== desired.date) fields.date = desired.date;
			if (row.endDate !== desired.endDate) fields.endDate = desired.endDate;
			return fields;
		case 'exam':
		case 'anniv':
		case 'makeup':
		case 'sports':
		case 'grad':
		case 'bbq':
		case 'mock':
			if (row.date !== desired.date) fields.date = desired.date;
			return fields;
	}
}

/** The insert shape for a desired row with no existing counterpart. */
function desiredToNewRow(row: DesiredRow, e2eTag: string | undefined): NewEventRow {
	const note = visibleNoteOf(row);
	return {
		type: row.type,
		...(row.reminderKind === undefined ? {} : { reminderKind: row.reminderKind }),
		...(row.type === 'reminder' ? { isBanner: true } : {}),
		title: row.title,
		target: row.target ?? defaultTargetForEventType(row.type, row.reminderKind),
		date: row.date,
		...(row.endDate === undefined ? {} : { endDate: row.endDate }),
		...(note === undefined ? {} : { note }),
		...(row.startPeriod === undefined ? {} : { startPeriod: row.startPeriod }),
		...(row.endPeriod === undefined ? {} : { endPeriod: row.endPeriod }),
		...(row.examGroup === undefined ? {} : { examGroup: row.examGroup }),
		...(e2eTag === undefined ? {} : { e2eTag })
	};
}

/**
 * The exclusivity invariant over the merged final state, checked in one
 * pass instead of per write: no-school and exam days are exclusive (no
 * other row may share their date), reminders may only run their interior
 * over non-exam days, and partials stay one per date. Same refusals
 * `assertExclusive` raises on sequential writes — a wizard row moved onto
 * an occupied date fails loudly naming the date.
 */
function assertReconciledStateValid(
	rows: {
		type: EslEventType;
		reminderKind?: EslReminderKind;
		title: string;
		date: string;
		endDate?: string;
	}[]
): void {
	const byDate = new Map<string, typeof rows>();
	for (const row of rows) {
		const group = byDate.get(row.date) ?? [];
		group.push(row);
		byDate.set(row.date, group);
	}
	for (const [date, group] of byDate) {
		const exclusive = group.find((row) => row.type === 'no_school' || row.type === 'exam');
		if (exclusive !== undefined && group.length > 1) {
			throw new Error(
				`${date} already holds ${exclusive.type === 'no_school' ? 'a no-school day' : 'an exam'} (${exclusive.title}). No-school and exam days are exclusive — move one of them first.`
			);
		}
		if (group.filter((row) => row.type === 'partial').length > 1) {
			throw new Error(`${date} already has a partial day. Only one partial per date.`);
		}
	}
	// A reminder's interior dates may hold no exam (endpoints are already
	// covered by the exclusivity rule above).
	for (const row of rows) {
		if (row.type !== 'reminder' || row.endDate === undefined || row.endDate === row.date) {
			continue;
		}
		for (
			let cursor = nextCalendarDate(row.date);
			cursor < row.endDate;
			cursor = nextCalendarDate(cursor)
		) {
			const occupant = byDate.get(cursor)?.find((other) => other.type === 'exam');
			if (occupant !== undefined) {
				throw new Error(
					`${cursor} already holds an exam (${occupant.title}). No-school and exam days are exclusive — move one of them first.`
				);
			}
		}
	}
}

/**
 * Diff the desired event set against the existing rows. Pure: reads
 * nothing, writes nothing — the internal mutation feeds it the semester's
 * rows and applies the plan.
 */
function planReconcile(
	existing: Doc<'esl_events'>[],
	payload: WizardSavePayload,
	e2eTag: string | undefined
): ReconcilePlan {
	const desired = buildWizardWrites(payload);

	// One group per exam title is the invariant; a duplicated label in the
	// payload would otherwise silently merge two groups into one family.
	const examTitles = desired.filter((row) => row.type === 'exam').map((row) => row.title);
	if (new Set(examTitles).size !== examTitles.length) {
		throw new Error('Each exam may appear once in the payload — one group per exam.');
	}

	// The off days exam fans must skip: the payload's off days plus every
	// existing off day that survives the save (imports and drafts the
	// payload doesn't name — a fan must route around them exactly like the
	// original create did once they existed).
	const desiredOffDates = new Set(
		desired.filter((row) => row.type === 'no_school').map((row) => row.date)
	);
	const offDates = new Set(desiredOffDates);
	for (const row of existing) {
		if (row.type !== 'no_school') continue;
		// An 'Anniversary makeup' row the payload no longer names is a
		// wizard leftover headed for deletion — its date frees up.
		if (row.note === ESL_LOCKED_NOTES.anniversaryMakeup && !desiredOffDates.has(row.date)) continue;
		offDates.add(row.date);
	}

	// Expand exams and mocks to their final per-day rows.
	const desiredRows: DesiredRow[] = [];
	for (const row of desired) {
		if (row.type === 'exam') {
			const days = expandExamDays({
				startDate: row.date,
				dayCount: EXAM_SEED_WEEKDAYS[row.title] ?? 2,
				offDates
			});
			for (const date of days) {
				desiredRows.push({ ...row, date, examGroup: row.title });
			}
		} else if (row.type === 'g9_mock') {
			for (const date of g9MockDates(row.date)) {
				desiredRows.push({ ...row, date });
			}
		} else {
			desiredRows.push({ ...row });
		}
	}

	// Phase 1 — exact shape match: a row already holding precisely what the
	// wizard would write is untouched, whatever family claims it.
	const matched = new Set<Id<'esl_events'>>();
	const byKey = new Map<string, Doc<'esl_events'>[]>();
	for (const row of existing) {
		const pool = byKey.get(rowKey(row)) ?? [];
		pool.push(row);
		byKey.set(rowKey(row), pool);
	}
	const unmatchedDesired: DesiredRow[] = [];
	for (const row of desiredRows) {
		const match = byKey.get(rowKey(row))?.find((candidate) => !matched.has(candidate._id));
		if (match === undefined) {
			unmatchedDesired.push(row);
		} else {
			matched.add(match._id);
		}
	}

	// Phase 2 — family identity: an unmatched desired row adopts the
	// nearest unmatched row its family can own, and patches only the fields
	// that family writes.
	const inserts: NewEventRow[] = [];
	const patches: ReconcilePlan['patches'] = [];
	for (const row of unmatchedDesired) {
		const candidates = existing.filter(
			(candidate) => !matched.has(candidate._id) && matchesFamily(row.family, row, candidate)
		);
		const match = [...candidates].sort((a, b) => {
			const distance =
				Math.abs(dayNumber(a.date) - dayNumber(row.date)) -
				Math.abs(dayNumber(b.date) - dayNumber(row.date));
			return distance || a.date.localeCompare(b.date) || (a._id < b._id ? -1 : 1);
		})[0];
		if (match === undefined) {
			inserts.push(desiredToNewRow(row, e2eTag));
			continue;
		}
		matched.add(match._id);
		const fields = familyPatch(row.family, row, match);
		if (Object.keys(fields).length > 0) {
			patches.push({
				id: match._id,
				fields,
				title: match.title,
				date: fields.date ?? match.date
			});
		}
	}

	// Leftovers — rows no desired row claims. Protected rows refuse the
	// save (same gate `events.remove` runs); unambiguous wizard shapes are
	// removed; everything else survives.
	const deletes: ReconcilePlan['deletes'] = [];
	for (const row of existing) {
		if (matched.has(row._id)) continue;
		if (isProtectedSeedEvent(row)) {
			throw new Error(
				`${row.title} is protected against deletion — exams and the ceremony anchor the semester. Move it instead.`
			);
		}
		if (isWizardLeftover(row)) {
			deletes.push({ id: row._id, title: row.title, date: row.date });
		}
	}

	// Validate the merged final state before anything is written.
	const deleteIds = new Set(deletes.map((deleteRow) => deleteRow.id));
	const patchFieldsById = new Map(patches.map((patch) => [patch.id, patch.fields]));
	assertReconciledStateValid([
		...existing
			.filter((row) => !deleteIds.has(row._id))
			.map((row) => ({ ...row, ...(patchFieldsById.get(row._id) ?? {}) })),
		...inserts.map((row) => ({ ...row }))
	]);

	return { inserts, patches, deletes };
}

function summarize(
	plan: ReconcilePlan,
	startDateChanged: boolean,
	dryRun: boolean
): ReconcileSummary {
	return {
		added: plan.inserts.length,
		changed: plan.patches.length,
		removed: plan.deletes.length,
		startDateChanged,
		dryRun,
		addedEvents: plan.inserts.map((row) => ({ type: row.type, title: row.title, date: row.date })),
		changedEvents: plan.patches.map((patch) => ({
			eventId: patch.id,
			title: patch.title,
			date: patch.date
		})),
		removedEvents: plan.deletes.map((deleteRow) => ({
			eventId: deleteRow.id,
			title: deleteRow.title,
			date: deleteRow.date
		}))
	};
}

/**
 * The reconcile itself: read the semester's rows, diff, and apply — all in
 * one transaction, so a refused save writes nothing. Gated by the public
 * action's `checkEslAdmin` (internal mutations carry no user context).
 */
export const reconcileSemester = internalMutation({
	args: {
		...semesterPayloadArgs,
		semesterId: v.id('esl_semesters'),
		e2eTag: v.optional(v.string()),
		dryRun: v.optional(v.boolean())
	},
	handler: async (ctx, args): Promise<ReconcileSummary> => {
		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');
		if (semester.year !== args.year || semester.term !== args.term) {
			throw new Error(
				`${args.year} ${args.term} does not match this semester (${semester.year} ${semester.term}). Year and term are fixed once created.`
			);
		}

		const existing = await ctx.db
			.query('esl_events')
			.withIndex('by_semester', (q) => q.eq('semesterId', args.semesterId))
			.collect();
		const plan = planReconcile(existing, args, args.e2eTag);
		const startDateChanged = semester.startDate !== args.startDate;

		if (args.dryRun === true) {
			return summarize(plan, startDateChanged, true);
		}

		for (const deleteRow of plan.deletes) {
			await ctx.db.delete(deleteRow.id);
		}
		for (const patch of plan.patches) {
			await ctx.db.patch(patch.id, patch.fields);
		}
		for (const row of plan.inserts) {
			await ctx.db.insert('esl_events', { semesterId: args.semesterId, ...row });
		}
		if (startDateChanged) {
			await ctx.db.patch(args.semesterId, { startDate: args.startDate });
		}
		return summarize(plan, startDateChanged, false);
	}
});

/**
 * Update an existing semester from the edit wizard: same payload shape as
 * `saveSemester` plus the `semesterId`, reconciled instead of replaced.
 * Pass `dryRun: true` for the change summary the confirm step shows — it
 * validates and reports without writing.
 */
export const updateSemester = action({
	args: {
		...semesterPayloadArgs,
		semesterId: v.id('esl_semesters'),
		e2eTag: v.optional(v.string()),
		dryRun: v.optional(v.boolean())
	},
	handler: async (ctx, args): Promise<ReconcileSummary> => {
		await ctx.runQuery(internal.esl.admin.checkEslAdmin, {});
		return await ctx.runMutation(internal.esl.wizards.reconcileSemester, args);
	}
});
