import { query } from '../_generated/server';
import { v } from 'convex/values';
import { requireEslStaff } from '../auth';
import {
	buildTeacherDayRows,
	isValidEslDate,
	type EslDay,
	type ScheduleEventInput,
	type ScheduleMeetingInput
} from '../shared/esl';

/**
 * Teacher day-join core (ticket #192): the join both teacher views consume.
 *
 * Given a teacher and a date range, every meeting occurrence comes back with
 * its status, cause, badges, collapsed dues, and per-term count-up, ready to
 * render. Reads are teacher-scoped (only that teacher's active classes in
 * active cohorts) and clamped to the semester window. Pure join rules live in
 * `buildTeacherDayRows` (`shared/esl`); this query only reads.
 *
 * cost: 1 point read of the semester + 1 indexed take of its events + 1
 * indexed take of the teacher's classes + 1 batched cohort read + 1 indexed
 * meeting read per class. Bounded by one teacher's caseload and one
 * semester's events (tens of rows each), never the tables.
 */
export const teacherDays = query({
	args: {
		teacherId: v.id('users'),
		semesterId: v.id('esl_semesters'),
		fromDate: v.string(),
		toDate: v.string()
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		if (!isValidEslDate(args.fromDate) || !isValidEslDate(args.toDate)) {
			throw new Error('Dates must be YYYY-MM-DD.');
		}
		if (args.toDate < args.fromDate) {
			throw new Error('The date range ends before it starts.');
		}

		const semester = await ctx.db.get(args.semesterId);
		if (!semester) throw new Error('Semester not found');

		const teacher = await ctx.db.get(args.teacherId);
		if (!teacher) throw new Error('Teacher not found');

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', args.teacherId))
			.take(200);

		const meetings: ScheduleMeetingInput[] = [];
		for (const cls of classes) {
			if (cls.status !== 'active') continue;
			const cohort = await ctx.db.get(cls.cohortId);
			if (!cohort || cohort.status !== 'active') continue;
			if (cohort.year !== semester.year) continue;
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

		const stored = await ctx.db
			.query('esl_events')
			.withIndex('by_semester', (q) => q.eq('semesterId', args.semesterId))
			.collect();
		// The full semester's events, not the requested window: the join
		// needs later exams (oral marks, per-term counts) and the S2 G9
		// ceremony anchor even when the caller reads one week. Tens of
		// rows per semester — the same bounded take the admin screen uses.
		const events: ScheduleEventInput[] = stored.map((event) => ({
			type: event.type,
			label: event.label,
			target: event.target,
			date: event.date,
			...(event.endDate === undefined ? {} : { endDate: event.endDate }),
			...(event.note === undefined ? {} : { note: event.note }),
			...(event.startPeriod === undefined ? {} : { startPeriod: event.startPeriod }),
			...(event.endPeriod === undefined ? {} : { endPeriod: event.endPeriod })
		}));

		const examDates = events
			.filter((event) => event.type === 'exam')
			.map((event) => event.date)
			.sort();
		// In S2 the term outlives the last exam: G9 counts toward the
		// graduation ceremony, so the read window runs to the ceremony when
		// one names the cutoff.
		const ceremonyDates =
			semester.term === 'S2'
				? events
						.filter(
							(event) =>
								event.type === 'no_class' &&
								event.target === 'G9' &&
								/graduation|ceremony/i.test(event.label)
						)
						.map((event) => event.date)
						.sort()
				: [];
		const ceremonyDate =
			ceremonyDates.length > 0 ? ceremonyDates[ceremonyDates.length - 1] : undefined;
		const lastExam = examDates.length > 0 ? examDates[examDates.length - 1] : null;
		// Spec: end derives from the last exam; in S2 the graduation
		// ceremony may outlive it (G9 counts to graduation), so the window
		// runs to whichever anchor is later.
		const anchors: string[] = [];
		if (lastExam !== null) anchors.push(lastExam);
		if (ceremonyDate !== undefined) anchors.push(ceremonyDate);
		anchors.sort();
		const semesterEnd = anchors.length > 0 ? anchors[anchors.length - 1] : null;

		return buildTeacherDayRows({
			meetings,
			events,
			semesterStart: semester.startDate,
			semesterEnd,
			term: semester.term,
			fromDate: args.fromDate,
			toDate: args.toDate
		});
	}
});
