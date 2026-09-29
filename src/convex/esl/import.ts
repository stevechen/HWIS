import { mutation, query, type MutationCtx, type QueryCtx } from '../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { api } from '../_generated/api';
import { requireEslAdmin, requireEslStaff } from '../auth';
import { isValidEslGrade, isValidSchoolYear } from '../shared/esl';
import {
	cohortOfGroup,
	deriveSchoolYear,
	isGrade10Group,
	normalizeSchoolStudentId,
	parseRosterGroup,
	planRosterImport,
	type ExistingCohort,
	type ExistingStudent,
	type ImportPlan,
	type RequestedCohort,
	type RosterStudent
} from '../shared/esl_import';
import {
	advancementTargetGrade,
	planYearAdvancement,
	type AdvancementCohort,
	type AdvancementStudent
} from '../shared/esl_advancement';

/**
 * The most students one file may carry.
 *
 * A grade's roster is 400–495 students, and the apply runs as a single mutation
 * so that one file is applied whole or not at all (ADR-0022). Each student costs
 * at most one write, so this leaves room inside the 1000-document mutation limit
 * for a growth year plus the cohorts the file needs.
 *
 * Past this the headroom has to come from importing per cohort, which spends the
 * per-file atomicity to buy it — a decision to make deliberately, not one to
 * drift into by raising the number each September.
 */
const MAX_STUDENTS_PER_IMPORT = 600;

/**
 * One staged workbook row, as the cell text the sheet held.
 *
 * The payload carries text rather than a parse so the server can re-derive it
 * (see `applyRosterImport`). A parsed row would make the browser's reading
 * unfalsifiable: the server could only check that the numbers were in range, not
 * that they were the numbers in the file.
 */
const stagedRowArgs = v.object({
	schoolStudentId: v.string(),
	chineseName: v.string(),
	englishName: v.optional(v.string()),
	/** The `ESL Group` cell, e.g. `G9 Advanced 1`. */
	group: v.string()
});

/** The cohorts of one grade in one year, and the students enrolled in them. */
type RosterSnapshot = { cohorts: ExistingCohort[]; students: ExistingStudent[] };

/**
 * Reads the state one grade's file will be applied against.
 *
 * Scoped to the year, because a student's ID legitimately has one row per year —
 * this year's grade 8 is a different student from last year's grade 7, and
 * matching across the two would treat a returning student as a new one.
 */
async function loadSnapshot(
	ctx: QueryCtx | MutationCtx,
	year: string,
	grade: number
): Promise<RosterSnapshot> {
	const cohorts = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year_grade', (q) => q.eq('year', year).eq('grade', grade))
		.collect();

	const students: ExistingStudent[] = [];
	for (const cohort of cohorts) {
		const roster = await ctx.db
			.query('esl_students')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
			.take(500);
		for (const student of roster) {
			students.push({
				id: student._id,
				cohortId: cohort._id,
				schoolStudentId: student.schoolStudentId,
				chineseName: student.chineseName,
				englishName: student.englishName,
				status: student.status
			});
		}
	}

	return {
		cohorts: cohorts.map((cohort) => ({
			id: cohort._id,
			grade: cohort.grade,
			level: cohort.level,
			classNumber: cohort.classNumber
		})),
		students
	};
}

/** A staged row exactly as the file held it, before any reading of it. */
type StagedRow = {
	schoolStudentId: string;
	chineseName: string;
	englishName?: string;
	group: string;
};

/**
 * Re-reads the staged rows the way the parser read the workbook.
 *
 * Every row is refused or none is, because the browser already showed the admin
 * each row it could read: a row that fails here means the payload no longer
 * matches the file they approved, and importing the readable remainder would
 * apply a roster nobody saw.
 */
