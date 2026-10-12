import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	ESL_EVENT_TITLES,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	checklistCacheYears,
	checklistWindow,
	deriveSemesterEnd,
	describeEslEventError,
	expectedG9MockStarts,
	expectedPassportRecordingCounts,
	expectedUnitQuizDrafts,
	isValidEslDate,
	offDayChecklist,
	translateHolidayCaption,
	type EslEventTarget,
	type EslEventType
} from '../shared/esl';
import { assertExclusive } from './events';

/**
 * Advisory checklist panel (ticket #213): four expected-default groups with
 * ✓/⚠ counts plus one-click create (see `createMissing` below). Advisory
 * only — this module never refuses a write; exclusivity and per-type gates
 * stay in `esl/events`. Task items stay manual-only (free-text title, no
 * checklist entry).
 */

/**
 * A semester's checklist state: the advisory window plus present/expected
 * counts per group. `today` rides in as `YYYY-MM-DD` (same lexical rule as
 * the detail page) so the query never reads the wall clock.
 *
 * cost: 1 semester read + 1 events take + 1 cache take per spanned year.
 */
export const status = query({
	args: {
		semesterId: v.id('esl_semesters'),
		today: v.string(),
		g9S2: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');

		const events = await ctx.db
			.query('esl_events')
			.withIndex('by_semester', (q) => q.eq('semesterId', args.semesterId))
			.collect();
		const window = checklistWindow(
			semester.startDate,
			deriveSemesterEnd(events.filter((event) => event.type === 'exam').map((event) => event.date)),
			args.today
		);

		const cacheRows: { date: string; isHoliday: boolean; caption: string }[] = [];
		for (const year of checklistCacheYears(semester.term, semester.startDate)) {
			const rows = await ctx.db
				.query('esl_holiday_cache')
				.withIndex('by_year', (q) => q.eq('year', year))
				.collect();
			cacheRows.push(...rows);
		}
		const off = offDayChecklist(
			cacheRows,
			events.map((event) => ({ type: event.type, date: event.date })),
			window
		);

		const ofType = (type: string) => events.filter((event) => event.type === type).length;
		const unitExpectation = expectedUnitQuizDrafts(semester.term);
		// Unit drafts are the stub's own `Unit N test` tasks (#214 owns the
		// real windows) — manual free-text tasks never count toward them.
		const unitsPresent = events.filter(
			(event) => event.type === 'task' && /^unit \d+ test$/i.test(event.title)
		).length;
		const dues = expectedPassportRecordingCounts({
			term: semester.term,
			...(args.g9S2 === true ? { g9S2: true as const } : {})
		});
		const mockStarts = expectedG9MockStarts(semester.term);

		return {
			window,
			off: { expected: off.expected, present: off.present, missing: off.missing, ok: off.ok },
			quiz: { expected: unitExpectation.quizzes, present: ofType('quiz') },
			units: { expected: unitExpectation.units, present: unitsPresent },
			passport: { expected: dues.passport, present: ofType('passport_due') },
			recording: { expected: dues.recording, present: ofType('recording_due') },
			g9mock: {
				expectedStarts: mockStarts,
				expectedRows: mockStarts * 2,
				presentRows: ofType('g9_mock')
			}
		};
	}
});

/** Step a `YYYY-MM-DD` date by a signed number of calendar days. */
function stepDate(date: string, deltaDays: number): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + deltaDays, 12)).toISOString().slice(0, 10);
}

type ChecklistDraft = {
	type: EslEventType;
	title: string;
	target: EslEventTarget;
	date: string;
	note?: string;
};

const groupValidator = v.union(
	v.literal('off'),
	v.literal('quiz'),
	v.literal('units'),
	v.literal('passport'),
	v.literal('recording'),
	v.literal('g9mock')
);

/**
 * One-click create for one checklist group (ticket #213). Fills exactly
 * what `status` reports missing — nothing more — and stays advisory:
 * exclusivity collisions (an exam landed since the panel rendered) skip
 * with a report instead of failing the batch.
 *
 * Placeholder dates step back from the window end (#214 owns the real
 * unit/quiz windows; every draft stays editable). G9 mocks go in
 * consecutive two-day pairs, like the seed.
 *
 * cost: 1 semester read + reads `status` repeats + 1 exclusivity lookup
 * and 1 insert per created row.
 */
