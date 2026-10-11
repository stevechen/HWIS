import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { displayStaffName } from '../shared/staff_name';
import {
	cohortLabel,
	compareEslStudents,
	assertValidMeetings,
	describeMeetingShapeError,
	classifySchedule,
	deriveHomeroom,
	ESL_ROOM_SUGGESTIONS,
	findScheduleProblems,
	describeScheduleProblem,
	grade10SectionOf,
	grade10SiblingLevel,
	isSharedRosterGrade,
	type EslDay,
	type EslScheduleNeighbour,
	type EslScheduleProblemDetail,
	type EslUnavailableSlot
} from '../shared/esl';

/** The day validator shared by every meeting argument and return shape. */
const dayValidator = v.union(
	v.literal('Monday'),
	v.literal('Tuesday'),
	v.literal('Wednesday'),
	v.literal('Thursday'),
	v.literal('Friday')
);

/** One `(day, period)` pair as the client sends and receives it. */
const meetingValidator = v.object({ day: dayValidator, period: v.number() });

/** A class row enriched with its cohort label and teacher display name. */
type EnrichedClass = Doc<'esl_classes'> & {
	cohortLabel: string | null;
	cohortGrade: number | null;
	teacherName: string | null;
};

/**
 * Joins classes to their cohort and teacher in two batched reads rather than
 * one lookup per class (ADR-0021 rule 2).
 */
async function enrich(ctx: QueryCtx, classes: Doc<'esl_classes'>[]): Promise<EnrichedClass[]> {
	const cohorts = await Promise.all(classes.map((cls) => ctx.db.get(cls.cohortId)));
	const teachers = await Promise.all(
		classes.map((cls) => (cls.teacherId ? ctx.db.get(cls.teacherId) : Promise.resolve(null)))
	);

	return classes.map((cls, index) => {
		const cohort = cohorts[index];
		const teacher = teachers[index];
		return {
			...cls,
			cohortLabel: cohort === null ? null : cohortLabel(cohort),
			cohortGrade: cohort?.grade ?? null,
			teacherName: cls.teacherId ? displayStaffName(teacher?.name) : null
		};
	});
}

/**
 * The classes a teacher is assigned to.
 *
 * cost: 1 indexed take of N assigned classes + 1 batch get of their cohorts
 * and teachers. Free-Quota Impact: N is one teacher's caseload, not table size.
 */
export const listByTeacher = query({
	args: { teacherId: v.id('users') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_teacherId', (q) => q.eq('teacherId', args.teacherId))
			.take(200);

		const enriched = await enrich(ctx, classes);
		return enriched.sort((a, b) => a.type.localeCompare(b.type));
	}
});

/** The classes attached to a cohort. cost: 1 indexed read + batched teacher names. */
export const listByCohort = query({
	args: { cohortId: v.id('esl_cohorts') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.cohortId))
			.collect();

		return enrich(ctx, classes);
	}
});

/**
 * The roster a class teaches.
 *
 * The roster is the cohort's, not the class's — a G7/G8 `CLIL` and `Comm` class
 * resolve to the same students, which is the whole point of the shared cohort.
 * `includeDisabled` defaults to false so teachers see current enrolment.
 *
 * cost: 2 point reads + 1 indexed take of the cohort roster.
 */
export const getRoster = query({
	args: {
		classId: v.id('esl_classes'),
		includeDisabled: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const classRecord = await ctx.db.get(args.classId);
		if (!classRecord) throw new Error('Class not found');

		const cohort = await ctx.db.get(classRecord.cohortId);
		if (!cohort) throw new Error('Cohort not found');

		const students = await ctx.db
			.query('esl_students')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', classRecord.cohortId))
			.take(500);

		const includeDisabled = args.includeDisabled ?? false;
		const roster = includeDisabled
			? students
			: students.filter((student) => student.status === 'active');

		return {
			class: classRecord,
			cohort,
			/** True when the roster is shared with the cohort's sibling class. */
			sharedRoster: isSharedRosterGrade(cohort.grade),
			students: roster.sort(compareEslStudents)
		};
	}
});