function readRows(
	rows: readonly StagedRow[],
	grade: number
): { roster: RosterStudent[]; problems: string[] } {
	const roster: RosterStudent[] = [];
	const problems: string[] = [];

	rows.forEach((row, index) => {
		// The server counts rows from 1 and knows nothing of the workbook's header
		// rows, so the number identifies the row within the file, not within the sheet.
		const rowNumber = index + 1;
		const schoolStudentId = normalizeSchoolStudentId(row.schoolStudentId);
		if (schoolStudentId === null) {
			problems.push(`Row ${rowNumber}: "${row.schoolStudentId}" is not a student ID`);
			return;
		}
		const chineseName = row.chineseName.trim();
		if (chineseName === '') {
			problems.push(`Row ${rowNumber} (${schoolStudentId}): no Chinese name`);
			return;
		}
		const group = parseRosterGroup(row.group);
		if (group === null) {
			problems.push(
				`Row ${rowNumber} (${schoolStudentId}): cannot read the ESL group "${row.group}"`
			);
			return;
		}
		// A section belongs to a grade 10 file and a level to a levelled one, in
		// either direction. Read with the same reading the parser used, so the
		// server cannot refuse a file the admin previewed and approved.
		if (isGrade10Group(group) !== (grade === 10)) {
			problems.push(
				isGrade10Group(group)
					? `Row ${rowNumber} (${schoolStudentId}): "${row.group}" is a grade 10 section, not a grade ${grade} class`
					: `Row ${rowNumber} (${schoolStudentId}): "${row.group}" is a levelled group, not a grade 10 section`
			);
			return;
		}
		if (group.grade !== grade) {
			// The file is applied per grade, and this row would place a student in
			// another grade's cohort. That is the wrong file, not a row to skip.
			problems.push(
				`Row ${rowNumber} (${schoolStudentId}): "${row.group}" is not a grade ${grade} group, so this does not look like the grade ${grade} file`
			);
			return;
		}

		const englishName = row.englishName?.trim();
		roster.push({
			schoolStudentId,
			chineseName,
			// A blank English name is left absent rather than stored empty, so a name
			// filled in later reads as adding one rather than editing `""`.
			...(englishName === undefined || englishName === '' ? {} : { englishName }),
			group
		});
	});

	return { roster, problems };
}

/** A readable list for a message that may otherwise name hundreds of IDs. */
function sample(values: readonly string[]): string {
	const shown = values.slice(0, 10).join(', ');
	return values.length > 10 ? `${shown} and ${values.length - 10} more` : shown;
}

/**
 * What makes this file unsafe to apply, or null when it is safe.
 *
 * A repeated ID in the file and a student with two rows this year are both cases
 * where the file and the database disagree about who the student is. Guessing
 * either would put the wrong person in a class and disable a real one, so both
 * are reported instead (ADR-0022).
 */
function blocker(plan: ImportPlan): string | null {
	const reasons: string[] = [];
	if (plan.duplicateIds.length > 0) {
		reasons.push(
			`These student IDs appear more than once in the file: ${sample(plan.duplicateIds)}`
		);
	}
	if (plan.ambiguousIds.length > 0) {
		reasons.push(
			`These student IDs have more than one record this year, so the file cannot be matched to them: ${sample(plan.ambiguousIds)}`
		);
	}
	return reasons.length > 0 ? `Import refused.\n${reasons.join('\n')}` : null;
}

/** Plans the file against a snapshot, listing each cohort the file asks for once. */
function buildPlan(snapshot: RosterSnapshot, roster: readonly RosterStudent[]): ImportPlan {
	const requested: RequestedCohort[] = [];
	const seen = new Set<string>();
	for (const student of roster) {
		// One cohort per group, keyed through the shared helper so the requested
		// cohorts here and the planner's own keys cannot drift apart.
		const request = cohortOfGroup(student.group);
		const key = `${request.grade}:${request.level ?? ''}:${request.classNumber}`;
		if (seen.has(key)) continue;
		seen.add(key);
		requested.push(request);
	}
	return planRosterImport(requested, roster, snapshot.cohorts, snapshot.students);
}

/**
 * The planner's student IDs are IDs it was handed from rows this mutation read,
 * so they are document IDs. The cast keeps the pure planner free of Convex types.
 */
function studentId(id: string): Id<'esl_students'> {
	return id as Id<'esl_students'>;
}

/**
 * The cohorts and students an advance would move, as the planner needs to see them.
 *
 * Read in one pass per grade rather than per cohort, so the cost is bounded by
 * the grade being advanced and not by the table size (ADR-0021).
 */
async function loadAdvancementInputs(
	ctx: QueryCtx | MutationCtx,
	fromYear: string,
	fromGrade: number,
	toYear: string,
	toGrade: number
) {
	const sourceCohorts = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year_grade', (q) => q.eq('year', fromYear).eq('grade', fromGrade))
		.collect();

	const targetCohorts = await ctx.db
		.query('esl_cohorts')
		.withIndex('by_year_grade', (q) => q.eq('year', toYear).eq('grade', toGrade))
		.collect();

	// Projected to the planner's own shape rather than passed as documents, so the
	// planner stays free of Convex types — as `planRosterImport` does with its
	// snapshot.
	const asCohort = (cohort: {
		_id: string;
		year: string;
		grade: number;
		level?: string;
		classNumber: string;
	}): AdvancementCohort => ({
		id: cohort._id,
		year: cohort.year,
		grade: cohort.grade,
		...(cohort.level === undefined ? {} : { level: cohort.level }),
		classNumber: cohort.classNumber
	});

	const sourceStudents: AdvancementStudent[] = [];
	for (const cohort of sourceCohorts) {
		const roster = await ctx.db
			.query('esl_students')
			.withIndex('by_cohortId', (q) => q.eq('cohortId', cohort._id))
			.collect();
		for (const student of roster) {
			sourceStudents.push({
				id: student._id,
				cohortId: student.cohortId,
				schoolStudentId: student.schoolStudentId,
				chineseName: student.chineseName,
				...(student.englishName === undefined ? {} : { englishName: student.englishName }),
				status: student.status
			});
		}
	}

	return {
		sourceCohorts: sourceCohorts.map(asCohort),
		sourceStudents,
		targetCohorts: targetCohorts.map(asCohort)
	};
}