export const createMissing = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		today: v.string(),
		group: groupValidator,
		g9S2: v.optional(v.boolean()),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);
		if (!isValidEslDate(args.today)) {
			throw new Error(`${args.today} is not a valid date. Use YYYY-MM-DD.`);
		}

		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');

		const events = await ctx.db
			.query('esl_events')
			.withIndex('by_semester', (q) => q.eq('semesterId', args.semesterId))
			.collect();
		const window = checklistWindow(
			semester.startDate,
			deriveSemesterEnd(events.filter((event) => event.type === 'exam').map((event) => event.date)),
			args.today
		);

		const drafts: ChecklistDraft[] = [];
		if (args.group === 'off') {
			const cacheRows: { date: string; isHoliday: boolean; caption: string }[] = [];
			for (const year of checklistCacheYears(semester.term, semester.startDate)) {
				const rows = await ctx.db
					.query('esl_holiday_cache')
					.withIndex('by_year', (q) => q.eq('year', year))
					.collect();
				cacheRows.push(...rows);
			}
			const captionOf = new Map(
				cacheRows.map((row) => [row.date.replace(/-/g, ''), row.caption] as const)
			);
			const missing = offDayChecklist(
				cacheRows,
				events.map((event) => ({ type: event.type, date: event.date })),
				window
			).missing;
			for (const date of missing) {
				const caption = captionOf.get(date.replace(/-/g, '')) ?? '';
				const english = caption.trim() === '' ? '' : translateHolidayCaption(caption).english;
				drafts.push({
					type: 'no_school',
					title: ESL_EVENT_TITLES.no_school,
					target: 'all',
					date,
					...(english === '' ? {} : { note: english })
				});
			}
		} else {
			const ofType = (type: string) => events.filter((event) => event.type === type);
			// Placeholder dates walk back from the window end; a colliding
			// candidate skips forward-earlier rather than failing the batch.
			const takeDates = (count: number, step = 1): string[] => {
				const dates: string[] = [];
				for (let cursor = window.end; cursor >= window.start && dates.length < count; ) {
					dates.push(cursor);
					cursor = stepDate(cursor, -step);
				}
				return dates;
			};
			if (args.group === 'quiz') {
				const missingCount = Math.max(
					0,
					expectedUnitQuizDrafts(semester.term).quizzes - ofType('quiz').length
				);
				for (const date of takeDates(missingCount)) {
					drafts.push({ type: 'quiz', title: ESL_EVENT_TITLES.quiz, target: 'CLIL', date });
				}
			} else if (args.group === 'units') {
				const present = ofType('task').filter((event) => /^unit \d+ test$/i.test(event.title));
				const missingCount = Math.max(
					0,
					expectedUnitQuizDrafts(semester.term).units - present.length
				);
				const start = present.length + 1;
				takeDates(missingCount).forEach((date, index) => {
					drafts.push({ type: 'task', title: `Unit ${start + index} test`, target: 'all', date });
				});
			} else if (args.group === 'passport' || args.group === 'recording') {
				const dues = expectedPassportRecordingCounts({
					term: semester.term,
					...(args.g9S2 === true ? { g9S2: true as const } : {})
				});
				const want = args.group === 'passport' ? dues.passport : dues.recording;
				const have = ofType(args.group === 'passport' ? 'passport_due' : 'recording_due').length;
				const type = args.group === 'passport' ? 'passport_due' : 'recording_due';
				for (const date of takeDates(Math.max(0, want - have))) {
					drafts.push({
						type,
						title: ESL_EVENT_TITLES[type],
						target: 'Comm',
						date
					});
				}
			} else {
				const have = ofType('g9_mock').length;
				const wantRows = expectedG9MockStarts(semester.term) * 2 - have;
				// Pairs walk back two days at a time: (end-1, end), (end-3, end-2), …
				for (
					let cursor = stepDate(window.end, -1), made = 0;
					cursor >= window.start && made < wantRows;
					cursor = stepDate(cursor, -2)
				) {
					const second = stepDate(cursor, 1);
					if (second > window.end) continue;
					for (const date of [cursor, second]) {
						if (made >= wantRows) break;
						drafts.push({
							type: 'g9_mock',
							title: ESL_EVENT_TITLES.g9_mock,
							target: 'G9',
							date
						});
						made += 1;
					}
				}
			}
		}

		// Same guards `events.create` enforces (field + title + target +
		// exclusivity). A draft this module built is valid by construction,
		// so a validation throw is a bug and fails loudly; an exclusivity
		// collision is a race the panel lost and skips with a report.
		const created: string[] = [];
		const skipped: string[] = [];
		for (const draft of drafts) {
			const fieldError = assertValidEslEvent({ type: draft.type, date: draft.date });
			if (fieldError) throw new Error(describeEslEventError(fieldError));
			const titleError = assertValidEslTitle(draft.type, draft.title);
			if (titleError) throw new Error(describeEslEventError(titleError));
			const targetError = assertValidEslTarget(draft.type, draft.target);
			if (targetError) throw new Error(describeEslEventError(targetError));
			try {
				await assertExclusive(ctx, {
					semesterId: args.semesterId,
					type: draft.type,
					date: draft.date
				});
			} catch (error) {
				skipped.push(
					`${draft.date} skipped: ${error instanceof Error ? error.message : 'date unavailable'}`
				);
				continue;
			}
			await ctx.db.insert('esl_events', {
				semesterId: args.semesterId,
				type: draft.type,
				title: draft.title,
				target: draft.target,
				date: draft.date,
				...(draft.note === undefined ? {} : { note: draft.note }),
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
			created.push(draft.date);
		}
		return { created, skipped };
	}
});