/** Assign (or unassign) the teacher responsible for a class. cost: 2 reads + 1 patch. */
/**
 * The problems of the given kinds, dropping the rest.
 *
 * The mutations that change a *room* or a *teacher* run the same gate but keep
 * only the rules their own change can cause. Running all of it would be a trap: a
 * class whose schedule already breaks a cohort rule — legacy data, a restore —
 * could never have its room corrected, because the room save would be refused for
 * a problem the room is not the cause of and cannot fix. The cohort rules belong
 * to `setSchedule`, which is the only mutation that can resolve them.
 */
function problemsOfKinds(
	problems: readonly EslScheduleProblemDetail[],
	kinds: readonly EslScheduleProblemDetail['kind'][]
): EslScheduleProblemDetail[] {
	return problems.filter((problem) => kinds.includes(problem.kind));
}

/**
 * The rules a room change can cause, run against a class's *saved* week.
 *
 * Only `room`. A teacher double-booking does not depend on which room the class
 * is in — it is the same problem before and after — so refusing here would block
 * an unrelated correction.
 */
async function gateRoomChange(
	ctx: QueryCtx,
	classRecord: Doc<'esl_classes'>,
	room: string | undefined,
	year: string
): Promise<void> {
	const problems = problemsOfKinds(
		findScheduleProblems(
			{
				type: classRecord.type,
				cohortId: classRecord.cohortId,
				room,
				teacherId: classRecord.teacherId ?? undefined,
				meetings: await meetingsOf(ctx, classRecord._id, year)
			},
			await gateNeighbours(ctx, year, [classRecord._id]),
			[]
		),
		['room']
	);
	if (problems.length > 0) throw new Error(describeRefusal(problems));
}

/**
 * The rules a teacher change can cause, run against a class's *saved* week.
 *
 * `teacher` (one person in two rooms at once), `teacher-availability` (the slot
 * is blocked for them) and `cohort-teacher` (the sibling already has them). Not
 * the room rule: assigning a teacher to a class whose room is currently shared is
 * a schedule problem to fix in the schedule, and blocking the teacher save over it
 * would leave the admin with no way forward.
 */
async function gateTeacherChange(
	ctx: QueryCtx,
	classRecord: Doc<'esl_classes'>,
	teacherId: Id<'users'> | undefined,
	year: string
): Promise<void> {
	const problems = problemsOfKinds(
		findScheduleProblems(
			{
				type: classRecord.type,
				cohortId: classRecord.cohortId,
				room: classRecord.room ?? undefined,
				teacherId,
				meetings: await meetingsOf(ctx, classRecord._id, year)
			},
			await gateNeighbours(ctx, year, [classRecord._id]),
			await unavailableSlotsFor(ctx, teacherId, year)
		),
		['teacher', 'teacher-availability', 'cohort-teacher']
	);
	if (problems.length > 0) throw new Error(describeRefusal(problems));
}

export const assignTeacher = mutation({
	args: {
		id: v.id('esl_classes'),
		teacherId: v.optional(v.id('users'))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const classRecord = await ctx.db.get(args.id);
		if (!classRecord) throw new Error('Class not found');

		if (args.teacherId) {
			const teacher = await ctx.db.get(args.teacherId);
			if (!teacher) throw new Error('Teacher not found');
		}

		// The gate runs against the class's *saved* week, since a teacher is assigned
		// to slots that already exist. The year comes from the cohort: a class belongs
		// to exactly one cohort and a cohort to exactly one year, so this needs no
		// argument and cannot be pointed at the wrong year.
		const cohort = await ctx.db.get(classRecord.cohortId);
		if (cohort !== null) {
			await gateTeacherChange(ctx, classRecord, args.teacherId, cohort.year);
		}

		await ctx.db.patch(args.id, { teacherId: args.teacherId ?? undefined });

		return { success: true, classId: args.id };
	}
});

/**
 * A class's meetings in ONE year, ordered so the timetable reads in week order.
 *
 * The year is a parameter rather than an assumption because `esl_class_meetings`
 * carries its own `year` column and a class can hold rows for more than one: the
 * query is per class, so without the filter a class scheduled in 2025-2026 and
 * edited again in 2026-2027 would report last year's slots as this year's — wrong
 * chips, and conflicts against classes that never met it.
 *
 * cost: 1 indexed take of one class's meetings in one year.
 */