/**
 * Carry one grade of a year into the next, as its own transaction.
 *
 * September brings a grade 7 intake and moves every cohort above it up one
 * grade, so the new year starts from the old year's shape rather than from
 * nothing. The arriving workbook then corrects that grouping, which is why this
 * is a proposal: nothing here is authoritative once the file lands (ADR-0022).
 *
 * Grade 10 is never carried into. Its student IDs are a separate scheme from
 * grade 9's, so a graduating student cannot be linked to their next-year record
 * even in principle, and its cohorts are the new year's own intake, created by
 * its own file.
 *
 * **Nothing in the prior year is touched.** A student has one row per year, and
 * last year's roster is history — which is the reason the whole model is scoped
 * by year. Advancing writes only into `toYear`.
 *
 * Idempotent: re-running reports the year as already advanced and writes nothing
 * rather than doubling the cohorts. Refuses when the target year already holds
 * a roster this carry-forward does not account for, so a mistaken advance cannot
 * shadow a real one.
 *
 * cost: O(#cohorts) indexed reads for the source grade, one roster read per
 * source cohort, then an insert per carried cohort and per carried student.
 */
export const advanceGrade = mutation({
	args: {
		fromYear: v.string(),
		toYear: v.string(),
		/** The grade being carried — 7 or 8. Grade 9 has nothing to carry into. */
		fromGrade: v.number()
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		if (!isValidSchoolYear(args.fromYear) || !isValidSchoolYear(args.toYear)) {
			throw new Error('Both years must be in YYYY-YYYY form');
		}
		if (!isValidEslGrade(args.fromGrade)) {
			throw new Error(`Grade ${args.fromGrade} is not one of the grades the ESL programme runs`);
		}

		const toGrade = advancementTargetGrade(args.fromGrade);
		if (toGrade === null) {
			return {
				advanced: false as const,
				reason:
					args.fromGrade === 9
						? 'Grade 9 graduates into grade 10, whose student IDs are a separate scheme, so no student can be carried forward. Grade 10 is created by its own import.'
						: `Grade ${args.fromGrade} is not carried into another grade.`
			};
		}

		const inputs = await loadAdvancementInputs(
			ctx,
			args.fromYear,
			args.fromGrade,
			args.toYear,
			toGrade
		);

		const plan = planYearAdvancement({
			fromYear: args.fromYear,
			toYear: args.toYear,
			fromGrade: args.fromGrade,
			sourceCohorts: inputs.sourceCohorts,
			sourceStudents: inputs.sourceStudents,
			targetCohorts: inputs.targetCohorts
		});

		if (plan.kind === 'nothing-to-carry' || plan.kind === 'already-advanced') {
			return { advanced: false as const, reason: plan.reason };
		}
		if (plan.kind === 'refused') {
			// Thrown rather than returned: the admin asked to advance and it will
			// not happen, so it must not read as a success that simply did less.
			throw new Error(`Year advance refused. ${plan.reason}`);
		}

		const now = Date.now();
		// Through `cohorts.create`, so the classes sharing each new cohort are
		// composed the same way as for a cohort made by hand: a G7/G8 cohort gets
		// its CLIL and Comm halves, a G9 cohort its single class.
		const idByKey = new Map<string, Id<'esl_cohorts'>>();
		for (const toCreate of plan.cohorts) {
			const { cohortId } = await ctx.runMutation(api.esl.cohorts.create, {
				year: toCreate.year,
				grade: toCreate.grade,
				...(toCreate.level === undefined ? {} : { level: toCreate.level }),
				classNumber: toCreate.classNumber
			});
			idByKey.set(toCreate.key, cohortId);
		}

		for (const student of plan.students) {
			const cohortId = idByKey.get(student.cohortKey);
			// Unreachable: every carried student's cohort is one this plan created.
			// Thrown rather than asserted, so a change in the planner cannot write
			// a student into no cohort at all.
			if (cohortId === undefined) {
				throw new Error(
					`Year advance refused: cohort ${student.cohortKey} was planned but not created`
				);
			}
			await ctx.db.insert('esl_students', {
				cohortId,
				...(student.englishName === undefined ? {} : { englishName: student.englishName }),
				chineseName: student.chineseName,
				schoolStudentId: student.schoolStudentId,
				status: 'active',
				enrolledAt: now
			});
		}

		return {
			advanced: true as const,
			fromGrade: plan.fromGrade,
			toGrade: plan.toGrade,
			cohortsCreated: plan.cohorts.length,
			studentsCarried: plan.students.length
		};
	}
});

