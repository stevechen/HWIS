import { action, internalMutation, internalQuery, mutation } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { requireEslAdmin } from '../auth';
import {
	EXAM_SEED_WEEKDAYS,
	G9_MOCK_SEED_DAYS,
	assertValidEslEvent,
	describeEslEventError,
	findLunarOffDays,
	fridayBeforeDate,
	isValidEslDate,
	isWeekendEslDate,
	suggestExamEndDate,
	weekdayDatesBetween,
	type EslEventTarget,
	type EslEventType
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

const dueTypeValidator = v.union(
	v.literal('task_due'),
	v.literal('homework_due'),
	v.literal('quiz')
);

const targetValidator = v.union(
	v.literal('all'),
	v.literal('CLIL'),
	v.literal('Comm'),
	v.literal('G9')
);

/** One draft row: the template's structure with its dates resolved. */
type SeedDraft = {
	type: EslEventType;
	label: string;
	target: EslEventTarget;
	date: string;
	endDate?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
	provenance?: 'holiday_api' | 'admin_typed';
	unverified?: boolean;
};

/** The lunar festival each term resolves: Moon in S1's fall, Dragon Boat in S2's spring. */
const LUNAR_BY_TERM = {
	S1: { label: 'Moon Festival', caption: '中秋節' },
	S2: { label: 'Dragon Boat Festival', caption: '端午節' }
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
 * The Friday-before makeup suggestion for a weekend off day (#184
 * resolution). Monday-after also occurs in the data, so the row is an
 * editable suggestion — and a suggestion that collides is skipped with a
 * report rather than failing the whole seed.
 */
function makeupDraftFor(label: string, date: string): SeedDraft | null {
	if (!isWeekendEslDate(date)) return null;
	return {
		type: 'off',
		label: `${label} (makeup)`,
		target: 'all',
		date: fridayBeforeDate(date),
		note: `Suggested makeup for ${label} on ${date}, which falls on a weekend — adjust as needed.`
	};
}

/**
 * Seed a semester's draft rows: the S1/S2 sets from #184 with the auto rules
 * applied (exam weekday ends, Friday-before makeups, lunar resolution).
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
			v.array(v.object({ date: v.string(), label: v.string(), note: v.optional(v.string()) }))
		),
		dueWindows: v.optional(
			v.array(
				v.object({
					type: dueTypeValidator,
					label: v.string(),
					target: v.optional(targetValidator),
					date: v.string(),
					endDate: v.optional(v.string()),
					note: v.optional(v.string())
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
		const makeupOf = new Map<SeedDraft, { forDate: string; label: string }>();
		const trackMakeup = (draft: SeedDraft, forDate: string, label: string) => {
			drafts.push(draft);
			makeupOf.set(draft, { forDate, label });
		};

		// Exams first, so an off day colliding with a range surfaces under the
		// exclusivity rule instead of silently preceding it.
		const examStarts: { label: 'Exam 1' | 'Exam 2' | 'Final exam'; start?: string }[] = [
			{ label: 'Exam 1', start: args.examStarts?.exam1 },
			{ label: 'Exam 2', start: args.examStarts?.exam2 },
			{ label: 'Final exam', start: args.examStarts?.final }
		];
		for (const exam of examStarts) {
			if (exam.start === undefined) continue;
			checkDate(exam.start);
			const count = EXAM_SEED_WEEKDAYS[exam.label] ?? 2;
			const dates = weekdayDatesBetween(exam.start, suggestExamEndDate(exam.start, count));
			dates.forEach((date, index) => {
				drafts.push({
					type: 'exam',
					label: exam.label,
					target: 'all',
					date,
					note: `Day ${index + 1} of ${dates.length}`
				});
			});
		}

		// Start-day partial on the semester anchor, from P3 (#184 seed set).
		drafts.push({
			type: 'partial',
			label: `First day of ${semester.term}`,
			target: 'all',
			date: semester.startDate,
			startPeriod: 3
		});

		if (args.bbqDate !== undefined) {
			checkDate(args.bbqDate);
			drafts.push({
				type: 'partial',
				label: 'BBQ',
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
				label: "Sport's Day",
				target: 'all',
				date: args.sportsDayDate
			});
		}

		if (args.ceremonyDate !== undefined) {
			checkDate(args.ceremonyDate);
			// The label must keep matching /graduation|ceremony/i — the S2 G9
			// cutoff `teacherDays` anchors on.
			drafts.push({
				type: 'no_class',
				label: 'Graduation ceremony',
				target: 'G9',
				date: args.ceremonyDate
			});
		}

		for (const mockStart of args.g9MockStarts ?? []) {
			checkDate(mockStart);
			// Fixed two-day no_class+G9 ranges — never exam-typed, so the term
			// calculation stays safe (#184 constraints).
			const [first, second] = [mockStart, nextCalendarDate(mockStart)];
			[first, second].forEach((date, index) => {
				drafts.push({
					type: 'no_class',
					label: 'G9 mock',
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
			// A vacation block: one off row per calendar day, no makeup rows —
			// weekends inside a break need no Friday-before suggestion.
			for (
				let date = args.springBreakStart;
				date <= args.springBreakEnd;
				date = nextCalendarDate(date)
			) {
				drafts.push({ type: 'off', label: 'Spring break', target: 'all', date });
			}
		}

		if (args.anniversaryDate !== undefined) {
			checkDate(args.anniversaryDate);
			drafts.push({
				type: 'no_class',
				label: 'Anniversary',
				target: 'all',
				date: args.anniversaryDate
			});
			const makeup = makeupDraftFor('Anniversary', args.anniversaryDate);
			if (makeup) trackMakeup(makeup, args.anniversaryDate, 'Anniversary');
		}

		// Lunar off days: explicit admin-typed date, else the holiday cache.
		const festival = LUNAR_BY_TERM[semester.term];
		const explicitLunar = semester.term === 'S1' ? args.moonFestivalDate : args.dragonBoatDate;
		const unresolvedLunar: string[] = [];
		if (explicitLunar !== undefined) {
			checkDate(explicitLunar);
			drafts.push({
				type: 'off',
				label: festival.label,
				target: 'all',
				date: explicitLunar,
				provenance: 'admin_typed',
				unverified: true,
				note: 'Admin-typed date — unverified against the national calendar.'
			});
			const makeup = makeupDraftFor(festival.label, explicitLunar);
			if (makeup) trackMakeup(makeup, explicitLunar, festival.label);
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
				unresolvedLunar.push(festival.label);
			}
			for (const day of cluster) {
				checkDate(day.date);
				drafts.push({
					type: 'off',
					label: festival.label,
					target: 'all',
					date: day.date,
					provenance: 'holiday_api',
					note: `${day.caption} (Taiwan Calendar ${calendarYear})`
				});
				const makeup = makeupDraftFor(festival.label, day.date);
				if (makeup) trackMakeup(makeup, day.date, festival.label);
			}
		}

		for (const off of args.extraOffs ?? []) {
			checkDate(off.date);
			const label = off.label.trim();
			if (label === '') throw new Error('An event label is required.');
			drafts.push({
				type: 'off',
				label,
				target: 'all',
				date: off.date,
				...(off.note === undefined || off.note.trim() === '' ? {} : { note: off.note.trim() })
			});
			const makeup = makeupDraftFor(label, off.date);
			if (makeup) trackMakeup(makeup, off.date, label);
		}

		for (const due of args.dueWindows ?? []) {
			checkDate(due.date);
			if (due.endDate !== undefined) checkDate(due.endDate);
			const label = due.label.trim();
			if (label === '') throw new Error('An event label is required.');
			drafts.push({
				type: due.type,
				label,
				target: due.target ?? 'all',
				date: due.date,
				...(due.endDate === undefined ? {} : { endDate: due.endDate }),
				...(due.note === undefined || due.note.trim() === '' ? {} : { note: due.note.trim() })
			});
		}

		// Write every draft under the same guards `events.create` enforces.
		// Makeup suggestions skip (with a report) rather than fail the seed —
		// everything else throws, atomically, before anything is written.
		const created: Id<'esl_events'>[] = [];
		const makeup: { forDate: string; makeupDate: string; label: string }[] = [];
		const makeupSkipped: string[] = [];
		const makeupDates = new Set<string>();
		for (const draft of drafts) {
			const makeupEntry = makeupOf.get(draft);
			const isMakeup = makeupEntry !== undefined;
			const fieldError = assertValidEslEvent({
				type: draft.type,
				date: draft.date,
				endDate: draft.endDate,
				startPeriod: draft.startPeriod,
				endPeriod: draft.endPeriod
			});
			if (fieldError) throw new Error(describeEslEventError(fieldError));

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

			try {
				await assertExclusive(ctx, {
					semesterId: args.semesterId,
					type: draft.type,
					date: draft.date,
					endDate: draft.endDate
				});
			} catch (error) {
				if (isMakeup) {
					makeupSkipped.push(
						`Makeup for ${draft.label} on ${draft.date} skipped: ${error instanceof Error ? error.message : 'date unavailable'}`
					);
					continue;
				}
				throw error;
			}

			if (isMakeup) {
				if (makeupDates.has(draft.date)) {
					makeupSkipped.push(
						`Makeup for ${draft.label} on ${draft.date} skipped: two weekends share one Friday.`
					);
					continue;
				}
				makeupDates.add(draft.date);
			}

			const id = await ctx.db.insert('esl_events', {
				semesterId: args.semesterId,
				type: draft.type,
				label: draft.label,
				target: draft.target,
				date: draft.date,
				...(draft.endDate === undefined ? {} : { endDate: draft.endDate }),
				...(draft.note === undefined ? {} : { note: draft.note }),
				...(draft.startPeriod === undefined ? {} : { startPeriod: draft.startPeriod }),
				...(draft.endPeriod === undefined ? {} : { endPeriod: draft.endPeriod }),
				...(draft.provenance === undefined ? {} : { provenance: draft.provenance }),
				...(draft.unverified === undefined ? {} : { unverified: draft.unverified }),
				...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
			});
			created.push(id);
			if (isMakeup && makeupEntry) {
				makeup.push({
					forDate: makeupEntry.forDate,
					makeupDate: draft.date,
					label: makeupEntry.label
				});
			}
		}

		return { created, makeup, makeupSkipped, unresolvedLunar };
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
				fetchedAt: args.fetchedAt
			});
		}
		return { year: args.year, days: args.rows.length };
	}
});
