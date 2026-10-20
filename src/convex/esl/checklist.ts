import { mutation, query } from '../_generated/server';
import { v } from 'convex/values';
import { requireEslAdmin, requireEslStaff } from '../auth';
import {
	ESL_EVENT_TITLES,
	ESL_REMINDER_TITLES,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	checklistCacheYears,
	checklistWindow,
	deriveSemesterEnd,
	describeEslEventError,
	examGroupStarts,
	expectedG9MockStarts,
	expectedPassportRecordingCounts,
	expectedUnitQuizDrafts,
	isValidEslDate,
	offDayChecklist,
	planUnitQuizRanges,
	quizDraftForUnit,
	translateHolidayCaption,
	unitDraftForRange,
	unitNumbersForSemesterTerm,
	type EslDay,
	type EslEventTarget,
	type EslEventType,
	type EslReminderKind,
	type ScheduleEventInput,
	type ScheduleMeetingInput
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
		const ofReminderKind = (kind: EslReminderKind) =>
			events.filter((event) => event.type === 'reminder' && event.reminderKind === kind).length;
		const unitExpectation = expectedUnitQuizDrafts(semester.term);
		// Unit drafts are `Unit N` task-kind reminders in the #214/#216
		// convention — manual free-text reminders (custom titles, no
		// checklist entry) never match.
		const unitsPresent = events.filter(
			(event) =>
				event.type === 'reminder' &&
				event.reminderKind === 'task' &&
				/^unit \d+$/i.test(event.title)
		).length;
		const dues = expectedPassportRecordingCounts({
			term: semester.term,
			...(args.g9S2 === true ? { g9S2: true as const } : {})
		});
		const mockStarts = expectedG9MockStarts(semester.term);

		return {
			window,
			off: { expected: off.expected, present: off.present, missing: off.missing, ok: off.ok },
			quiz: { expected: unitExpectation.quizzes, present: ofReminderKind('quiz') },
			units: { expected: unitExpectation.units, present: unitsPresent },
			passport: { expected: dues.passport, present: ofReminderKind('passport') },
			recording: { expected: dues.recording, present: ofReminderKind('recording') },
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
	reminderKind?: EslReminderKind;
	isBanner?: boolean;
	title: string;
	target: EslEventTarget;
	date: string;
	endDate?: string;
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
 * Unit/quiz drafts land on the real #214 ranges (`planUnitQuizRanges` over
 * the semester's exam starts and class meetings); every other group steps
 * single placeholder dates back from the window end. G9 mocks go in
 * consecutive two-day pairs, like the seed. Every draft stays editable.
 *
 * cost: 1 semester read + reads `status` repeats + the year's cohorts,
 * classes, and meetings for the unit/quiz planner + 1 exclusivity lookup
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
			const ofReminderKind = (kind: EslReminderKind) =>
				events.filter((event) => event.type === 'reminder' && event.reminderKind === kind);
			const ofType = (type: string) => events.filter((event) => event.type === type);
			// Placeholder dates walk back from the window end; a colliding
			// candidate skips forward-earlier rather than failing the batch.
			const takeDates = (count: number, step = 1): string[] => {
				const dates: string[] = [];
				for (let cursor = window.end; cursor >= window.start && dates.length < count;) {
					dates.push(cursor);
					cursor = stepDate(cursor, -step);
				}
				return dates;
			};
			// The term's class meetings, as the #214 odd-unit median reads
			// them: every active class of an active cohort of the semester's
			// year (same scope `esl/schedule.teacherDays` filters per teacher).
			// Empty when nothing is timetabled yet — the planner falls back
			// to 7-day placeholders rather than guessing a week.
			const meetings: ScheduleMeetingInput[] = [];
			const cohorts = await ctx.db
				.query('esl_cohorts')
				.withIndex('by_year', (q) => q.eq('year', semester.year))
				.collect();
			for (const cohort of cohorts) {
				if (cohort.status !== 'active') continue;
				const classes = await ctx.db
					.query('esl_classes')
					.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
					.collect();
				for (const cls of classes) {
					if (cls.status !== 'active') continue;
					const rows = await ctx.db
						.query('esl_class_meetings')
						.withIndex('by_classId', (q) => q.eq('classId', cls._id))
						.collect();
					for (const row of rows) {
						if (row.year !== semester.year) continue;
						meetings.push({
							classId: cls._id,
							type: cls.type,
							cohortGrade: cohort.grade,
							day: row.day as EslDay,
							period: row.period
						});
					}
				}
			}
			const scheduleEvents: ScheduleEventInput[] = events.map((event) => ({
				type: event.type,
				title: event.title,
				target: event.target,
				date: event.date,
				...(event.endDate === undefined ? {} : { endDate: event.endDate }),
				...(event.note === undefined ? {} : { note: event.note }),
				...(event.startPeriod === undefined ? {} : { startPeriod: event.startPeriod }),
				...(event.endPeriod === undefined ? {} : { endPeriod: event.endPeriod }),
				...(event.reminderKind === undefined ? {} : { reminderKind: event.reminderKind }),
				...(event.isBanner === undefined ? {} : { isBanner: event.isBanner })
			}));
			// The six #214 ranges, aligned with the term's unit numbers:
			// odd positions from each term window's median week, even
			// positions from the 7 days before each exam start.
			const unitNumbers = unitNumbersForSemesterTerm(semester.term);
			const unitRanges = planUnitQuizRanges({
				term: semester.term,
				semesterStart: semester.startDate,
				examStarts: examGroupStarts(events),
				meetings,
				events: scheduleEvents,
				fallbackEnd: window.end
			});
			if (args.group === 'quiz') {
				const missingCount = Math.max(
					0,
					expectedUnitQuizDrafts(semester.term).quizzes - ofReminderKind('quiz').length
				);
				// Quiz n rides its unit's range (the views collapse it to the
				// last match date through the existing dues rule).
				unitNumbers.slice(0, missingCount).forEach((unitNumber, index) => {
					const range = unitRanges[index];
					if (range === undefined) return;
					const draft = quizDraftForUnit(unitNumber, range);
					drafts.push({
						type: draft.type,
						reminderKind: draft.reminderKind,
						isBanner: true,
						title: draft.title,
						target: draft.target,
						date: draft.date,
						endDate: draft.endDate
					});
				});
			} else if (args.group === 'units') {
				const present = ofReminderKind('task').filter((event) => /^unit \d+$/i.test(event.title));
				const missingCount = Math.max(
					0,
					expectedUnitQuizDrafts(semester.term).units - present.length
				);
				const firstUnit = unitNumbers[0] ?? 1;
				const start = firstUnit + present.length;
				for (let index = 0; index < missingCount; index += 1) {
					const unitNumber = start + index;
					const range = unitRanges[unitNumber - firstUnit];
					if (range === undefined) continue;
					const draft = unitDraftForRange(unitNumber, range);
					drafts.push({
						type: draft.type,
						reminderKind: draft.reminderKind,
						isBanner: true,
						title: draft.title,
						target: draft.target,
						date: draft.date,
						endDate: draft.endDate
					});
				}
			} else if (args.group === 'passport' || args.group === 'recording') {
				const dues = expectedPassportRecordingCounts({
					term: semester.term,
					...(args.g9S2 === true ? { g9S2: true as const } : {})
				});
				const want = args.group === 'passport' ? dues.passport : dues.recording;
				const kind: EslReminderKind = args.group === 'passport' ? 'passport' : 'recording';
				const have = ofReminderKind(kind).length;
				for (const date of takeDates(Math.max(0, want - have))) {
					drafts.push({
						type: 'reminder',
						reminderKind: kind,
						isBanner: true,
						title: ESL_REMINDER_TITLES[kind],
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
			const fieldError = assertValidEslEvent({
				type: draft.type,
				date: draft.date,
				...(draft.endDate === undefined ? {} : { endDate: draft.endDate }),
				...(draft.reminderKind === undefined ? {} : { reminderKind: draft.reminderKind }),
				...(draft.isBanner === undefined ? {} : { isBanner: draft.isBanner })
			});
			if (fieldError) throw new Error(describeEslEventError(fieldError));
			const titleError = assertValidEslTitle(draft.type, draft.title, draft.reminderKind);
			if (titleError) throw new Error(describeEslEventError(titleError));
			const targetError = assertValidEslTarget(draft.type, draft.target, draft.reminderKind);
			if (targetError) throw new Error(describeEslEventError(targetError));
			try {
				await assertExclusive(ctx, {
					semesterId: args.semesterId,
					type: draft.type,
					date: draft.date,
					...(draft.endDate === undefined ? {} : { endDate: draft.endDate })
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
				...(draft.reminderKind === undefined ? {} : { reminderKind: draft.reminderKind }),
				...(draft.type === 'reminder' ? { isBanner: draft.isBanner ?? true } : {}),
				title: draft.title,
				target: draft.target,
				date: draft.date,
				...(draft.endDate === undefined ? {} : { endDate: draft.endDate }),
				...(draft.note === undefined ? {} : { note: draft.note }),
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
			created.push(draft.date);
		}
		return { created, skipped };
	}
});
