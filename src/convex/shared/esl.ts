/**
 * ESL department domain rules (bounded context, isolated from International).
 *
 * These are the invariants the Convex functions in `src/convex/esl/` enforce
 * and the frontend renders against, kept pure so both sides share one source
 * of truth without a Convex runtime.
 */

/** The ESL class types, mirroring the class scheduler's classControl. */
export const ESL_CLASS_TYPES = ['CLIL', 'Comm', 'G9', 'H10A', 'H10B'] as const;
export type EslClassType = (typeof ESL_CLASS_TYPES)[number];

/** The two sections a grade 10 cohort is split into. */
export const ESL_GRADE10_SECTIONS = ['A', 'B'] as const;
export type EslGrade10Section = (typeof ESL_GRADE10_SECTIONS)[number];

/** Grades the ESL programme runs. */
export const ESL_GRADES = [7, 8, 9, 10] as const;
export type EslGrade = (typeof ESL_GRADES)[number];

/**
 * Ability levels within a grade, ordered easiest to hardest.
 *
 * These are the school's official level names, which are also what the roster
 * workbooks use. They are stored verbatim so the department's own wording is
 * what appears in the UI and in a cohort code; the short forms the workbooks
 * sometimes abbreviate (`Ele`, `Int`) are accepted on import through
 * `normalizeEslLevel` rather than stored.
 */
export const ESL_LEVELS = [
	'Pre-Elementary',
	'Elementary',
	'Basic',
	'Intermediate',
	'Advanced'
] as const;
export type EslLevel = (typeof ESL_LEVELS)[number];

/**
 * Spellings accepted on import that are not the official level name.
 *
 * The workbooks use the official names, but abbreviate in places (`G9 Ele 1`
 * for `G9 Elementary 1`) and contain at least one value missing a space
 * (`G9 Elementary1`). Normalising on read means the importer matches on a
 * single canonical vocabulary while tolerating the spelling drift in the
 * files, instead of failing an import over a space.
 *
 * Keys are compared after lowercasing and stripping non-alphanumerics, so
 * `Pre-Ele`, `pre_ele` and `PRE-ELE` all reach the same entry.
 */
const ESL_LEVEL_ALIASES: Readonly<Record<string, EslLevel>> = {
	preele: 'Pre-Elementary',
	pree: 'Pre-Elementary',
	preelementary: 'Pre-Elementary',
	ele: 'Elementary',
	elementary: 'Elementary',
	basic: 'Basic',
	int: 'Intermediate',
	inter: 'Intermediate',
	intermediate: 'Intermediate',
	adv: 'Advanced',
	advanced: 'Advanced'
};

