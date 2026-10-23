import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { canTeachEslClass } from '../shared/authorization';
import { displayStaffName } from '../shared/staff_name';
import { cohortHomeroomSet, findBandCohorts, findBandCohortsWithHomerooms } from './bands';
import {
	cohortLabel,
	compareEslStudents,
	assertValidMeetings,
	describeMeetingShapeError,
	classifySchedule,
	ESL_ROOM_SUGGESTIONS,
	findScheduleProblems,
	describeScheduleProblem,
	grade10SectionOf,
	grade10SiblingLevel,
	isLevelledGrade,
	isSharedRosterGrade,
	type EslDay,
	type EslScheduleNeighbour,
	type EslScheduleProblemDetail,
	type EslUnavailableSlot
} from '../shared/esl';
import { roomsThrough } from '../shared/esl-rooms';

async function configuredRooms(ctx: QueryCtx | MutationCtx, year: string) {
	const semesterOne = await ctx.db
		.query('esl_semesters')
		.withIndex('by_year_term', (q) => q.eq('year', year).eq('term', 'S1'))
		.first();
	const department = semesterOne?.eslRoomLimit
		? roomsThrough(semesterOne.eslRoomLimit)
		: [...ESL_ROOM_SUGGESTIONS];
	return { department, custom: semesterOne?.eslCustomRooms ?? [] };
}

async function cohortRoomOptions(ctx: QueryCtx | MutationCtx, cohort: Doc<'esl_cohorts'>) {
	const configured = await configuredRooms(ctx, cohort.year);
	const homerooms = isLevelledGrade(cohort.grade)
		? new Set(
				(await findBandCohortsWithHomerooms(ctx, cohort)).flatMap((member) => member.homerooms)
			)
		: new Set(await cohortHomeroomSet(ctx, cohort));
	return [...new Set([...configured.department, ...configured.custom, ...homerooms])];
}