/**
 * The roster a file will be applied to, for the browser to plan against.
 *
 * cost: 1 indexed scan of the year's cohorts for the grade, plus one roster read
 * per cohort — bounded by one grade (about 20 cohorts, 400–500 students), not the
 * table size (ADR-0021). Free-Quota Impact: ~500 document reads, once per staged
 * file, which is why the parse itself happens in the browser instead.
 */
export const rosterSnapshot = query({
	args: {
		year: v.string(),
		grade: v.number()
	},
	handler: async (ctx, args) => {
		await requireEslStaff(ctx);
		if (!isValidSchoolYear(args.year))
			throw new Error(`${args.year} is not a YYYY-YYYY school year`);
		return await loadSnapshot(ctx, args.year, args.grade);
	}
});

/**
 * Applies one grade's workbook roster.
 *
 * The rows arrive as cell text and the plan is built here, on the server, from
 * the same `shared/esl_import` functions the browser ran for its preview. The
 * plan is not taken from the client because the client is where a mistake would
 * be most convenient: a plan supplied by the browser is indistinguishable from a
 * correct one until the roster is already wrong. Deriving it twice from one
 * implementation is what makes the preview trustworthy.
 *
 * The whole file is one mutation, so it applies whole or not at all — and
 * deliberately only per grade, because the four grades are four files and an
 * admin uploads them one at a time (ADR-0022).
 *
 * cost: 2 snapshot reads (~500 documents each) + 1 indexed duplicate lookup per
 * cohort created + 1 write per new student, per group move, per approved rename
 * and per disable. Free-Quota Impact: ~500 document reads and up to
 * `MAX_STUDENTS_PER_IMPORT` writes per file, a few times a year.
 */
