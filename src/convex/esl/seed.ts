import { action, internalMutation, internalQuery, mutation } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { requireEslAdmin } from '../auth';
import {
	ESL_EVENT_TITLES,
	EXAM_SEED_WEEKDAYS,
	G9_MOCK_SEED_DAYS,
	assertValidEslEvent,
	assertValidEslTarget,
	assertValidEslTitle,
	defaultTargetForEventType,
	describeEslEventError,
	findLunarOffDays,
	isValidEslDate,
	suggestExamEndDate,
	translateHolidayCaption,
	weekdayDatesBetween,
	type EslEventTarget,
	type EslEventType,
	type EslReminderKind
} from '../shared/esl';
import { assertExclusive } from './events';

/**
 * Semester seed service (ticket #193): new semesters arrive pre-filled with
 * the S1/S2 draft sets from #184, so admins fill details instead of building
 * from blank. Seeded rows are ordinary events — edited through
 * `esl/events.update`, deleted through `esl/events.remove` (exams + ceremony
 * protected) — never a parallel structure.
 *
 * Reads/writes sit behind `requireEslAdmin`. The whole seed runs in one
 * mutation (atomic drafts: a collision throws before anything is written);
 * only the Taiwan-Calendar fetch is an action, writing the year-keyed cache
 * the seed reads at seed time (t185 §3).
 */

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

/** One draft row: the template's structure with its dates resolved. */
type SeedDraft = {
	type: EslEventType;
	reminderKind?: EslReminderKind;
	isBanner?: boolean;
	title: string;
	target: EslEventTarget;
	date: string;
	endDate?: string;
	examGroup?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
	provenance?: 'holiday_api' | 'admin_typed';
	unverified?: boolean;
};

/** The lunar festival each term resolves: Moon in S1's fall, Dragon Boat in S2's spring. */
const LUNAR_BY_TERM = {
	S1: { name: 'Moon Festival', caption: '中秋節' },
	S2: { name: 'Dragon Boat Festival', caption: '端午節' }
} as const;

/** The calendar year a term's lunar dates resolve in: S1's fall vs S2's spring. */
function lunarCalendarYear(schoolYear: string, term: 'S1' | 'S2'): string {
	const [first, second] = schoolYear.split('-');
	return term === 'S1' ? (first ?? schoolYear) : (second ?? schoolYear);
}

function checkDate(date: string): void {
	if (!isValidEslDate(date)) {
		throw new Error(`${date} is not a valid date. Use YYYY-MM-DD.`);
	}
}

/**
 * Seed a semester's draft rows: the S1/S2 sets from #184 with the auto rules
 * applied (exam weekday ends, lunar resolution).
 *
 * Weekend off days seed exactly one row (#207): the official calendar's own
 * rows (including `補假`) are authoritative, so no Friday-before makeup is
 * synthesized anywhere in this flow.
 *
 * Dates the template cannot know arrive as arguments — exam starts, event
 * dates, due windows — and groups left out are simply not seeded. Refuses to
 * run twice: seeding is once per semester, then admins edit or delete rows.
 *
 * cost: 1 semester read + 1 events existence check + 1 cache take + guard
 * lookups per draft + 1 insert per draft. One transaction — a collision
 * throws before anything is written.
 */
