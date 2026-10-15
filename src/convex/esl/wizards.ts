import { action, internalQuery } from '../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import { periodBoundsFor } from './events';
import {
	ESL_EVENT_TITLES,
	ESL_REMINDER_TITLES,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	defaultTargetForEventType,
	describeEslEventError,
	isValidEslDate,
	type EslEventTarget,
	type EslReminderKind
} from '../shared/esl';

/**
 * One-transaction semester save for the setup wizard (ticket #223, spec
 * #215 stories 27–30).
 *
 * The wizard writes NOTHING until Save: Step 2's holiday preview stages
 * off days into wizard state, Steps 3–4 only fill state, and this action
 * creates the semester (if new) then inserts every event sequentially via
 * `events.create` — each row re-validated there (locked titles/targets,
 * exam fan-out, exclusivity), so an invalid payload fails loudly naming
 * the date. Callers must keep wizard rows inside the UI gates
 * (refuse-by-construction), which makes mid-save failure unreachable in
 * practice; the duplicate-semester guard runs before the first write.
 *
 * cost: 1 duplicate lookup + 1 semester insert + 1 `events.create` (with
 * its own bounded lookups) per event — tens of sequential mutations.
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

const EXAM_TITLE: Record<'Exam 1' | 'Exam 2' | 'Final', string> = {
	'Exam 1': 'Exam 1',
	'Exam 2': 'Exam 2',
	Final: 'Final Exam'
};

export const saveSemester = action({
	args: {
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
		customs: v.array(customValidator),
		e2eTag: v.optional(v.string())
	},
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

		const writes: EventWrite[] = [];

		// The first-day window: P1–P2 read as no_class on the start date.
		writes.push({
			type: 'start_school',
			title: ESL_EVENT_TITLES.start_school,
			target: 'all',
			date: args.startDate,
			startPeriod: 1,
			endPeriod: 2
		});

		// Off days first: exam fan-out skips no_school days already in the DB.
		for (const day of args.offDays) {
			writes.push({
				type: 'no_school',
				title: ESL_EVENT_TITLES.no_school,
				target: 'all',
				date: day.date,
				note: day.name
			});
		}

		// Exams fan out from their start date inside `events.create`
		// (2/2/3 class days, examGroup = title).
		for (const exam of args.exams) {
			const start = exam.dates[0];
			if (start === undefined) continue;
			writes.push({ type: 'exam', title: EXAM_TITLE[exam.label], target: 'all', date: start });
		}

		if (args.singles.anniv !== null) {
			writes.push({
				type: 'no_class',
				title: ESL_EVENT_TITLES.no_class,
				target: 'all',
				date: args.singles.anniv,
				note: 'Anniversary'
			});
		}
		if (args.singles.makeup !== null) {
			writes.push({
				type: 'no_school',
				title: ESL_EVENT_TITLES.no_school,
				target: 'all',
				date: args.singles.makeup,
				note: 'Anniversary makeup'
			});
		}
		if (args.sportsOn && args.singles.sports !== null) {
			writes.push({
				type: 'no_class',
				title: ESL_EVENT_TITLES.no_class,
				target: 'all',
				date: args.singles.sports,
				note: 'Sports Day'
			});
		}
		if (args.singles.grad !== null) {
			writes.push({
				type: 'no_class',
				title: ESL_EVENT_TITLES.no_class,
				target: 'G9',
				date: args.singles.grad,
				note: 'Graduation'
			});
		}
		// BBQ (S1-only starter, folded from the seed): a partial afternoon —
		// endPeriod only, like the seed wrote it — with the occasion in the
		// note, since partial titles are locked.
		if (args.singles.bbq !== null) {
			writes.push({
				type: 'partial',
				title: ESL_EVENT_TITLES.partial,
				target: 'all',
				date: args.singles.bbq,
				endPeriod: 4,
				note: 'BBQ from 12:00'
			});
		}
		// Extra no-school days, one row per calendar day (weekends count —
		// a break is a break). Ranges refuse a backwards window; blank
		// names refuse with the field named.
		for (const extra of args.extras) {
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
					note: name
				});
			}
		}

		// G9 mocks fan out to their two consecutive days inside `events.create`.
		for (const pair of [args.pairs.mock1, args.pairs.mock2, args.pairs.mock3]) {
			const start = pair?.[0];
			if (start === undefined) continue;
			writes.push({
				type: 'g9_mock',
				title: ESL_EVENT_TITLES.g9_mock,
				target: 'G9',
				date: start
			});
		}

		const ranged = (
			kind: EslReminderKind,
			target: EslEventTarget,
			title: string,
			dates: string[] | null
		) => {
			if (dates === null || dates.length === 0) return;
			const first = dates[0] as string;
			const last = dates[dates.length - 1] as string;
			writes.push({
				type: 'reminder',
				reminderKind: kind,
				target,
				title,
				date: first,
				...(last === first ? {} : { endDate: last })
			});
		};
		const ranges = args.ranges;
		const quizIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
		// Quizzes keep free-text numbered titles (quiz kind allows them);
		// dues and checks carry their locked canonical titles — the window
		// badge on each row is what tells them apart.
		quizIds.forEach((id, i) => ranged('quiz', 'CLIL', `Quiz ${i + 1}`, ranges[id]));
		const passportIds = ['pd1', 'pd2', 'pd3'] as const;
		for (const id of passportIds) {
			ranged('passport', 'Comm', ESL_REMINDER_TITLES.passport, ranges[id]);
		}
		const recordingIds = ['rd1', 'rd2', 'rd3'] as const;
		for (const id of recordingIds) {
			ranged('recording', 'Comm', ESL_REMINDER_TITLES.recording, ranges[id]);
		}
		ranged('passport_check', 'Comm', ESL_REMINDER_TITLES.passport_check, ranges.pcheck);
		ranged('workbook_check', 'CLIL', ESL_REMINDER_TITLES.workbook_check, ranges.wcheck);

		for (const custom of args.customs as WizardSaveCustom[]) {
			writes.push(customWrite(custom));
		}

		// Deterministic mapping errors fail here, before the first write —
		// `events.create` re-checks every row at insert, but by then the
		// semester would already exist. (Exclusivity against the DB needs no
		// pre-check: the semester is brand new, so only intra-batch
		// collisions matter, and the wizard gates forbid those at pick time.)
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