async function assertRoomAvailable(
	ctx: QueryCtx | MutationCtx,
	cohort: Doc<'esl_cohorts'>,
	room: string,
	currentRoom?: string
) {
	if (room === currentRoom) return;
	const options = await cohortRoomOptions(ctx, cohort);
	if (!options.some((option) => option.toLocaleLowerCase() === room.toLocaleLowerCase())) {
		throw new Error(
			`${room} is not available for this school year. Choose a listed ESL room or cohort homeroom.`
		);
	}
}

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
			// Eligibility is decided by the same predicate that fills the teacher
			// dropdown (`listAssignable`), so a write can never accept a teacher
			// the UI would refuse to offer.
			if (!canTeachEslClass(teacher)) throw new Error('Teacher does not have an ESL role');
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

	// The calling section's room *after* the save — the drafted one when the
	// picker changed it, the saved one when it did not. The partner check used to
	// fall back to the saved room unconditionally, which let a save that only
	// changed the week's room onto a slot another class already holds slip
	// through: the mate path took over before that rule was asked about, and the
	// collision the proposal causes would be persisted (ADR-0028).
	const nextRoom = room === undefined ? (classRecord.room ?? undefined) : room;

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
	if (nextRoom !== undefined && nextRoom === partner.room) {
		problems.push({
			kind: 'room',
			message: `${classRecord.name} and ${partner.name} both meet in ${nextRoom}; the two sections need different rooms.`,
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
				room: section._id === classRecord._id ? nextRoom : (section.room ?? undefined),
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

/**
 * Whether two weeks are the same meeting set, whatever the row order.
 *
 * The client drafts slots in pick order and the saved rows read back in
 * insertion order, so a re-save of the week it already has can arrive shuffled;
 * only the *set* decides. This is what separates "the week changed" — the thing
 * a mirror save radiates — from "only the room changed", which touches one
 * class (ADR-0028).
 */
function meetingSetsEqual(
	a: readonly { day: EslDay; period: number }[],
	b: readonly { day: EslDay; period: number }[]
): boolean {
	if (a.length !== b.length) return false;
	const keys = new Set(a.map((meeting) => `${meeting.day} ${meeting.period}`));
	return b.every((meeting) => keys.has(`${meeting.day} ${meeting.period}`));
}

/**
 * One class as a mirror week is written to it.
 */
type MirrorMember = {
	classId: Doc<'esl_classes'>['_id'];
	name: string;
	type: Doc<'esl_classes'>['type'];
	cohortId: Doc<'esl_classes'>['cohortId'];
	/** Absent when the class has no teacher, which is not itself a conflict. */
	teacherId: Doc<'esl_classes'>['teacherId'];
	room: string | undefined;
};

/**
 * The classes a mirrored save also writes to, as one group.
 *
 * A grade 7–9 class whose cohort draws from a known set of Chinese homerooms
 * sits in an ability band the school moves students around in freely, and the
 * timetable only works if every same-type class in the band runs at the same
 * slots — so the mirrors are **derived**, never stored (ADR-0028): same class
 * type, same grade, same year, active, and a cohort in the source's sibling
 * band. Cohorts are siblings when their active rosters share at least one
 * Chinese homeroom, and the band is the transitive component of that relation;
 * an overlapping subset therefore joins the larger band rather than being
 * excluded by exact composition.
 *
 * An archived class or cohort is history and takes no part. A cohort with no
 * active roster — or one whose rows carry no parseable homeroom yet — has no
 * composition to match on, so it neither joins a group nor blocks one: the
 * write degrades to an ordinary single-class save.
 *
 * Grade 10 is excluded by the levelled-grade guard itself: its sections are
 * *paired*, not mirrored, and their own path (`writeGrade10Pair`) already
 * writes both sections of one Chinese class.
 *
 * cost: 1 indexed take of the year+grade cohorts, 1 roster take per active
 * cohort, then 1 classes query per band cohort. Bounded by one grade of one
 * year.
 */
async function findScheduleMirrorClasses(
	ctx: QueryCtx,
	classRecord: Doc<'esl_classes'>,
	year: string
): Promise<Doc<'esl_classes'>[]> {
	const cohort = await ctx.db.get(classRecord.cohortId);
	if (cohort === null || cohort.status !== 'active') return [];
	if (cohort.year !== year) return [];
	if (!isLevelledGrade(cohort.grade)) return [];

	const band = await findBandCohorts(ctx, cohort);
	const mirrors: Doc<'esl_classes'>[] = [];
	for (const candidate of band) {
		if (candidate._id === cohort._id) continue;
		const classes = await ctx.db
			.query('esl_classes')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', candidate._id))
			.collect();
		for (const cls of classes) {
			if (cls.status === 'active' && cls.type === classRecord.type) mirrors.push(cls);
		}
	}
	return mirrors;
}

/**
 * Judge a mirrored save for every class it would write, before anything is
 * written.
 *
 * Shared by the preview query and the write, so the dialog and the mutation can
 * never disagree about what a save would do — the same one-engine rule the
 * picker and `setSchedule` already observe.
 *
 * Every member runs the full department gate against the rest of the year, with
 * the whole group excluded from the neighbour set: the group meets at identical
 * slots by construction, so its members are no more each other's neighbours
 * than a grade 10 pair's are. What the general gate *cannot* see is a collision
 * *inside* the group — two classes sharing a room or a teacher at identical
 * slots — so those get the pair's own two explicit rules.
 *
 * Each member's gate problems carry its name as a prefix: N classes produce N
 * lists an admin would otherwise have to attribute themselves.
 */
async function evaluateMirrorGroup(
	ctx: QueryCtx,
	year: string,
	meetings: readonly { day: EslDay; period: number }[],
	members: readonly MirrorMember[]
): Promise<
	{
		classId: Doc<'esl_classes'>['_id'];
		name: string;
		problems: EslScheduleProblemDetail[];
	}[]
> {
	const neighbours = await gateNeighbours(
		ctx,
		year,
		members.map((member) => member.classId)
	);

	return Promise.all(
		members.map(async (member) => {
			const problems: EslScheduleProblemDetail[] = [];
			for (const other of members) {
				if (other.classId === member.classId) continue;
				const otherAsNeighbour = {
					classId: other.classId,
					className: other.name,
					cohortId: other.cohortId,
					teacherId: other.teacherId,
					room: other.room,
					meetings
				};
				if (member.room !== undefined && member.room === other.room) {
					problems.push({
						kind: 'room',
						message: `${member.name} and ${other.name} both meet in ${member.room}; the two classes need different rooms.`,
						otherName: other.name,
						other: otherAsNeighbour
					});
				}
				if (member.teacherId !== undefined && member.teacherId === other.teacherId) {
					problems.push({
						kind: 'cohort-teacher',
						message: `${member.name} and ${other.name} have the same teacher; the two classes need different ones.`,
						otherName: other.name,
						other: otherAsNeighbour
					});
				}
			}
			problems.push(
				...findScheduleProblems(
					{
						type: member.type,
						cohortId: member.cohortId,
						room: member.room,
						teacherId: member.teacherId,
						meetings
					},
					neighbours,
					await unavailableSlotsFor(ctx, member.teacherId, year)
				).map((problem) => ({ ...problem, message: `${member.name}: ${problem.message}` }))
			);
			return { classId: member.classId, name: member.name, problems };
		})
	);
}

/**
 * Write one mirror week to the source class and every mirror, atomically.
 *
 * Resolution stays server-side, as it is for the grade 10 pair: the group is a
 * fact about the cohorts, so a client cannot name an arbitrary set of classes
 * and have the server write to all of them.
 *
 * Atomic for the reason `writeGrade10Pair` is atomic: a partial write — the
 * source on the new week, its mirrors still on their own — is a state the gate
 * then refuses to repair, because any one of those repairs is itself a gated
 * write. Convex mutations are atomic, so the group is never split.
 */
async function writeMirrorGroup(
	ctx: MutationCtx,
	classRecord: Doc<'esl_classes'>,
	year: string,
	meetings: readonly { day: EslDay; period: number }[],
	gateRoom: string | undefined,
	mirrors: readonly Doc<'esl_classes'>[]
): Promise<void> {
	const members: MirrorMember[] = [
		{
			classId: classRecord._id,
			name: classRecord.name,
			type: classRecord.type,
			cohortId: classRecord.cohortId,
			teacherId: classRecord.teacherId ?? undefined,
			room: gateRoom
		},
		...mirrors.map((mirror) => ({
			classId: mirror._id,
			name: mirror.name,
			type: mirror.type,
			cohortId: mirror.cohortId,
			teacherId: mirror.teacherId ?? undefined,
			room: mirror.room ?? undefined
		}))
	];

	const evaluated = await evaluateMirrorGroup(ctx, year, meetings, members);
	// Deduplicated by sentence: two classes sharing a room each report the same
	// fault from their own side, and the refusal should read it once.
	const seen = new Set<string>();
	const problems = evaluated
		.flatMap((entry) => entry.problems)
		.filter((problem) => {
			const key = `${problem.kind} ${problem.day ?? ''} ${problem.period ?? ''} ${problem.otherName ?? ''} ${problem.message}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	if (problems.length > 0) throw new Error(describeRefusal(problems));

	// Each class's rows carry its own cohort's `e2eTag`, so an end-to-end run can
	// still tear down every group it created.
	const cohorts = await Promise.all(members.map((member) => ctx.db.get(member.cohortId)));
	for (const [index, member] of members.entries()) {
		await replaceYearMeetings(ctx, member.classId, year, meetings, cohorts[index]?.e2eTag);
	}
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
		if (args.room !== undefined && nextRoom !== undefined) {
			const cohort = await ctx.db.get(classRecord.cohortId);
			if (cohort !== null)
				await assertRoomAvailable(ctx, cohort, nextRoom, classRecord.room ?? undefined);
		}

		if ((await findGrade10PartnerClass(ctx, classRecord)) !== null) {
			await writeGrade10Pair(ctx, classRecord, args.year, args.meetings, gateRoom);
			if (args.room !== undefined) await ctx.db.patch(args.classId, { room: nextRoom });
			return { success: true, classId: args.classId, meetings: args.meetings };
		}

		/**
		 * A grade 7–9 class whose cohort shares its Chinese-homeroom composition
		 * with sibling cohorts mirrors its week onto every same-type class there —
		 * resolved server-side and written in one transaction (`writeMirrorGroup`,
		 * ADR-0028). Its gate covers every member of the group, so the single-class
		 * gate below is skipped deliberately: the two runs differ in their neighbour
		 * sets (here the group's own classes are excluded, below they are present),
		 * and judging the source against the mirrors' *old* weeks would refuse a
		 * save that is about to make them agree.
		 *
		 * The trigger is a *changed week*, not a save. A save whose meetings are
		 * the ones the class already holds can only be about the room — the setup
		 * flow sets rooms class by class through this same path, and it must not
		 * resurrect the confirm for a week nobody touched. Meeting unchanged, the
		 * write is a single-class save: the group's slots were set when the week
		 * changed, and re-radiating them from a room edit would both surprise an
		 * admin who only edited this card and demand healing a divergence they did
		 * not cause. A diverged band member is still flagged by the read's
		 * schedule badge, which is where it belongs.
		 */
		const mirrors = await findScheduleMirrorClasses(ctx, classRecord, args.year);
		if (
			mirrors.length > 0 &&
			// One indexed read of the saved week, only now that a group exists.
			!meetingSetsEqual(args.meetings, await meetingsOf(ctx, args.classId, args.year))
		) {
			await writeMirrorGroup(ctx, classRecord, args.year, args.meetings, gateRoom, mirrors);
			if (args.room !== undefined) await ctx.db.patch(args.classId, { room: nextRoom });
			return {
				success: true,
				classId: args.classId,
				meetings: args.meetings,
				/** How many same-type classes were written alongside the source. */
				mirrors: mirrors.length
			};
		}

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
		// Only THIS year's rows are replaced, and only this class's: with no partner
		// and no mirror group there is nothing else to write. See
		// `replaceYearMeetings` for the year scoping and `writeGrade10Pair` for why
		// a grade 10 pair cannot be two saves.
		//
		// A section with no partner at all falls through to the single-class path: a
		// school running `H101A` without `H101B` is unusual but not impossible, and it
		// must not be unschedulable over the absence of a section that does not exist.
		//
		// The room patch rides the same transaction as the meetings: the gate above
		// judged the week against `gateRoom`, so splitting the writes would let a
		// failure between them persist one without the other.
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
			if (next !== undefined)
				await assertRoomAvailable(ctx, cohort, next, classRecord.room ?? undefined);
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
 * cost: 1 point read of the cohort + 1 indexed cohort-range read and one
 * indexed roster take per cohort for G7–G9, or one roster take otherwise.
 */
export const listRoomSuggestions = query({
	args: { cohortId: v.id('esl_cohorts') },
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);

		const cohort = await ctx.db.get(args.cohortId);
		if (!cohort) throw new Error('Cohort not found');

		const configured = await configuredRooms(ctx, cohort.year);
		const homerooms = isLevelledGrade(cohort.grade)
			? new Set(
					(await findBandCohortsWithHomerooms(ctx, cohort)).flatMap((member) => member.homerooms)
				)
			: new Set(await cohortHomeroomSet(ctx, cohort));

		return {
			/** The year-configured department rooms, in corridor order. */
			department: configured.department,
			/** Additional rooms configured with the year's S1 semester. */
			custom: configured.custom,
			/** The cohort's G7–G9 band homerooms, ascending. */
			homerooms: [...homerooms].sort()
		};
	}
});

/**
 * What one proposed save would also set, as the confirm dialog reads it.
 *
 * Runs the same mirror resolution and the same group gate the mutation will
 * run — evaluate on preview, refuse on write — so the dialog can never bless a
 * save the mutation would refuse, and can never hide one it wouldn't. Each
 * target reports its name, whether the save overwrites a week it already has,
 * and every predicted problem; the dialog refuses to confirm while any problem
 * stands, because the write would be refused atomically anyway.
 *
 * The `room` argument is the room the picker is *drafting* for the source class
 * (absent means "leave it"), judged the way `setSchedule` judges `gateRoom` —
 * the save's outcome, not the stale saved value.
 *
 * An empty `targets` list means the save touches one class and no dialog is
 * needed; the class's grade not being levelled, an empty-roster cohort and a
 * divergent homeroom composition all arrive here as that same empty list.
 *
 * cost: one mirror resolution plus one neighbour pass — the same order as the
 * `setSchedule` write. Bounded by one grade of one year.
 */
export const listScheduleMirrors = query({
	args: {
		classId: v.id('esl_classes'),
		year: v.string(),
		meetings: v.array(meetingValidator),
		room: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		const classRecord = await ctx.db.get(args.classId);
		if (!classRecord) throw new Error('Class not found');

		const mirrors = await findScheduleMirrorClasses(ctx, classRecord, args.year);
		if (mirrors.length === 0) return { targets: [] };

		// The same rule the write applies: a save that does not change the class's
		// week can only be about the room, and it needs no confirm — the setup flow
		// sets rooms class by class through this path (ADR-0028). Agreeing here as
		// well as in the mutation is the one-engine rule: a dialog that appeared
		// for a save the mutation would not treat as a mirror write would confirm
		// a side effect that never happens.
		if (meetingSetsEqual(args.meetings, await meetingsOf(ctx, classRecord._id, args.year))) {
			return { targets: [] };
		}

		// The source's room as the save would leave it, matching `setSchedule`'s
		// `gateRoom`: a drafted room judges the proposal, an untouched one keeps
		// the saved value, and blank clears.
		const nextRoom =
			args.room === undefined
				? (classRecord.room ?? undefined)
				: args.room.trim() === ''
					? undefined
					: args.room.trim();

		const members: MirrorMember[] = [
			{
				classId: classRecord._id,
				name: classRecord.name,
				type: classRecord.type,
				cohortId: classRecord.cohortId,
				teacherId: classRecord.teacherId ?? undefined,
				room: nextRoom
			},
			...mirrors.map((mirror) => ({
				classId: mirror._id,
				name: mirror.name,
				type: mirror.type,
				cohortId: mirror.cohortId,
				teacherId: mirror.teacherId ?? undefined,
				room: mirror.room ?? undefined
			}))
		];

		const evaluated = await evaluateMirrorGroup(ctx, args.year, args.meetings, members);
		const problemsByClassId = new Map(evaluated.map((entry) => [entry.classId, entry.problems]));

		const cohorts = await Promise.all(mirrors.map((mirror) => ctx.db.get(mirror.cohortId)));
		const targets = await Promise.all(
			mirrors.map(async (mirror, index) => {
				const existing = await meetingsOf(ctx, mirror._id, args.year);
				const cohort = cohorts[index];
				return {
					classId: mirror._id,
					name: mirror.name,
					cohortLabel: cohort === null ? null : cohortLabel(cohort),
					/** True when the save replaces a week the class already has. */
					willOverwrite: existing.length > 0,
					/** Predicted gate failures for this class under the proposed week. */
					problems: problemsByClassId.get(mirror._id) ?? []
				};
			})
		);

		return { targets: targets.sort((a, b) => a.name.localeCompare(b.name)) };
	}
});