export const applyRosterImport = mutation({
	args: {
		year: v.string(),
		grade: v.number(),
		rows: v.array(stagedRowArgs),
		/**
		 * The students whose English name the admin approved changing, taken from
		 * the dry run's rename list. Every other stored name is kept, so a rename
		 * cannot happen without the admin having seen it as one.
		 */
		approvedNameChanges: v.optional(v.array(v.id('esl_students'))),
		/**
		 * Set only by end-to-end runs, so a test's roster can be removed by tag on
		 * the same pattern the other tables use. Absent in every real import.
		 */
		e2eTag: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await requireEslAdmin(ctx);

		if (!isValidSchoolYear(args.year)) {
			throw new Error(`${args.year} is not a YYYY-YYYY school year`);
		}
		if (!isValidEslGrade(args.grade)) {
			throw new Error(`Grade ${args.grade} is not one of the grades the ESL programme runs`);
		}
		if (args.rows.length === 0) throw new Error('The file has no student rows to import');
		if (args.rows.length > MAX_STUDENTS_PER_IMPORT) {
			throw new Error(
				`This file has ${args.rows.length} rows, over the ${MAX_STUDENTS_PER_IMPORT} a single import accepts`
			);
		}

		const { roster, problems } = readRows(args.rows, args.grade);
		if (problems.length > 0) {
			throw new Error(
				`Import refused: ${problems.length} of ${args.rows.length} rows could not be read.\n${problems.slice(0, 10).join('\n')}`
			);
		}

		// The IDs carry the school year, so a file for the wrong year is caught by
		// arithmetic rather than by the admin noticing. G10 cannot be checked this
		// way, which is why it needs a year confirmed by hand.
		const derived = deriveSchoolYear(
			args.grade,
			roster.map((student) => student.schoolStudentId)
		);
		if (derived.kind === 'conflict') {
			throw new Error(
				`These rows carry two different school years (${derived.years.join(' and ')}), which usually means two years were saved into one workbook.`
			);
		}
		// Grade 10's IDs name no year, so there is nothing to check the
		// confirmed year against. The admin's word is the only statement
		// available, and it is the year these rows are applied into.
		if (derived.kind === 'unsupported' && args.grade !== 10) {
			throw new Error(derived.reason);
		}
		if (derived.kind === 'current' && derived.year !== args.year) {
			throw new Error(
				`These student IDs indicate school year ${derived.year}, but the import was confirmed for ${args.year}.`
			);
		}

		// Create the cohorts the file needs before planning the students, so the
		// planner can stay a pure function of a complete set of cohorts rather than
		// carrying the creation step with it.
		const firstPlan = buildPlan(await loadSnapshot(ctx, args.year, args.grade), roster);
		const refusal = blocker(firstPlan);
		if (refusal) throw new Error(refusal);

		const creationFailures: string[] = [];
		for (const missing of firstPlan.missingCohorts) {
			try {
				// Through `cohorts.create`, so the classes sharing the cohort are
				// composed the same way as for a cohort made by hand.
				await ctx.runMutation(api.esl.cohorts.create, {
					year: args.year,
					grade: missing.grade,
					level: missing.level,
					classNumber: missing.classNumber,
					...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag })
				});
			} catch (error) {
				// Kept rather than thrown: a cohort another admin created a moment ago
				// fails the uniqueness check and is exactly what the file needs. The
				// re-plan below is what decides, because only it can see the cohort.
				creationFailures.push(
					`${missing.grade} ${missing.level} ${missing.classNumber}: ${error instanceof Error ? error.message : 'could not be created'}`
				);
			}
		}

		const snapshot = await loadSnapshot(ctx, args.year, args.grade);
		const plan = buildPlan(snapshot, roster);
		if (plan.missingCohorts.length > 0) {
			const wanted = plan.missingCohorts
				.map((c) => `${c.grade} ${c.level} ${c.classNumber}`)
				.join(', ');
			throw new Error(
				`Import refused: the file needs cohorts that do not exist and could not be created (${wanted}).\n${creationFailures.join('\n')}`
			);
		}
		const secondRefusal = blocker(plan);
		if (secondRefusal) throw new Error(secondRefusal);

		const cohortIdByKey = new Map(
			snapshot.cohorts.map((cohort) => [
				`${cohort.grade}:${cohort.level ?? ''}:${cohort.classNumber}`,
				cohort.id
			])
		);
		const approvedNames = new Set(args.approvedNameChanges ?? []);
		const now = Date.now();
		const declinedRenames: string[] = [];
		let added = 0;
		let moved = 0;
		let renamed = 0;
		let disabled = 0;
		let unchanged = 0;

		for (const change of plan.changes) {
			switch (change.kind) {
				case 'new': {
					const cohortId = cohortIdByKey.get(change.cohortKey);
					// Unreachable: the plan above found no missing cohort, so every
					// cohort a `new` change names is in the map. Thrown rather than
					// asserted so a change in the planner cannot insert an invalid row.
					if (cohortId === undefined) {
						throw new Error(`Import refused: cohort ${change.cohortKey} is missing`);
					}
					await ctx.db.insert('esl_students', {
						cohortId: cohortId as Id<'esl_cohorts'>,
						...(args.e2eTag === undefined ? {} : { e2eTag: args.e2eTag }),
						...(change.student.englishName === undefined
							? {}
							: { englishName: change.student.englishName }),
						chineseName: change.student.chineseName,
						schoolStudentId: change.student.schoolStudentId,
						status: 'active',
						enrolledAt: now
					});
					added += 1;
					break;
				}
				case 'levelChange': {
					await ctx.db.patch(studentId(change.studentId), {
						cohortId: change.toCohortId as Id<'esl_cohorts'>
					});
					moved += 1;
					break;
				}
				case 'nameChange': {
					if (!approvedNames.has(studentId(change.studentId))) {
						declinedRenames.push(change.schoolStudentId);
						break;
					}
					await ctx.db.patch(studentId(change.studentId), { englishName: change.to });
					renamed += 1;
					break;
				}
				case 'disabled': {
					await ctx.db.patch(studentId(change.studentId), {
						status: 'disabled',
						disabledAt: now,
						statusReason: change.reason
					});
					disabled += 1;
					break;
				}
				case 'unchanged': {
					unchanged += 1;
					break;
				}
			}
		}

		return {
			year: args.year,
			grade: args.grade,
			added,
			moved,
			renamed,
			disabled,
			unchanged,
			cohortsCreated: firstPlan.missingCohorts.map((c) => `${c.grade} ${c.level} ${c.classNumber}`),
			// Reported so the admin knows these names were left as they are, rather
			// than assuming the file was applied in full.
			declinedRenames
		};
	}
});