const meetingsOf = async (
	ctx: QueryCtx,
	classId: Doc<'esl_classes'>['_id'],
	year: string
): Promise<{ day: EslDay; period: number }[]> => {
	const rows = await ctx.db
		.query('esl_class_meetings')
		.withIndex('by_classId', (q) => q.eq('classId', classId))
		.collect();
	return rows
		.filter((row) => row.year === year)
		.map(({ day, period }) => ({ day: day as EslDay, period }));
};

/**
 * Every live class in a year, as gate neighbours, excluding one class.
 *
 * Shared by the read and by `setSchedule`, because a gate that is handed a
 * different neighbour set than the picker used is a gate that can refuse a write
 * the admin was shown as fine — the exact disagreement this one engine exists to
 * prevent.
 *
 * Retired classes are excluded: they are history and must not block a live year's
 * timetable. The excluded ids are the subject(s) themselves, whose own saved rows
 * would otherwise read back as a clash. A grade 10 pair excludes *both* sections,
 * because they are written together and the pair's own room/teacher rules are
 * checked explicitly rather than as two neighbours arguing.
 *
 * cost: 1 indexed take of the year's cohorts, 1 per cohort's classes, 1 per
 * class's meetings. Bounded by one year.
 */
async function gateNeighbours(
	ctx: QueryCtx,
	year: string,
	excludeClassIds: readonly Doc<'esl_classes'>['_id'][]
): Promise<(EslScheduleNeighbour & { cohortId: string })[]> {
	const cohorts = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year', (q) => q.eq('year', year))
		.collect();

	const classes = (
		await Promise.all(
			cohorts.map((cohort) =>
				ctx.db
					.query('esl_classes')
					.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
					.collect()
			)
		)
	).flat();

	const live = classes.filter(
		(cls) =>
			!excludeClassIds.includes(cls._id) &&
			cls.status === 'active' &&
			cohorts.find((cohort) => cohort._id === cls.cohortId)?.status === 'active'
	);

	return Promise.all(
		live.map(async (cls) => ({
			classId: cls._id,
			className: cls.name,
			cohortId: cls.cohortId,
			teacherId: cls.teacherId,
			room: cls.room,
			meetings: await meetingsOf(ctx, cls._id, year)
		}))
	);
}

/**
 * The slots a teacher is marked unavailable for in a year.
 *
 * Availability is stored as *blocked* rows rather than a weekly template, so a
 * teacher with nothing blocked is available everywhere and this reads nothing —
 * which is why the rule costs one indexed read only when a class has a teacher.
 */
async function unavailableSlotsFor(
	ctx: QueryCtx,
	teacherId: Doc<'esl_classes'>['teacherId'],
	year: string
): Promise<EslUnavailableSlot[]> {
	if (teacherId === undefined) return [];
	const rows = await ctx.db
		.query('esl_teacher_availability')
		.withIndex('by_teacher_year', (q) => q.eq('teacherId', teacherId).eq('year', year))
		.collect();
	return rows.map(({ day, period, note }) => ({
		day: day as EslDay,
		period,
		note
	}));
}

/**
 * The one sentence a refused save fails with, naming every reason at once.
 *
 * Aggregated rather than first-only: the picker already shows all of them, and a
 * mutation that reported one at a time would make fixing a class with three
 * clashes a three-press loop where each press only revealed the next thing.
 */
function describeRefusal(problems: readonly EslScheduleProblemDetail[]): string {
	return [
		'This schedule cannot be saved:',
		...problems.map((problem) => `  • ${problem.message}`)
	].join('\n');
}

/**
 * Every class in a year with its meetings, room and schedule badge state.
 *
 * Validity is computed here rather than stored, because it is **global** — a class
 * is incomplete partly because of what *other* rows say — so a flag on the row
 * would go stale the moment a neighbour is edited (ADR-0027). The whole year's
 * classes load together precisely so the badge can be right.
 *
 * Each class is classified against every *other* class in the year, which is what
 * lets a clash with a class in another cohort be reported by name.
 *
 * cost: 1 indexed take of the year's cohorts, 1 indexed take per cohort's classes,
 * 1 indexed take per class's meetings. Free-Quota Impact: the year's class and
 * meeting counts (hundreds), not the table sizes — bounded by one year.
 */