/** Reduce a level spelling to its comparison key: lowercase, letters and digits only. */
function levelKey(level: string): string {
	return level.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve any accepted spelling of a level to its official name, or null when
 * it is not a level at all.
 *
 * An unrecognised level returns null rather than being guessed at, so the
 * import reports it and the admin fixes the workbook. Coercing an unknown value
 * into a level would silently misfile a class.
 */
export function normalizeEslLevel(level: string): EslLevel | null {
	return ESL_LEVEL_ALIASES[levelKey(level)] ?? null;
}

/** Whether a string is one of the official level names. */
export function isEslLevel(level: string): level is EslLevel {
	return (ESL_LEVELS as readonly string[]).includes(level);
}

/**
 * How a cohort may be numbered within its grade/level group.
 *
 * The school runs up to seven classes per level (G8 has Intermediate 1–7 and
 * Basic 1–7; G9 has Basic 1–7), so this spans 1–7. Grade 10 is not levelled and
 * its base classes are open-ended instead (see `isValidGrade10ClassNumber`).
 */
export const ESL_CLASS_NUMBERS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type EslClassNumber = (typeof ESL_CLASS_NUMBERS)[number];

/**
 * The widest grade 10 base-class number, set so the `H1nn` class name stays a
 * fixed width: base class 99 is H199.
 *
 * The school decides how many base classes each year actually runs — it is not
 * a fixed roster — so this bounds the *name format*, it does not enumerate the
 * classes that exist.
 */
export const ESL_GRADE10_MAX_CLASS_NUMBER = 99;

/**
 * How a grade 10 class number renders and compares.
 *
 * `H1` is the 高一 (grade 10) marker and the base class is zero-padded to two
 * digits, so H101 is base class 1 and H110 is base class 10. Padding also makes
 * lexical comparison — which is what the `by_year_code` index and the cohort
 * sort both use — order them numerically.
 */
export function grade10BaseClass(classNumber: string): string {
	return String(Number(classNumber)).padStart(2, '0');
}

/** Grade 10 base-class numbers span 1–`ESL_GRADE10_MAX_CLASS_NUMBER`. */
export function isValidGrade10ClassNumber(classNumber: string): boolean {
	if (!/^\d{1,2}$/.test(classNumber)) return false;
	const value = Number(classNumber);
	return value >= 1 && value <= ESL_GRADE10_MAX_CLASS_NUMBER;
}

/**
 * The Chinese homeroom marker each grade's class names carry.
 *
 * A rule of the school system rather than a shape measured from one workbook: a
 * junior high homeroom is `J` followed by the grade it belongs to — `J101` is
 * grade 7 class 01, `J201` is grade 8 class 01 — and senior high uses the 高一
 * marker `H1`, exactly as `grade10ClassName` already reads (ADR-0025).
 *
 * So the marker is fully derivable from the grade a cohort belongs to, which is
 * why only the class number is stored and the full name is rebuilt on read.
 */
const CHINESE_CLASS_MARKERS: Readonly<Record<number, string>> = {
	7: 'J1',
	8: 'J2',
	9: 'J3',
	10: 'H1'
};

/**
 * A Chinese homeroom's full name, rebuilt from a grade and a class number.
 *
 * The inverse of `parseChineseClass`, and the only place the two halves are
 * joined — so if the school's naming ever changes there is one function to fix
 * rather than several hundred stored strings to migrate.
 */
export function chineseClassCode(grade: number, classNumber: string): string {
	const marker = CHINESE_CLASS_MARKERS[grade];
	if (marker === undefined) return `${classNumber}`;
	return `${marker}${String(Number(classNumber)).padStart(2, '0')}`;
}

/** Why a `C Class` cell could not be read, phrased for the admin fixing the cell. */
export type ChineseClassReadError =
	| 'empty'
	| 'shape'
	| { kind: 'wrongGrade'; expected: string; found: string };

/**
 * Read a `C Class` / `Class` cell down to the number that is stored.
 *
 * Only the school's own full form is accepted — `J1nn`, `J2nn`, `J3nn`, `H1nn`.
 * A bare `1`, a bare `701`, or anything else is refused rather than guessed at:
 * `7` in `701` could be the grade or the first digit of the number, and a silent
 * misread would file a student in a homeroom they are not in, which is the one
 * error on this field that no later check would catch (ADR-0025).
 *
 * A marker that disagrees with the file's grade is refused separately, because
 * it is the check the derivation buys us: a `J201` cell in a grade 7 workbook is
 * provably wrong, and saying so names the fix.
 */
export function parseChineseClass(
	raw: string,
	grade: number
): { classNumber: string } | { error: ChineseClassReadError } {
	const trimmed = raw.trim();
	if (trimmed === '') return { error: 'empty' };

	const match = /^([A-Z][0-9])([0-9]{2})$/.exec(trimmed.toUpperCase());
	if (!match) return { error: 'shape' };

	const [, marker, digits] = match;
	const expected = CHINESE_CLASS_MARKERS[grade];
	if (expected === undefined) return { error: 'shape' };
	if (marker !== expected) {
		return { error: { kind: 'wrongGrade', expected, found: marker } };
	}
	// `00` is not a class the school runs; the number is checked as a number so
	// `00` cannot be stored and later sort ahead of every real class.
	if (Number(digits) < 1) return { error: 'shape' };

	return { classNumber: digits };
}

/** The lifecycle state of a cohort or class. Archived rows are read-only history. */
export const ESL_STATUSES = ['active', 'archived'] as const;
export type EslStatus = (typeof ESL_STATUSES)[number];

/** The lifecycle state of an ESL student, including transfers out. */
export const ESL_STUDENT_STATUSES = ['active', 'disabled'] as const;
export type EslStudentStatus = (typeof ESL_STUDENT_STATUSES)[number];

/**
 * The fields that identify a cohort within a school year.
 *
 * `level` is absent for grade 10, which is not levelled: its cohorts are the
 * base classes H101…H110, split into A/B sections rather than ability bands.
 */
export type EslCohortKey = {
	year: string;
	grade: number;
	level?: string;
	classNumber: string;
};

/**
 * Grades whose cohort is taught by two classes sharing one roster.
 *
 * G7/G8 pair a `CLIL` with a `Comm` class. Grade 10 does **not** qualify: `A` and
 * `B` are its ability levels, holding different students, so they are two cohorts
 * with two rosters rather than two lessons to one group (ADR-0023).
 */
export function isSharedRosterGrade(grade: number): boolean {
	return grade === 7 || grade === 8;
}

/**
 * Grade 10's ability levels, `A` higher in capability than `B`.
 *
 * These are levels, not sections: the school's sorting test puts each student in
 * one, and the two hold different students (ADR-0023).
 */
export const ESL_GRADE10_LEVELS = ['A', 'B'] as const;
export type EslGrade10Level = (typeof ESL_GRADE10_LEVELS)[number];

/** Whether a letter names one of grade 10's levels. */
export function isGrade10Level(value: string): value is EslGrade10Level {
	return (ESL_GRADE10_LEVELS as readonly string[]).includes(value);
}

/**
 * Grade 10 splits by ability level and Chinese class; grades 7–9 split by ability
 * level and a class number.
 *
 * Named for how the class number is bounded: the levelled grades number their
 * classes `1`–`7`, while grade 10's is a Chinese-class number (ADR-0023).
 */
export function isLevelledGrade(grade: number): boolean {
	return grade === 7 || grade === 8 || grade === 9;
}

/** The section letter a grade 10 class type carries, or `null` for other types. */
export function grade10SectionOf(type: EslClassType): EslGrade10Section | null {
	if (type === 'H10A') return 'A';
	if (type === 'H10B') return 'B';
	return null;
}

/**
 * The class types a cohort is taught as, in canonical order.
 *
 * Only the grade and level are needed: what a cohort is taught as does not depend
 * on the year it belongs to.
 *
 * G7/G8 cohorts are shared by a `CLIL` and a `Comm` class — both draw the same
 * roster, because they are two lessons to one group. G9 is taught as a single class.
 *
 * Grade 10 takes the level rather than just the grade, because which type it gets
 * depends on that: a cohort is one ability band of one Chinese class and is taught
 * by exactly one class, `H10A` or `H10B` (ADR-0023). Keying this on the grade alone
 * is what put both levels on one cohort in the first place.
 */
export function classTypesForCohort(cohort: { grade: number; level?: string }): EslClassType[] {
	const { grade } = cohort;
	if (grade === 7 || grade === 8) return ['CLIL', 'Comm'];
	if (grade === 9) return ['G9'];
	if (grade === 10) {
		const level = cohort.level;
		if (level === undefined || !isGrade10Level(level)) {
			throw new Error(`Grade 10 cohort has no ability level: ${JSON.stringify(cohort)}`);
		}
		return [level === 'A' ? 'H10A' : 'H10B'];
	}
	throw new Error(`Unsupported ESL grade: ${grade}. Expected 7, 8, 9 or 10`);
}

/**
 * The lesson token a class name ends with, or `null` when it has none.
 *
 * Grade 7/8 classes are `CLIL` or `Comm`; grade 9's single class is already
 * identified by the grade, so repeating `G9` in its name would be noise. Grade 10
 * names are a single token and carry no lesson.
 */
function classNameLesson(type: EslClassType): 'CLIL' | 'Comm' | null {
	if (type === 'CLIL') return 'CLIL';
	if (type === 'Comm') return 'Comm';
	return null;
}

/** Human label for a class type, e.g. `CLIL` -> `G7/8 CLIL`. */
export function classTypeLabel(type: EslClassType): string {
	switch (type) {
		case 'CLIL':
			return 'G7/8 CLIL';
		case 'Comm':
			return 'G7/8 Comm';
		case 'G9':
			return 'G9';
		case 'H10A':
			return 'G10 A';
		case 'H10B':
			return 'G10 B';
	}
}

/**
 * The class name for a grade 10 cohort's class, e.g. `H101A` / `H101B`.
 *
 * Grade 10 class names carry the grade (`H10`), the zero-padded Chinese-class
 * number, and the level letter — there is no ability-level *word* in them, because
 * the level is what distinguishes the two classes of one Chinese class.
 */
export function grade10ClassName(classNumber: string, type: EslClassType): string {
	const section = grade10SectionOf(type);
	if (!section) {
		throw new Error(`${type} is not a grade 10 class type`);
	}
	return `H1${grade10BaseClass(classNumber)}${section}`;
}

/**
 * The default name for a class auto-composed onto a cohort.
 *
 * The levelled grades name a class the way the school does: grade, level, class
 * number, then the kind of lesson — `G7 Elementary 1 CLIL`, `G8 Advanced 3 Comm`.
 * The lesson comes last because it is the only part that differs between the two
 * classes a cohort is taught by; the rest identifies the cohort they share.
 *
 * Grade 10 is named by the school as a single token, `H101A`, and is left alone.
 */
export function defaultClassName(cohort: EslCohortKey, type: EslClassType): string {
	if (!isLevelledGrade(cohort.grade)) {
		return grade10ClassName(cohort.classNumber, type);
	}
	const lesson = classNameLesson(type);
	return `G${cohort.grade} ${cohort.level} ${cohort.classNumber}${lesson ? ` ${lesson}` : ''}`;
}

/**
 * The default display name for a cohort, e.g. `2025-2026 G7 Basic 1` or
 * `2025-2026 G10 H101A`.
 *
 * A grade 10 cohort is one Chinese class at one level, so its label carries the
 * level: `H101` alone would name two cohorts (ADR-0023).
 */
export function cohortLabel(cohort: EslCohortKey): string {
	if (!isLevelledGrade(cohort.grade)) {
		const level = cohort.level ?? '';
		return `${cohort.year} G${cohort.grade} H1${grade10BaseClass(cohort.classNumber)}${level}`;
	}
	return `${cohort.year} G${cohort.grade} ${cohort.level} ${cohort.classNumber}`;
}

/**
 * The cohort's canonical identity within a year: `G7-Basic-1`, `G9-Int-2`,
 * `G10-01`.
 *
 * Grade 10 contributes no level, because it has none — its base class alone
 * identifies the cohort.
 */
export function cohortCode(cohort: EslCohortKey): string {
	if (!isLevelledGrade(cohort.grade)) {
		// Padded so `G10-02` and `G10-10` compare in numeric order, and carrying the
		// level so `H101A` and `H101B` are two codes rather than one (ADR-0023).
		return `G${cohort.grade}-${grade10BaseClass(cohort.classNumber)}${cohort.level ?? ''}`;
	}
	return `G${cohort.grade}-${cohort.level}-${cohort.classNumber}`;
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

/**
 * Whether a class number is valid for a grade.
 *
 * Grade 10's base classes are open-ended within the name-format bound; the
 * levelled grades run the fixed `1`–`2`.
 */
export function isValidClassNumberForGrade(grade: number, classNumber: string): boolean {
	return isLevelledGrade(grade)
		? isValidEslClassNumber(classNumber)
		: isValidGrade10ClassNumber(classNumber);
}

/**
 * School student IDs are 6 or 7 digits.
 *
 * Which is which is the discriminator between grade 10 and the levelled grades:
 * grade 10 is six, every levelled grade seven, measured across the September 2025
 * workbooks with no exceptions (ADR-0022 §Context). So this accepts both, and
 * `isGrade10StudentId` in `esl_import` is what tells them apart.
 */
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

/**
 * Sort key that puts disabled students last, then orders by English name.
 *
 * A student with no English name sorts by their Chinese name instead, so an
 * intake that has not been named yet still reads in a sensible order rather
 * than collapsing into one block at the top of the roster.
 */
export function compareEslStudents(
	a: { status: EslStudentStatus; englishName?: string; chineseName: string },
	b: { status: EslStudentStatus; englishName?: string; chineseName: string }
): number {
	if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
	const byEnglish = (a.englishName ?? a.chineseName).localeCompare(b.englishName ?? b.chineseName);
	return byEnglish !== 0 ? byEnglish : a.chineseName.localeCompare(b.chineseName);
}

function levelRank(level: string | undefined): number {
	if (!level) return ESL_LEVELS.length;
	const rank = ESL_LEVELS.indexOf(level as EslLevel);
	return rank === -1 ? ESL_LEVELS.length : rank;
}

/**
 * A cohort row carrying a level written before the official level names were
 * adopted, when the vocabulary was `Pre-Ele`/`Ele`/`Int`/`Adv`.
 */
export type LegacyLevelCohortRow = {
	_id: string;
	level?: string;
};

/** The writes that move a cohort's level onto the official name. */
export type LegacyLevelRepair = {
	cohorts: { id: string; level: EslLevel }[];
};

/**
 * Plan the rewrite of cohort levels stored under the old short vocabulary.
 *
 * Levels were originally stored as `Pre-Ele`/`Ele`/`Basic`/`Int`/`Adv`. The
 * department's official names are now the stored vocabulary, so a cohort still
 * on a short code would be excluded from level-filtered reads and would sort
 * last under `compareEslCohorts`, because neither function knows the short form.
 *
 * A level that resolves to an official name is rewritten to it; a level that
 * resolves to nothing is left untouched and reported by the caller, since
 * guessing a level would silently misfile a roster. Idempotent: a cohort
 * already on an official name plans no write.
 *
 * Pure so the plan is testable without a database and the mutation stays a
 * thin applier, matching `planLegacyGrade10Repair`.
 */
export function planLegacyLevelRepair(cohorts: readonly LegacyLevelCohortRow[]): LegacyLevelRepair {
	const patches: LegacyLevelRepair['cohorts'] = [];
	for (const cohort of cohorts) {
		if (cohort.level === undefined) continue;
		if (isEslLevel(cohort.level)) continue;
		const normalized = normalizeEslLevel(cohort.level);
		if (normalized === null) continue;
		patches.push({ id: cohort._id, level: normalized });
	}
	return { cohorts: patches };
}

/**
 * A class row as read for repair, tolerating the pre-correction `type`. */
export type LegacyClassRow = {
	_id: string;
	cohortId: string;
	type: string;
	name: string;
};

/** A cohort row as read for repair, tolerating a level on grade 10. */
export type LegacyCohortRow = {
	_id: string;
	grade: number;
	classNumber: string;
	level?: string;
};

/** The writes that put the pre-correction rows into the current model. */
export type LegacyGrade10Repair = {
	cohorts: { id: string; level: undefined; classNumber: string }[];
	classes: { id: string; type: 'H10A'; name: string }[];
};

/**
 * Plan the repair for rows written before the grade 10 model was corrected.
 *
 * The old model had one `H10` class type and a level on every cohort. Grade 10
 * is not levelled and is taught by two sections, so a legacy `H10` class becomes
 * the cohort's `A` section — renamed to the `H1nnA` form — and the cohort drops
 * its level. The matching `B` section has to be created by hand.
 *
 * Pure so the plan is testable without a database, and so the mutation stays a
 * thin applier. Idempotent: rows already in the new shape plan no writes.
 */
export function planLegacyGrade10Repair(
	cohorts: readonly LegacyCohortRow[],
	classes: readonly LegacyClassRow[]
): LegacyGrade10Repair {
	const cohortPatches: LegacyGrade10Repair['cohorts'] = [];
	for (const cohort of cohorts) {
		if (cohort.grade !== 10) continue;
		// The level is meaningless for grade 10, so drop it. `classNumber` is
		// normalised to the zero-padded base class the current code expects.
		if (cohort.level !== undefined) {
			cohortPatches.push({
				id: cohort._id,
				level: undefined,
				classNumber: grade10BaseClass(cohort.classNumber)
			});
		}
	}

	const classPatches: LegacyGrade10Repair['classes'] = [];
	for (const row of classes) {
		if (row.type !== 'H10') continue;
		const cohort = cohorts.find((c) => c._id === row.cohortId);
		classPatches.push({
			id: row._id,
			type: 'H10A',
			name: cohort ? grade10ClassName(grade10BaseClass(cohort.classNumber), 'H10A') : row.name
		});
	}

	return { cohorts: cohortPatches, classes: classPatches };
}

/**
 * Sort key for cohorts: grade, then level difficulty, then class number.
 *
 * Grade 10 has no level, so its cohorts sort by class number alone — the codes
 * are zero-padded, so comparing them keeps H101 before H102.
 */
export function compareEslCohorts(
	a: { grade: number; level?: string; classNumber: string },
	b: { grade: number; level?: string; classNumber: string }
): number {
	if (a.grade !== b.grade) return a.grade - b.grade;
	const byLevel = levelRank(a.level) - levelRank(b.level);
	return byLevel !== 0 ? byLevel : a.classNumber.localeCompare(b.classNumber);
}