export const seed = mutation({
	args: {
		semesterId: v.id('esl_semesters'),
		examStarts: v.optional(
			v.object({
				exam1: v.optional(v.string()),
				exam2: v.optional(v.string()),
				final: v.optional(v.string())
			})
		),
		bbqDate: v.optional(v.string()),
		sportsDayDate: v.optional(v.string()),
		ceremonyDate: v.optional(v.string()),
		springBreakStart: v.optional(v.string()),
		springBreakEnd: v.optional(v.string()),
		anniversaryDate: v.optional(v.string()),
		moonFestivalDate: v.optional(v.string()),
		dragonBoatDate: v.optional(v.string()),
		extraOffs: v.optional(
			v.array(v.object({ date: v.string(), name: v.string(), note: v.optional(v.string()) }))
		),
		dueWindows: v.optional(
			v.array(
				v.object({
					reminderKind: reminderKindValidator,
					title: v.string(),
					target: v.optional(targetValidator),
					date: v.string(),
					endDate: v.optional(v.string()),
					note: v.optional(v.string()),
					isBanner: v.optional(v.boolean())
				})
			)
		),
		g9MockStarts: v.optional(v.array(v.string())),
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');

		const already = await ctx.db
			.query('esl_events')
			.withIndex('by_semester', (q) => q.eq('semesterId', args.semesterId))
			.first();
		if (already) {
			throw new Error('This semester already holds events. Seed once, then edit or delete rows.');
		}

		const drafts: SeedDraft[] = [];

		// Exams first, so an off day colliding with a range surfaces under the
		// exclusivity rule instead of silently preceding it.
		const examStarts: { title: 'Exam 1' | 'Exam 2' | 'Final Exam'; start?: string }[] = [
			{ title: 'Exam 1', start: args.examStarts?.exam1 },
			{ title: 'Exam 2', start: args.examStarts?.exam2 },
			{ title: 'Final Exam', start: args.examStarts?.final }
		];
		for (const exam of examStarts) {
			if (exam.start === undefined) continue;
			checkDate(exam.start);
			const count = EXAM_SEED_WEEKDAYS[exam.title] ?? 2;
			const dates = weekdayDatesBetween(exam.start, suggestExamEndDate(exam.start, count));
			dates.forEach((date, index) => {
				drafts.push({
					type: 'exam',
					title: exam.title,
					target: 'all',
					date,
					examGroup: exam.title,
					note: `Day ${index + 1} of ${dates.length}`
				});
			});
		}

		// Start-day partial on the semester anchor, from P3 (#184 seed set).
		// The title is locked (`No class`); the occasion names itself in the note.
		drafts.push({
			type: 'partial',
			title: ESL_EVENT_TITLES.partial,
			target: 'all',
			date: semester.startDate,
			startPeriod: 3,
			note: `First day of ${semester.term}`
		});

		if (args.bbqDate !== undefined) {
			checkDate(args.bbqDate);
			drafts.push({
				type: 'partial',
				title: ESL_EVENT_TITLES.partial,
				target: 'all',
				date: args.bbqDate,
				endPeriod: 4,
				note: 'BBQ from 12:00'
			});
		}

		if (args.sportsDayDate !== undefined) {
			checkDate(args.sportsDayDate);
			drafts.push({
				type: 'no_class',
				title: ESL_EVENT_TITLES.no_class,
				target: 'all',
				date: args.sportsDayDate,
				note: "Sport's Day"
			});
		}

		if (args.ceremonyDate !== undefined) {
			checkDate(args.ceremonyDate);
			// The note must keep matching /graduation|ceremony/i — the S2 G9
			// cutoff `teacherDays` anchors on (titles are locked). Per-type
			// gating (#212) locks no-class days to All, so the whole school
			// shares the day rather than G9 alone.
			drafts.push({
				type: 'no_class',
				title: ESL_EVENT_TITLES.no_class,
				target: 'all',
				date: args.ceremonyDate,
				note: 'Graduation ceremony'
			});
		}

		for (const mockStart of args.g9MockStarts ?? []) {
			checkDate(mockStart);
			// Fixed two-day g9_mock+G9 ranges — never exam-typed, so the term
			// calculation stays safe (#184 constraints).
			const [first, second] = [mockStart, nextCalendarDate(mockStart)];
			[first, second].forEach((date, index) => {
				drafts.push({
					type: 'g9_mock',
					title: ESL_EVENT_TITLES.g9_mock,
					target: 'G9',
					date,
					note: `Day ${index + 1} of ${G9_MOCK_SEED_DAYS}`
				});
			});
		}

		if (args.springBreakStart !== undefined || args.springBreakEnd !== undefined) {
			if (args.springBreakStart === undefined || args.springBreakEnd === undefined) {
				throw new Error('Spring break needs both a start and an end date.');
			}
			checkDate(args.springBreakStart);
			checkDate(args.springBreakEnd);
			if (args.springBreakEnd < args.springBreakStart) {
				throw new Error(
					`The spring break end ${args.springBreakEnd} is before its start ${args.springBreakStart}.`
				);
			}
			// A vacation block: one no-school row per calendar day, no makeup
			// rows — weekends inside a break need no Friday-before suggestion.
			for (
				let date = args.springBreakStart;
				date <= args.springBreakEnd;
				date = nextCalendarDate(date)
			) {
				drafts.push({
					type: 'no_school',
					title: ESL_EVENT_TITLES.no_school,
					target: 'all',
					date,
					note: 'Spring break'
				});
			}
		}

		if (args.anniversaryDate !== undefined) {
			checkDate(args.anniversaryDate);
			drafts.push({
				type: 'no_class',
				title: ESL_EVENT_TITLES.no_class,
				target: 'all',
				date: args.anniversaryDate,
				note: 'Anniversary'
			});
		}

		// Lunar no-school days: explicit admin-typed date, else the holiday cache.
		const festival = LUNAR_BY_TERM[semester.term];
		const explicitLunar = semester.term === 'S1' ? args.moonFestivalDate : args.dragonBoatDate;
		const unresolvedLunar: string[] = [];
		if (explicitLunar !== undefined) {
			checkDate(explicitLunar);
			drafts.push({
				type: 'no_school',
				title: ESL_EVENT_TITLES.no_school,
				target: 'all',
				date: explicitLunar,
				provenance: 'admin_typed',
				unverified: true,
				note: `${festival.name} — admin-typed date, unverified against the national calendar.`
			});
		} else {
			const calendarYear = lunarCalendarYear(semester.year, semester.term);
			const cached = await ctx.db
				.query('esl_holiday_cache')
				.withIndex('by_year', (q) => q.eq('year', calendarYear))
				.collect();
			const cluster = findLunarOffDays(
				cached.map((row) => ({ date: row.date, isHoliday: row.isHoliday, caption: row.caption })),
				festival.caption
			);
			if (cluster.length === 0) {
				unresolvedLunar.push(festival.name);
			}
			for (const day of cluster) {
				checkDate(day.date);
				drafts.push({
					type: 'no_school',
					title: ESL_EVENT_TITLES.no_school,
					target: 'all',
					date: day.date,
					provenance: 'holiday_api',
					note: `${festival.name} — ${day.caption} (Taiwan Calendar ${calendarYear})`
				});
			}
		}

		for (const off of args.extraOffs ?? []) {
			checkDate(off.date);
			const name = off.name.trim();
			if (name === '') throw new Error('An extra no-school day needs a name for its note.');
			drafts.push({
				type: 'no_school',
				title: ESL_EVENT_TITLES.no_school,
				target: 'all',
				date: off.date,
				note:
					off.note === undefined || off.note.trim() === '' ? name : `${name} — ${off.note.trim()}`
			});
		}

		for (const due of args.dueWindows ?? []) {
			checkDate(due.date);
			if (due.endDate !== undefined) checkDate(due.endDate);
			const title = due.title.trim();
			const titleError = assertValidEslTitle('reminder', title, due.reminderKind);
			if (titleError) throw new Error(describeEslEventError(titleError));
			drafts.push({
				type: 'reminder',
				reminderKind: due.reminderKind,
				isBanner: due.isBanner ?? true,
				title,
				target: due.target ?? defaultTargetForEventType('reminder', due.reminderKind),
				date: due.date,
				...(due.endDate === undefined ? {} : { endDate: due.endDate }),
				...(due.note === undefined || due.note.trim() === '' ? {} : { note: due.note.trim() })
			});
		}

		// Write every draft under the same guards `events.create` enforces.
		// A collision throws, atomically, before anything is written.
		const created: Id<'esl_events'>[] = [];
		for (const draft of drafts) {
			const fieldError = assertValidEslEvent({
				type: draft.type,
				date: draft.date,
				endDate: draft.endDate,
				startPeriod: draft.startPeriod,
				endPeriod: draft.endPeriod,
				...(draft.reminderKind === undefined ? {} : { reminderKind: draft.reminderKind }),
				...(draft.isBanner === undefined ? {} : { isBanner: draft.isBanner })
			});
			if (fieldError) throw new Error(describeEslEventError(fieldError));
			const titleError = assertValidEslTitle(draft.type, draft.title, draft.reminderKind);
			if (titleError) throw new Error(describeEslEventError(titleError));
			const targetError = assertValidEslTarget(draft.type, draft.target, draft.reminderKind);
			if (targetError) throw new Error(describeEslEventError(targetError));

			if (draft.type === 'partial') {
				const sameDay = await ctx.db
					.query('esl_events')
					.withIndex('by_semester_date', (q) =>
						q.eq('semesterId', args.semesterId).eq('date', draft.date)
					)
					.collect();
				if (sameDay.some((event) => event.type === 'partial')) {
					throw new Error(`${draft.date} already has a partial day. Only one partial per date.`);
				}
			}

			await assertExclusive(ctx, {
				semesterId: args.semesterId,
				type: draft.type,
				date: draft.date,
				endDate: draft.endDate
			});

			const id = await ctx.db.insert('esl_events', {
				semesterId: args.semesterId,
				type: draft.type,
				...(draft.reminderKind === undefined ? {} : { reminderKind: draft.reminderKind }),
				...(draft.type === 'reminder' ? { isBanner: draft.isBanner ?? true } : {}),
				title: draft.title,
				target: draft.target,
				date: draft.date,
				...(draft.endDate === undefined ? {} : { endDate: draft.endDate }),
				...(draft.examGroup === undefined ? {} : { examGroup: draft.examGroup }),
				...(draft.note === undefined ? {} : { note: draft.note }),
				...(draft.startPeriod === undefined ? {} : { startPeriod: draft.startPeriod }),
				...(draft.endPeriod === undefined ? {} : { endPeriod: draft.endPeriod }),
				...(draft.provenance === undefined ? {} : { provenance: draft.provenance }),
				...(draft.unverified === undefined ? {} : { unverified: draft.unverified }),
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
			created.push(id);
		}

		return { created, unresolvedLunar };
	}
});

/** Step a `YYYY-MM-DD` date forward one calendar day (seed-local; weekends count). */
function nextCalendarDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

type HolidayApiRecord = {
	date: string;
	isHoliday: boolean;
	caption: string;
};

/**
 * Fetch one calendar year from the Taiwan Calendar API into the year-keyed
 * cache (t185 §1/§3): slashed URL (bare path 301s), no auth, 2 req/s limit
 * (one GET per call — no spacing needed within a call).
 *
 * An unsupported year (structured 404, e.g. 2028 today) or an unreachable
 * API throws toward the admin-typed fallback — seed with explicit lunar
 * dates, flagged unverified — rather than failing setup.
 */
export const fetchTaiwanCalendarYear = action({
	args: { calendarYear: v.string() },
	handler: async (ctx, args) => {
		// Actions carry no db handle for the gate — run it as a query so the
		// fetch stays behind the same ESL-admin rule as the seed mutation.
		await ctx.runQuery(internal.esl.seed.checkEslAdmin, {});

		if (!/^\d{4}$/.test(args.calendarYear)) {
			throw new Error(`${args.calendarYear} is not a calendar year. Use YYYY.`);
		}

		let response: Response;
		try {
			response = await fetch(`https://api.pin-yi.me/taiwan-calendar/${args.calendarYear}/`);
		} catch {
			throw new Error(
				`Taiwan Calendar API unreachable for ${args.calendarYear}. Seed with admin-typed dates instead (flagged unverified).`
			);
		}
		if (!response.ok) {
			throw new Error(
				`Taiwan Calendar has no ${args.calendarYear} data (HTTP ${response.status}). Seed with admin-typed dates instead (flagged unverified).`
			);
		}

		const payload: unknown = await response.json();
		if (!Array.isArray(payload)) {
			throw new Error(
				`Taiwan Calendar has no ${args.calendarYear} data yet. Seed with admin-typed dates instead (flagged unverified).`
			);
		}
		const rows: HolidayApiRecord[] = payload.map((record) => parseHolidayRecord(record));

		await ctx.runMutation(internal.esl.seed.saveHolidayRows, {
			year: args.calendarYear,
			rows,
			fetchedAt: Date.now()
		});
		return {
			year: args.calendarYear,
			days: rows.length,
			holidays: rows.filter((row) => row.isHoliday).length
		};
	}
});

/** Narrow one API day-row; throws on a shape the seed cannot use. */
function parseHolidayRecord(record: unknown): HolidayApiRecord {
	if (typeof record !== 'object' || record === null) {
		throw new Error('Taiwan Calendar returned an unreadable day row.');
	}
	const { date, isHoliday, caption } = record as {
		date?: unknown;
		isHoliday?: unknown;
		caption?: unknown;
	};
	if (typeof date !== 'string' || typeof isHoliday !== 'boolean') {
		throw new Error('Taiwan Calendar returned an unreadable day row.');
	}
	return { date, isHoliday, caption: typeof caption === 'string' ? caption : '' };
}

/**
 * The action's auth gate: actions carry no db handle for `requireEslAdmin`,
 * so the fetch runs this query first and stays behind the same rule.
 */
export const checkEslAdmin = internalQuery({
	args: {},
	handler: async (ctx) => {
		await requireEslAdmin(ctx);
		return { ok: true as const };
	}
});

/**
 * Replace a year's cache rows wholesale (stale provisional years refresh
 * rather than merge). Internal — only the fetch action writes the cache.
 */
export const saveHolidayRows = internalMutation({
	args: {
		year: v.string(),
		rows: v.array(v.object({ date: v.string(), isHoliday: v.boolean(), caption: v.string() })),
		fetchedAt: v.number()
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('esl_holiday_cache')
			.withIndex('by_year', (q) => q.eq('year', args.year))
			.collect();
		for (const row of existing) {
			await ctx.db.delete(row._id);
		}
		for (const row of args.rows) {
			await ctx.db.insert('esl_holiday_cache', {
				year: args.year,
				date: row.date,
				isHoliday: row.isHoliday,
				caption: row.caption,
				needsTranslation: translateHolidayCaption(row.caption).needsTranslation,
				fetchedAt: args.fetchedAt
			});
		}
		return { year: args.year, days: args.rows.length };
	}
});