export const listScheduleByYear = query({
	args: { year: v.string() },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		// Every cohort in the year, archived ones included. They are *not* dropped
		// here: the page renders an archived cohort's cards from this query's rows
		// too, and dropping them left those cards with no schedule at all — reading
		// as "Loading…" forever. Archiving should retire a card, not delete it.
		const cohorts = await ctx.db
			.query('esl_cohorts')
			.withIndex('by_year', (q) => q.eq('year', args.year))
			.collect();

		const cohortById = new Map(cohorts.map((cohort) => [cohort._id, cohort]));

		const classes = (
			await Promise.all(
				cohorts.map((cohort) =>
					ctx.db
						.query('esl_classes')
						.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
						.collect()
				)
			)
		).flat();

		/**
		 * Whether a class still takes part in this year's timetable.
		 *
		 * A class is retired by archiving *either* half — the cohort or the class
		 * itself, since `setStatus` archives classes one at a time. Checking only the
		 * cohort (as this did) left a single archived class inside an active cohort
		 * fully live: it vanished from the cards but stayed in the neighbour set, so
		 * it red-flagged real classes while being impossible to see or edit. The
		 * worst of both, and the reason the two conditions are read together.
		 */
		const isLive = (cls: Doc<'esl_classes'>) =>
			cls.status === 'active' && cohortById.get(cls.cohortId)?.status === 'active';

		const meetingsByClass = new Map<string, { day: EslDay; period: number }[]>();
		for (const cls of classes) {
			meetingsByClass.set(cls._id, await meetingsOf(ctx, cls._id, args.year));
		}

		/**
		 * The neighbour set each class is classified against: the live part of the
		 * year.
		 *
		 * Archived classes are excluded as neighbours but still returned above.
		 * They keep their own rows so their cards render as history; they just stop
		 * colouring the live timetable and stop red-flagging the classes a human can
		 * actually act on. Where an archived class and a live one do clash, the live
		 * class owns the fault — it is the one that can be moved.
		 */
		const liveNeighbours = classes.filter(isLive).map((cls) => ({
			classId: cls._id,
			className: cls.name,
			cohortId: cls.cohortId,
			teacherId: cls.teacherId,
			room: cls.room,
			meetings: meetingsByClass.get(cls._id) ?? []
		}));

		return Promise.all(
			classes.map(async (cls) => {
				const meetings = meetingsByClass.get(cls._id) ?? [];
				// Retired rows are history, not a work item: they carry no validity state
				// at all, so a class archived mid-year does not sit on the page demanding
				// a schedule nobody is going to give it.
				if (!isLive(cls)) {
					return {
						classId: cls._id,
						name: cls.name,
						type: cls.type,
						cohortId: cls.cohortId,
						teacherId: cls.teacherId ?? null,
						room: cls.room ?? null,
						meetings,
						/** True when the class or its cohort is archived. */
						archived: true as const,
						/** Null when the schedule is sound, or when the class is retired. */
						scheduleProblem: null,
						scheduleLabel: null,
						problems: []
					};
				}
				// The class's own rows are excluded here rather than inside the gate, which
				// has no way to know which neighbour is the subject.
				const others = liveNeighbours.filter((other) => other.classId !== cls._id);
				const subject = {
					type: cls.type,
					cohortId: cls.cohortId,
					room: cls.room,
					teacherId: cls.teacherId ?? undefined,
					meetings
				};
				// One rule pass, read by everything on the card: the chips, the summary
				// badge and the conflict marker. They used to come from two overlapping
				// passes, which is how a chip could stay green while the marker said
				// conflicted. Availability is the teacher's blocked rows for this year —
				// a class saved onto a blocked slot is reported here, not only refused
				// at the write.
				const unavailable =
					cls.teacherId === undefined
						? []
						: await unavailableSlotsFor(ctx, cls.teacherId, args.year);
				const problems = findScheduleProblems(subject, others, unavailable);
				const problem = classifySchedule(subject, problems);
				return {
					classId: cls._id,
					name: cls.name,
					type: cls.type,
					cohortId: cls.cohortId,
					teacherId: cls.teacherId ?? null,
					room: cls.room ?? null,
					meetings,
					/** False when the class and its cohort are both active. */
					archived: false as const,
					/** Null when the schedule is sound. */
					scheduleProblem: problem,
					scheduleLabel: problem === null ? null : describeScheduleProblem(problem),
					/** Every rule the department runs: the chips and the card marker. */
					problems
				};
			})
		);
	}
});

