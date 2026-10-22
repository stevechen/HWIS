/**
 * Pure rules for carrying a school year's ESL cohorts into the next one.
 *
 * September arrives, the intake is a grade 7, and every cohort above it moves up
 * one grade. The workbook for the new year then arrives and corrects the grouping
 * this proposes, so the carry-forward is a starting point rather than a fact.
 *
 * Nothing here touches a database, so the mutation that applies a plan stays a
 * thin applier and the rules can be exercised without one (ADR-0022).
 *
 * What is *not* carried, and why:
 *
 * - **G9 does not carry into G10.** Grade 10's IDs name the school year itself rather
 *   than an intake, so a graduating student's ID can never equal a future grade 10
 *   student's. Treating G10 as all-new is forced by the school's numbering, not
 *   chosen as a simplification.
 * - **Disabled students are not carried.** A disabled row records someone who
 *   left the programme; copying them forward would put a student the school has
 *   already said goodbye to into the new year's roster. If the workbook lists
 *   them they come back as new, which is what genuinely re-enrolment means.
 */

/** A cohort as the planner reads it. */
export type AdvancementCohort = {
	id: string;
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
};

/** A student as the planner reads them. */
export type AdvancementStudent = {
	id: string;
	cohortId: string;
	schoolStudentId: string;
	chineseName: string;
	englishName?: string;
	status: 'active' | 'disabled';
};

/** A cohort to create in the new year. */
export type AdvancementCohortToCreate = {
	/** The cohort this one was carried from, so the report can name both. */
	fromCohortId: string;
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
	/** The identity the new cohort will have, matched to a student's old one. */
	key: string;
};

export type AdvancementStudentToCreate = {
	fromStudentId: string;
	/** The new cohort's identity, resolved to an id by the applier. */
	cohortKey: string;
	schoolStudentId: string;
	chineseName: string;
	englishName?: string;
};

/** What advancing one grade would do. */
export type YearAdvancementPlan =
	| {
			kind: 'advance';
			fromYear: string;
			toYear: string;
			fromGrade: number;
			/** The grade the carried cohorts land in — one above the source. */
			toGrade: number;
			cohorts: AdvancementCohortToCreate[];
			students: AdvancementStudentToCreate[];
	  }
	| { kind: 'already-advanced'; cohorts: string[]; reason: string }
	| { kind: 'refused'; reason: string }
	| { kind: 'nothing-to-carry'; reason: string };

/** A cohort's identity within a year, so `2` and `02` cannot read as two. */
export function advancementCohortKey(cohort: {
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
}): string {
	return `${cohort.year}:${cohort.grade}:${cohort.level ?? ''}:${cohort.classNumber}`;
}

/** The grade a cohort carries into, or null when it is not carried. */
export function advancementTargetGrade(grade: number): number | null {
	if (grade === 7) return 8;
	if (grade === 8) return 9;
	// Grade 9 graduates into a disjoint ID space, and grade 10 is the intake
	// cohort of its own year, created by its own file.
	return null;
}

/**
 * Plan carrying one grade of one year into the next.
 *
 * `sourceCohorts` are the cohorts of `fromGrade` in `fromYear`; `targetCohorts`
 * is what already exists for the target grade in `toYear`.
 */
export function planYearAdvancement(args: {
	fromYear: string;
	toYear: string;
	fromGrade: number;
	sourceCohorts: readonly AdvancementCohort[];
	sourceStudents: readonly AdvancementStudent[];
	targetCohorts: readonly AdvancementCohort[];
}): YearAdvancementPlan {
	const { fromYear, toYear, fromGrade, sourceCohorts, sourceStudents, targetCohorts } = args;

	const toGrade = advancementTargetGrade(fromGrade);
	if (toGrade === null) {
		return {
			kind: 'nothing-to-carry',
			reason:
				fromGrade === 9
					? 'Grade 9 graduates into grade 10, whose student IDs are a separate scheme, so no student can be carried forward.'
					: `Grade ${fromGrade} is not carried into another grade.`
		};
	}

	if (sourceCohorts.length === 0) {
		return {
			kind: 'nothing-to-carry',
			reason: `No grade ${fromGrade} cohorts exist in ${fromYear}, so there is nothing to carry into grade ${toGrade}.`
		};
	}

	// The carry-forward's own proposal, keyed by the cohort it comes from.
	const proposed = new Map(
		sourceCohorts.map((cohort) => [
			cohort.id,
			advancementCohortKey({
				year: toYear,
				grade: toGrade,
				level: cohort.level,
				classNumber: cohort.classNumber
			})
		])
	);

	const existing = new Set(targetCohorts.map(advancementCohortKey));
	const alreadyThere = [...proposed.values()].filter((key) => existing.has(key));
	const unexpected = [...existing].filter((key) => !proposed.has(key));

	// Every proposed cohort is already there: a previous advance, or a deliberate
	// re-run. Re-running must not double the cohorts, so this reports success and
	// writes nothing.
	if (alreadyThere.length === proposed.size) {
		return {
			kind: 'already-advanced',
			cohorts: targetCohorts.map((cohort) => cohort.id),
			reason: `${toYear} grade ${toGrade} already holds every cohort the carry-forward would create, so nothing was written.`
		};
	}

	// Some of the proposal is there and some is not: the year is half-advanced,
	// and filling whichever half was missing would leave a roster nobody chose.
	if (alreadyThere.length > 0) {
		return {
			kind: 'refused',
			reason: `${toYear} grade ${toGrade} already holds ${alreadyThere.length} of the ${proposed.size} cohorts this carry-forward would create. The year is half-advanced; delete the existing cohorts or start from a clean year.`
		};
	}

	// The target year holds cohorts this carry-forward never proposed — a grade 7
	// intake placed a Pre-Elementary class, or a file was already imported. Those
	// are the real roster for the year, and shadowing them is the one outcome
	// worse than not advancing at all.
	if (unexpected.length > 0) {
		return {
			kind: 'refused',
			reason: `${toYear} grade ${toGrade} already has ${unexpected.length} cohort(s) this carry-forward does not account for, so advancing would shadow a real roster. Import the file for that year instead.`
		};
	}

	return {
		kind: 'advance',
		fromYear,
		toYear,
		fromGrade,
		toGrade,
		cohorts: [...proposed.entries()].map(([fromCohortId, key]) => {
			const source = sourceCohorts.find((cohort) => cohort.id === fromCohortId)!;
			return {
				fromCohortId,
				key,
				year: toYear,
				grade: toGrade,
				...(source.level ? { level: source.level } : {}),
				classNumber: source.classNumber
			};
		}),
		// Keyed by the new cohort's identity rather than its id, which does not
		// exist until the applier has inserted it.
		students: sourceStudents
			.filter((student) => {
				if (student.status !== 'active') return false;
				return proposed.has(student.cohortId);
			})
			.map((student) => ({
				fromStudentId: student.id,
				cohortKey: proposed.get(student.cohortId)!,
				schoolStudentId: student.schoolStudentId,
				chineseName: student.chineseName,
				...(student.englishName === undefined ? {} : { englishName: student.englishName })
			}))
	};
}
