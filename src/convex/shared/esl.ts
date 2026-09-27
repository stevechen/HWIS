/**
 * ESL department domain rules (bounded context, isolated from International).
 *
 * These are the invariants the Convex functions in `src/convex/esl/` enforce
 * and the frontend renders against, kept pure so both sides share one source
 * of truth without a Convex runtime.
 */

/** The four ESL class types, mirroring the class scheduler's classControl. */
export const ESL_CLASS_TYPES = ['CLIL', 'Comm', 'G9', 'H10'] as const;
export type EslClassType = (typeof ESL_CLASS_TYPES)[number];

/** Grades the ESL programme runs. */
export const ESL_GRADES = [7, 8, 9, 10] as const;
export type EslGrade = (typeof ESL_GRADES)[number];

/** Ability levels within a grade, ordered easiest to hardest. */
export const ESL_LEVELS = ['Pre-Ele', 'Ele', 'Basic', 'Int', 'Adv'] as const;
export type EslLevel = (typeof ESL_LEVELS)[number];

/** How a cohort may be numbered within its grade/level group. */
export const ESL_CLASS_NUMBERS = ['1', '2'] as const;
export type EslClassNumber = (typeof ESL_CLASS_NUMBERS)[number];

/** The lifecycle state of a cohort or class. Archived rows are read-only history. */
export const ESL_STATUSES = ['active', 'archived'] as const;
export type EslStatus = (typeof ESL_STATUSES)[number];

/** The lifecycle state of an ESL student, including transfers out. */
export const ESL_STUDENT_STATUSES = ['active', 'disabled'] as const;
export type EslStudentStatus = (typeof ESL_STUDENT_STATUSES)[number];

/** The fields that identify a cohort within a school year. */
export type EslCohortKey = {
	year: string;
	grade: number;
	level: string;
	classNumber: string;
};

/** Grades 7 and 8 are taught by two parallel classes that share one roster. */
export function isSharedRosterGrade(grade: number): boolean {
	return grade === 7 || grade === 8;
}

/**
 * The class types a cohort is taught as, in canonical order.
 *
 * G7/G8 cohorts are shared by a `CLIL` and a `Comm` class — both draw the
 * same roster. G9 and H10 cohorts are taught as a single class.
 */
export function classTypesForCohort(grade: number): EslClassType[] {
	if (isSharedRosterGrade(grade)) return ['CLIL', 'Comm'];
	if (grade === 9) return ['G9'];
	if (grade === 10) return ['H10'];
	throw new Error(`Unsupported ESL grade: ${grade}. Expected 7, 8, 9 or 10`);
}

/** Human label for a class type, e.g. `CLIL` -> `G7/8 CLIL`. */
export function classTypeLabel(type: EslClassType): string {
	switch (type) {
		case 'CLIL':
			return 'G7/8 CLIL';
		case 'Comm':
			return 'G7/8 Comm';
		default:
			return type;
	}
}

/** The default name for a class auto-composed onto a cohort. */
export function defaultClassName(cohort: EslCohortKey, type: EslClassType): string {
	return `${classTypeLabel(type)} ${cohort.level} ${cohort.classNumber}`;
}

/** The default display name for a cohort, e.g. `2025-2026 G7 Basic 1`. */
export function cohortLabel(cohort: EslCohortKey): string {
	return `${cohort.year} G${cohort.grade} ${cohort.level} ${cohort.classNumber}`;
}

/** School years are `YYYY-YYYY`. */
export function isValidSchoolYear(year: string): boolean {
	return /^\d{4}-\d{4}$/.test(year);
}

export function isValidEslGrade(grade: number): grade is EslGrade {
	return (ESL_GRADES as readonly number[]).includes(grade);
}

export function isValidEslLevel(level: string): level is EslLevel {
	return (ESL_LEVELS as readonly string[]).includes(level);
}

export function isValidEslClassNumber(classNumber: string): classNumber is EslClassNumber {
	return (ESL_CLASS_NUMBERS as readonly string[]).includes(classNumber);
}

/** School student IDs are 6 or 7 digits (both eras of the school's numbering). */
export function isValidSchoolStudentId(schoolStudentId: string): boolean {
	return /^\d{6,7}$/.test(schoolStudentId);
}

/**
 * Why a cohort cannot accept a student, or `null` when it can.
 * Archived cohorts are frozen; the other checks belong to the caller.
 */
export function cohortEnrollmentBlocker(status: EslStatus): string | null {
	return status === 'archived' ? 'Archived cohorts cannot accept new students' : null;
}

/**
 * Why a status transition is invalid, or `null` when it is allowed.
 *
 * Disabling requires a reason (that reason is the transfer record), and a
 * no-op transition is rejected so callers do not silently rewrite history.
 */
export function statusTransitionBlocker(
	from: EslStudentStatus,
	to: EslStudentStatus,
	statusReason?: string
): string | null {
	if (from === to) {
		return to === 'active' ? 'Student is already active' : 'Student is already disabled';
	}
	if (to === 'disabled' && !statusReason?.trim()) {
		return 'A status reason is required when disabling a student';
	}
	return null;
}

/** Sort key that puts disabled students last, then orders by English name. */
export function compareEslStudents(
	a: { status: EslStudentStatus; englishName: string; chineseName: string },
	b: { status: EslStudentStatus; englishName: string; chineseName: string }
): number {
	if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
	const byEnglish = a.englishName.localeCompare(b.englishName);
	return byEnglish !== 0 ? byEnglish : a.chineseName.localeCompare(b.chineseName);
}

function levelRank(level: string): number {
	const rank = ESL_LEVELS.indexOf(level as EslLevel);
	return rank === -1 ? ESL_LEVELS.length : rank;
}

/** Sort key for cohorts: grade, then level difficulty, then class number. */
export function compareEslCohorts(
	a: { grade: number; level: string; classNumber: string },
	b: { grade: number; level: string; classNumber: string }
): number {
	if (a.grade !== b.grade) return a.grade - b.grade;
	const byLevel = levelRank(a.level) - levelRank(b.level);
	return byLevel !== 0 ? byLevel : a.classNumber.localeCompare(b.classNumber);
}