/** Archive (or restore) a class without deleting its history. cost: 1 read + 1 patch. */
/**
 * The grade 10 section's partner, or null when there is none to write.
 *
 * Resolution lives here rather than in the caller so a client cannot name an
 * arbitrary second class: the pair is a fact about the cohorts, not an argument.
 */
async function findGrade10PartnerClass(
	ctx: MutationCtx,
	classRecord: Doc<'esl_classes'>
): Promise<Doc<'esl_classes'> | null> {
	if (grade10SectionOf(classRecord.type) === null) return null;
	const cohort = await ctx.db.get(classRecord.cohortId);
	if (cohort === null) return null;
	const partnerLevel = grade10SiblingLevel(cohort.level);
	if (partnerLevel === null) return null;
	const partnerCohort = await findGrade10PartnerCohort(ctx, cohort, partnerLevel);
	if (partnerCohort === null) return null;
	return (
		(
			await ctx.db
				.query('esl_classes')
				.withIndex('by_cohortId', (q) => q.eq('cohortId', partnerCohort._id))
				.collect()
		)[0] ?? null
	);
}

/**
 * Replace one year of a class's meetings, leaving any other year's rows alone.
 *
 * Shared by `setSchedule` and the pair mutation so the year-scoping rule — and
 * the reason for it — is stated once. Deleting every row for the class would
 * silently destroy another year's schedule whenever an admin saved while the
 * wrong year was selected.
 *
 * `e2eTag` is copied from the class's cohort so an end-to-end run can tear down
 * the rows it created, on the same tag pattern as every other ESL table.
 */
async function replaceYearMeetings(
	ctx: MutationCtx,
	classId: Doc<'esl_classes'>['_id'],
	year: string,
	meetings: readonly { day: EslDay; period: number }[],
	e2eTag?: string
): Promise<void> {
	const existing = await ctx.db
		.query('esl_class_meetings')
		.withIndex('by_classId', (q) => q.eq('classId', classId))
		.collect();
	for (const row of existing) {
		if (row.year === year) await ctx.db.delete(row._id);
	}
	for (const meeting of meetings) {
		await ctx.db.insert('esl_class_meetings', {
			classId,
			year,
			day: meeting.day,
			period: meeting.period,
			...(e2eTag === undefined ? {} : { e2eTag })
		});
	}
}

/**
 * Write a grade 10 pair's shared week to both sections, in one transaction.
 *
 * **Why this is not two `setSchedule` calls.** The picker used to save the pair
 * section by section, and with conflicts now refusing writes that became a real
 * hazard: the first save could succeed and the second fail, leaving `H101A` on the
 * new week and `H101B` on the old — a state the gate then refuses to repair,
 * because either repair is itself a gated write. Convex mutations are atomic, so
 * writing both here means the pair is never split.
 *
 * `setSchedule` delegates to this for any grade 10 section, so there is one write
 * path rather than two that could drift apart. It is deliberately not a separate
 * public mutation: a client that could pair a class with an arbitrary other one
 * is a hazard, and the pair is a fact about the cohorts rather than an argument.
 *
 * The pair's own rules are checked explicitly rather than left to the general
 * gate, because the two sections are excluded from each other's neighbour set:
 * they always run at the same slots by construction, so the only ways they can
 * collide are sharing a room or sharing a teacher. Those get their own sentences,
 * which is more use to a coordinator than "ESL A is taken by H101B".
 *
 * An archived partner is ignored: a retired section must neither block the write
 * nor be dragged back into the timetable. With no live partner the write is
 * refused, because the picker only offers a pair editor when one exists.
 *
 * `room` is the room this section will have after the save (the picker drafts
 * slots and room together), so the pair's own room rule judges the proposal
 * rather than the stale saved value. Rooms stay independent: only this
 * section's room is compared, never written — the caller patches it.
 */
async function writeGrade10Pair(
	ctx: MutationCtx,
	classRecord: Doc<'esl_classes'>,
	year: string,
	meetings: readonly { day: EslDay; period: number }[],
	room: string | undefined
): Promise<void> {
	const partner = await findGrade10PartnerClass(ctx, classRecord);
	if (partner === null) {
		throw new Error(
			`${classRecord.name} has no partner section, so there is no pair to save. Edit it from its own card.`
		);
	}

	// The pair's own rules. Both sections run at the same slots by construction,
	// and they live in two different cohorts (one per level, ADR-0023), so the
	// cohort-slot and cohort-day rules cannot apply between them at all.
	const problems: EslScheduleProblemDetail[] = [];
	const asNeighbour = {
		classId: partner._id,
		className: partner.name,
		cohortId: partner.cohortId,
		teacherId: partner.teacherId,
		room: partner.room,
		meetings
	};
	if (room !== undefined && room === partner.room) {
		problems.push({
			kind: 'room',
			message: `${classRecord.name} and ${partner.name} both meet in ${room}; the two sections need different rooms.`,
			otherName: partner.name,
			other: asNeighbour
		});
	}
	if (classRecord.teacherId !== undefined && classRecord.teacherId === partner.teacherId) {
		problems.push({
			kind: 'cohort-teacher',
			message: `${classRecord.name} and ${partner.name} have the same teacher; the two sections need different ones.`,
			otherName: partner.name,
			other: asNeighbour
		});
	}

	// Both sections are excluded from each other's neighbour set, so each is gated
	// only against the rest of the year; the pair's own collisions are above.
	const neighbours = await gateNeighbours(ctx, year, [classRecord._id, partner._id]);
	for (const section of [classRecord, partner]) {
		const sectionProblems = findScheduleProblems(
			{
				type: section.type,
				cohortId: section.cohortId,
				room: section.room ?? undefined,
				teacherId: section.teacherId ?? undefined,
				meetings
			},
			neighbours,
			await unavailableSlotsFor(ctx, section.teacherId, year)
		);
		// Prefixed with the section name: the gate's own sentence names the *other*
		// class, and two sections produce two lists the admin would otherwise have
		// to attribute themselves.
		problems.push(
			...sectionProblems.map((problem) => ({
				...problem,
				message: `${section.name}: ${problem.message}`
			}))
		);
	}

	if (problems.length > 0) throw new Error(describeRefusal(problems));

	const sectionCohorts = await Promise.all([
		ctx.db.get(classRecord.cohortId),
		ctx.db.get(partner.cohortId)
	]);
	await replaceYearMeetings(ctx, classRecord._id, year, meetings, sectionCohorts[0]?.e2eTag);
	await replaceYearMeetings(ctx, partner._id, year, meetings, sectionCohorts[1]?.e2eTag);
}

export const setStatus = mutation({
	args: {
		id: v.id('esl_classes'),
		status: v.union(v.literal('active'), v.literal('archived'))
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const classRecord = await ctx.db.get(args.id);
		if (!classRecord) throw new Error('Class not found');

		await ctx.db.patch(args.id, { status: args.status });
		return { success: true, classId: args.id };
	}
});

/**
 * The cohort holding the other section of the same grade 10 Chinese class.
 *
 * Found by scanning the year's cohorts rather than indexing on
 * `(year, grade, classNumber)`: the pair is the only consumer, a year holds tens of
 * cohorts, and one indexed read of `by_year` beats adding a composite index that
 * every write would then have to maintain.
 *
 * Null when no such cohort exists — a school running `H101A` without `H101B` is
 * unusual but not impossible, and it leaves the other section simply unscheduled.
 */
async function findGrade10PartnerCohort(
	ctx: MutationCtx,
	cohort: { _id: Id<'esl_cohorts'>; year: string; grade: number; classNumber: string },
	partnerLevel: string
): Promise<{ _id: Id<'esl_cohorts'> } | null> {
	const cohorts = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year', (q) => q.eq('year', cohort.year))
		.collect();

	return (
		cohorts.find(
			(candidate) =>
				candidate._id !== cohort._id &&
				// Archived is history: an archived partner must neither block this write
				// nor be compared against it.
				candidate.status === 'active' &&
				candidate.grade === cohort.grade &&
				candidate.classNumber === cohort.classNumber &&
				candidate.level === partnerLevel
		) ?? null
	);
}

/**
 * Replace a class's meetings wholesale.
 *
 * Wholesale rather than per-meeting add/remove because the editor saves a whole
 * week at once, and a diff would need the current rows to compute against — which
 * the client already has, and which a second writer could invalidate between its
 * read and its write.
 *
 * Two failures are treated differently (ADR-0027):
 *
 * - **Shape rejects the write.** A `CLIL` with two meetings, two meetings on one
 *   day, or a period the school does not run are all typos, all detectable here,
 *   and all produce a timetable that is silently wrong otherwise.
 * - **Every department conflict also rejects the write**, through the one gate
 *   `findScheduleProblems`. Teacher and room clashes used to be advisory; see the
 *   gate call below and ADR-0027 for why that reversed.
 *
 * cost: 1 point read of the class, 1 indexed take of the year's cohorts and
 * classes, 1 per class's meetings, then 1 indexed read of the class's own
 * meetings and one delete plus one insert per meeting.
 */
export const setSchedule = mutation({
	args: {
		classId: v.id('esl_classes'),
		year: v.string(),
		meetings: v.array(meetingValidator),
		/**
		 * The room, when the picker is also changing it.
		 *
		 * Sent alongside the week so one Save writes both or neither: the picker
		 * drafts slots and room together, and a schedule that saved while the room
		 * save was refused would leave the class in the very clash the gate exists
		 * to prevent. Absent means "leave the room as it is", so existing callers
		 * are unaffected. Blank is cleared, on the same rule as `setRoom`.
		 */
		room: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const classRecord = await ctx.db.get(args.classId);
		if (!classRecord) throw new Error('Class not found');

		const shapeError = assertValidMeetings(classRecord.type, args.meetings);
		if (shapeError !== null) {
			throw new Error(describeMeetingShapeError(classRecord.type, shapeError));
		}

		// Resolved once: the gate judges the room the class will *have* after this
		// save, not the one it has now.
		const trimmedRoom = args.room?.trim();
		const nextRoom =
			args.room === undefined ? undefined : trimmedRoom === '' ? undefined : trimmedRoom;
		const gateRoom = args.room === undefined ? (classRecord.room ?? undefined) : nextRoom;

		/**
		 * Every department rule, on the *proposed* week, and the write is refused if
		 * any of them fires.
		 *
		 * This reverses an earlier decision, deliberately. Conflicts used to be
		 * advisory on the grounds that "a half-built timetable is a real state worth
		 * recording" (ADR-0027) — the clash is genuinely real, and refusing to record
		 * it did make the problem easier to see as a red chip. But it also meant the
		 * server would happily persist a timetable the school cannot run, and no
		 * amount of UI guidance could close that: anything writing outside the picker
		 * (an import, a restore, a second tab) bypassed the guidance entirely.
		 *
		 * The guidance still runs first, so the admin is told before they commit; this
		 * is the safety net underneath it, not a replacement for it. Both call the same
		 * `findScheduleProblems`, so a refusal here can only ever be a rule the picker
		 * was already showing.
		 *
		 * The neighbours exclude this class, so re-saving is judged against the year
		 * rather than against its own saved rows.
		 */
		const neighbours = await gateNeighbours(ctx, args.year, [args.classId]);
		const unavailable = await unavailableSlotsFor(ctx, classRecord.teacherId, args.year);
		const problems = findScheduleProblems(
			{
				type: classRecord.type,
				cohortId: classRecord.cohortId,
				room: gateRoom,
				teacherId: classRecord.teacherId ?? undefined,
				meetings: args.meetings
			},
			neighbours,
			unavailable
		);
		if (problems.length > 0) {
			throw new Error(describeRefusal(problems));
		}
		// Only THIS year's rows are replaced, and both sections of a grade 10 pair are
		// written in one transaction. See `replaceYearMeetings` for the year scoping
		// and `writeGrade10Pair` for why a pair cannot be two saves.
		//
		// A section with no partner at all falls through to the single-class path: a
		// school running `H101A` without `H101B` is unusual but not impossible, and it
		// must not be unschedulable over the absence of a section that does not exist.
		//
		// The room patch rides the same transaction as the meetings: the gate above
		// judged the week against `gateRoom`, so splitting the writes would let a
		// failure between them persist one without the other.
		if ((await findGrade10PartnerClass(ctx, classRecord)) !== null) {
			await writeGrade10Pair(ctx, classRecord, args.year, args.meetings, gateRoom);
			if (args.room !== undefined) await ctx.db.patch(args.classId, { room: nextRoom });
			return { success: true, classId: args.classId, meetings: args.meetings };
		}

		// The cohort carries the `e2eTag` an end-to-end run tears down by.
		const cohort = await ctx.db.get(classRecord.cohortId);
		await replaceYearMeetings(ctx, args.classId, args.year, args.meetings, cohort?.e2eTag);
		if (args.room !== undefined) await ctx.db.patch(args.classId, { room: nextRoom });

		return { success: true, classId: args.classId, meetings: args.meetings };
	}
});

/**
 * Assign (or clear) the room a class meets in.
 *
 * Free text by design: the department's rooms vary year to year, and the school
 * adding an `ESL H` next year is not a data error. A rule encoding "the most rooms
 * we have ever had" is exactly the brittle convention ADR-0025 warns against, so
 * nothing here rejects a name — the editor offers `ESL A`–`ESL G` and the year's
 * derived Chinese homerooms as *suggestions* and accepts anything (ADR-0027).
 *
 * cost: 1 point read + 1 patch.
 */
export const setRoom = mutation({
	args: {
		classId: v.id('esl_classes'),
		room: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const classRecord = await ctx.db.get(args.classId);
		if (!classRecord) throw new Error('Class not found');

		// Trimmed, and a blank treated as absent: the field models "no room known
		// yet", and a whitespace-only value would satisfy `room !== ''` while
		// reading as a room on the schedule badge.
		const room = args.room?.trim();
		const next = room === undefined || room === '' ? undefined : room;

		// Without this the room is the way around the schedule gate entirely: give a
		// scheduled class a room another class already holds and the conflict exists,
		// however carefully the slots were chosen. The year comes from the cohort,
		// which is the only year this class's saved week belongs to.
		const cohort = await ctx.db.get(classRecord.cohortId);
		if (cohort !== null) {
			await gateRoomChange(ctx, classRecord, next, cohort.year);
		}

		await ctx.db.patch(args.classId, { room: next });

		return {
			success: true,
			classId: args.classId,
			room: next ?? null
		};
	}
});

/**
 * The rooms a class can meet in, as the schedule picker's room grid shows them.
 *
 * Two vocabularies, kept separate so the grid can order and label them: the
 * department's own rooms first, then the Chinese homerooms the cohort's
 * students come from. The homerooms are derived from the cohort's *active*
 * roster on every read and never stored — a transferred student's old
 * homeroom is history, not a suggestion, and an empty roster yields no
 * homeroom section at all rather than a fabricated one.
 *
 * A suggestion list, never a whitelist: `setSchedule` and `setRoom` accept any
 * string, and the picker's Other field exists for the rest.
 *
 * cost: 1 point read of the cohort + 1 indexed take of its roster.
 */
export const listRoomSuggestions = query({
	args: { cohortId: v.id('esl_cohorts') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const cohort = await ctx.db.get(args.cohortId);
		if (!cohort) throw new Error('Cohort not found');

		const students = await ctx.db
			.query('esl_students')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', args.cohortId))
			.collect();

		const homerooms = new Set<string>();
		for (const student of students) {
			if (student.status !== 'active') continue;
			const room = deriveHomeroom(cohort.grade, student.chineseClass ?? '');
			if (room !== null) homerooms.add(room);
		}

		return {
			/** The department's own rooms, in corridor order. */
			department: [...ESL_ROOM_SUGGESTIONS],
			/** The cohort's homerooms, ascending — empty when the roster is. */
			homerooms: [...homerooms].sort()
		};
	}
});
