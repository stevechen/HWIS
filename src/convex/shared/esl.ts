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

/**
 * The room a stored homeroom suggests, or null when the value is unusable.
 *
 * Storage holds the bare class number (`01`) with the marker rebuilt from the
 * grade on read (ADR-0025), but this also accepts the school's own full form
 * (`J101`) so a row written before that split — or typed by hand into a cell
 * somewhere — still yields a suggestion rather than nothing. The stored marker
 * itself is never trusted: `J201` on a grade 7 cohort is a data error, and the
 * grade's own marker is the derivable half (ADR-0025), so the digits are taken
 * and re-rendered through `chineseClassCode`.
 *
 * Null for an empty or unparseable value, which is the normal state for rows
 * `advanceGrade` creates — next year's homeroom number is not knowable when a
 * year is carried forward, so a missing value is a fact, not a fault.
 */
export function deriveHomeroom(grade: number, stored: string): string | null {
	// No marker, no derivable code: a bare number is only a room when the grade
	// says which letter it carries.
	if (CHINESE_CLASS_MARKERS[grade] === undefined) return null;
	const trimmed = stored.trim();
	if (trimmed === '') return null;
	const match = /^(?:[A-Za-z]\d)?(\d{1,2})$/.exec(trimmed);
	if (match === null) return null;
	// `00` is not a class the school runs, same as `parseChineseClass` refuses.
	if (Number(match[1]) < 1) return null;
	return chineseClassCode(grade, match[1]);
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

/**
 * The short level tag a taught slot carries in the availability grid.
 *
 * The grid cells are ~50px wide, so a full `G7 Elementary 1 CLIL` cannot fit —
 * it reduces to `G7 Ele. 1`, keeping the grade, level and number that tell a
 * teacher's classes apart and dropping only the lesson. The cell's tooltip keeps
 * the full name for collisions. Grade 10 names (`H101A`) are short already and
 * pass through whole.
 *
 * Parsed against the canonical forms `defaultClassName` and `grade10ClassName`
 * build in this same module. A hand-renamed class falls back to a bare level
 * tag, then to nothing — the gray mark plus tooltip carry those.
 */
export const ESL_LEVEL_SHORT: Readonly<Record<string, string>> = {
	'Pre-Elementary': 'Pre.',
	Elementary: 'Ele.',
	Intermediate: 'Int.',
	Basic: 'Bas.',
	Advanced: 'Adv.'
};

/** The few characters a class name reduces to on a timetable-grid cell. */
export function eslClassShortLabel(name: string): string {
	const canonical = /^G(\d{1,2}) ([A-Za-z-]+) (\S+?)(?: CLIL| Comm)?$/.exec(name.trim());
	if (canonical !== null) {
		const [, grade, level, number] = canonical;
		const short = ESL_LEVEL_SHORT[level ?? ''];
		// The level must be official and the number a real class number: a rename
		// that happens to start with `G7` is not a name this can shorten soundly.
		if (short !== undefined && /^\d{1,2}$/.test(number ?? '')) {
			return `G${Number(grade)} ${short} ${Number(number)}`;
		}
	}
	for (const level of ESL_LEVELS) {
		if (name.includes(level)) return ESL_LEVEL_SHORT[level] ?? '';
	}
	if (/^H1\d{2}[AB]$/.test(name.trim())) return name.trim();
	return '';
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
 * Days an ESL class can meet, Monday to Friday.
 *
 * The department runs no weekend lessons, so a Saturday meeting is a typo rather
 * than an unusual timetable (ADR-0027).
 */
export const ESL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type EslDay = (typeof ESL_DAYS)[number];

/**
 * The day's short label, as it appears on a meeting chip: `Mo`.
 *
 * **Two characters, not three.** A chip is a small target inside a narrow card, and
 * `Wed P2` is two characters wider than `We P2` — which is the difference between a
 * class's three meetings fitting on one line and wrapping to two. The full day name
 * is still available where space allows (the picker's column headers are the widest
 * label here, and they use this same map).
 */
export const ESL_DAY_LABELS: Readonly<Record<EslDay, string>> = {
	Monday: 'Mo',
	Tuesday: 'Tu',
	Wednesday: 'We',
	Thursday: 'Th',
	Friday: 'Fr'
};

/** Whether a string names a day an ESL class can meet. */
export function isEslDay(value: string): value is EslDay {
	return (ESL_DAYS as readonly string[]).includes(value);
}

/**
 * The school's eight ESL periods and their clock times.
 *
 * Written out one row per period rather than generated from a pattern, because
 * the pattern is not the rule: six of the eight run `:10` to `:00` across the
 * hour, while P5 and P6 run `:05` to `:55`. A generator inferred from the
 * majority would produce a wrong P3 and a wrong P5, and a timetable that is
 * silently wrong is worse than one that is visibly absent (ADR-0027).
 */
export const ESL_PERIODS = [
	{ period: 1, start: '08:10', end: '09:00' },
	{ period: 2, start: '09:10', end: '10:00' },
	{ period: 3, start: '10:10', end: '11:00' },
	{ period: 4, start: '11:10', end: '12:00' },
	{ period: 5, start: '13:05', end: '13:55' },
	{ period: 6, start: '14:05', end: '14:55' },
	{ period: 7, start: '15:10', end: '16:00' },
	{ period: 8, start: '16:10', end: '17:00' }
] as const;

/**
 * The period numbers the school runs, for range checks and iteration order.
 *
 * Widened to `number` rather than left as the literal union: this is a range
 * check, and `Array<1|2|3>.includes(someNumber)` is a type error under exactly the
 * call it exists to serve — deciding whether an arbitrary number is a period.
 */
export const ESL_PERIOD_NUMBERS: readonly number[] = ESL_PERIODS.map((slot) => slot.period);

/** Whether a number names one of the school's periods. */
export function isEslPeriod(period: number): boolean {
	return ESL_PERIOD_NUMBERS.includes(period);
}

/** The clock times of a period, or null when the number is not a period. */
export function eslPeriodTimes(period: number): { start: string; end: string } | null {
	const slot = ESL_PERIODS.find((candidate) => candidate.period === period);
	if (slot === undefined) return null;
	return { start: slot.start, end: slot.end };
}

/** How a `(day, period)` pair reads on a meeting chip: `Mon P1`. */
export function eslMeetingLabel(meeting: { day: EslDay; period: number }): string {
	return `${ESL_DAY_LABELS[meeting.day]} P${meeting.period}`;
}

/**
 * How many periods a week each class type meets.
 *
 * Every one of those meetings is exactly one period of ESL class. G7 and G8
 * therefore run five days a week between their `CLIL` and `Comm` classes, which
 * is what ADR-0023 recorded as "5 days (G7/G8)" and could not express; G9 and
 * G10 run two.
 */
const ESL_MEETINGS_PER_WEEK: Readonly<Record<EslClassType, number>> = {
	CLIL: 3,
	Comm: 2,
	G9: 2,
	H10A: 2,
	H10B: 2
};

/** How many periods a week a class of this type must meet. */
export function eslMeetingsPerWeek(type: EslClassType): number {
	return ESL_MEETINGS_PER_WEEK[type];
}

/** A class's proposed meeting set, as the editor and the mutation both see it. */
export type EslMeetingInput = { day: EslDay; period: number };

/** Why a set of meetings cannot be saved, phrased for the admin fixing it. */
export type EslMeetingShapeError =
	| { kind: 'unknownDay'; day: string }
	| { kind: 'unknownPeriod'; period: number }
	| { kind: 'tooMany'; expected: number; actual: number }
	| { kind: 'tooFew'; expected: number; actual: number }
	| { kind: 'duplicateDay'; day: EslDay };

/**
 * Check a class's meetings against its type's shape, or null when they are sound.
 *
 * A **shape** failure — the wrong number of meetings, two meetings on one day, a
 * day or period the school does not run — is a hard error that rejects the write:
 * each one is a typo, each is detectable here, and each produces a timetable that
 * is silently wrong otherwise.
 *
 * A class with **no** meetings is not malformed. `cohorts.create` composes classes
 * before anyone has thought about slots and the September import carries no day or
 * time at all, so absence is a legitimate state to be reported by the schedule
 * badge and filled in — not an error to be refused (ADR-0027).
 */
export function assertValidMeetings(
	type: EslClassType,
	meetings: readonly EslMeetingInput[]
): EslMeetingShapeError | null {
	// Absence is not malformation. `cohorts.create` composes classes before anyone
	// has thought about slots and the September import carries no day or time, so a
	// class with no meetings is a real, reported state rather than an error to be
	// refused — the schedule badge says "No schedule" and the admin fills it in.
	if (meetings.length === 0) return null;

	for (const meeting of meetings) {
		if (!isEslDay(meeting.day)) return { kind: 'unknownDay', day: meeting.day };
		if (!isEslPeriod(meeting.period)) {
			return { kind: 'unknownPeriod', period: meeting.period };
		}
	}

	const expected = eslMeetingsPerWeek(type);
	if (meetings.length !== expected) {
		return meetings.length > expected
			? { kind: 'tooMany', expected, actual: meetings.length }
			: { kind: 'tooFew', expected, actual: meetings.length };
	}

	// Distinct days within the class: a day carries at most one ESL period, so two
	// meetings on one day is not a double period but a typo.
	const seen = new Set<EslDay>();
	for (const meeting of meetings) {
		if (seen.has(meeting.day)) return { kind: 'duplicateDay', day: meeting.day };
		seen.add(meeting.day);
	}

	return null;
}

/** A shape error as the sentence an admin reads when a save is refused. */
export function describeMeetingShapeError(type: EslClassType, error: EslMeetingShapeError): string {
	const classType = classTypeLabel(type);
	switch (error.kind) {
		case 'unknownDay':
			return `${error.day} is not a day the school teaches. Use Monday to Friday.`;
		case 'unknownPeriod':
			return `Period ${error.period} is not one of the school's periods (P1-P${ESL_PERIOD_NUMBERS.length}).`;
		case 'tooMany':
			return `A ${classType} class meets ${error.expected} periods a week, but ${error.actual} were given.`;
		case 'tooFew':
			return `A ${classType} class must meet ${error.expected} periods a week, but only ${error.actual} ${error.actual === 1 ? 'was' : 'were'} given.`;
		case 'duplicateDay':
			return `A day carries at most one ESL period, so ${ESL_DAY_LABELS[error.day]} was given twice.`;
	}
}

/**
 * The four ways a class's schedule can be unfinished, computed on read.
 *
 * Not a stored flag: validity is **global** — a class is incomplete partly because
 * of what *other* rows say — so a boolean on the row would go stale the moment a
 * neighbour is edited. Four states rather than one flag because "invalid" alone
 * tells a coordinator nothing about what to fix (ADR-0027).
 */
export const ESL_SCHEDULE_STATES = [
	'no-schedule',
	'incomplete',
	'missing-room',
	'conflicting'
] as const;
export type EslScheduleState = (typeof ESL_SCHEDULE_STATES)[number];

/**
 * A class as the schedule badge reads it: who teaches it, where it meets, and when.
 *
 * `teacherId` is on the subject rather than only on the neighbour because a clash
 * is symmetrical: the class being read is as much a part of a teacher double-booking
 * as the class it collides with.
 */
export type EslScheduleSubject = {
	room?: string;
	teacherId?: string;
	meetings: readonly EslMeetingInput[];
};

/** A class as a clash is reported against: enough to name it and place it. */
export type EslScheduleNeighbour = EslScheduleSubject & {
	classId: string;
	className: string;
};

/** Why a class is not fully scheduled, in the order a coordinator should fix them. */
export type EslScheduleProblem =
	| { state: 'no-schedule' }
	| { state: 'incomplete' }
	| { state: 'missing-room' }
	| {
			state: 'conflicting';
			/** What is clashing, so a warning can be worded rather than merely flagged. */
			dimension: 'cohort' | 'teacher' | 'room';
			other: EslScheduleNeighbour;
			day: EslDay;
			period: number;
	  };

/**
 * Why a proposed week cannot be saved, phrased for the person who has to fix it.
 *
 * The **write gate**. Every rule the department runs lives behind one function, so
 * the schedule picker, `setSchedule` and the red chips on a saved card cannot
 * disagree about what is allowed — and a block the picker cannot explain is a
 * block the admin cannot avoid.
 *
 * This used to sit alongside a second, read-only rule pass that answered "is this
 * saved class conflicted, and which chips?". That arrangement let the chips and
 * the card marker come out differently for the same class, so it is gone: a saved
 * class is gated too, by the same function, with the same rules.
 */
export type EslScheduleProblemDetail = {
	kind:
		| 'cohort-slot'
		| 'cohort-days'
		| 'cohort-teacher'
		| 'teacher'
		| 'room'
		| 'teacher-availability';
	/** One sentence, already worded for display. */
	message: string;
	/** The slot the problem is about, when it is about one. */
	day?: EslDay;
	period?: number;
	/** The other class involved, when there is one. */
	otherName?: string;
	/**
	 * That same class, whole.
	 *
	 * Carried so the card's summary badge can be built from a gate result alone.
	 * The badge has always named the other class, and reaching back through
	 * `otherName` to find it again would mean running a second, partial rule pass
	 * to resolve a name into a neighbour — which is the duplication this gate
	 * replaced. Absent only for `teacher-availability`, which involves no class.
	 */
	other?: EslScheduleNeighbour;
};

/** The class a proposed week belongs to, as the gate needs to see it. */
export type EslGateSubject = {
	type: EslClassType;
	cohortId: string;
	teacherId?: string;
	room?: string;
	meetings: readonly EslMeetingInput[];
};

/** A slot a teacher has been marked unavailable for. */
export type EslUnavailableSlot = { day: EslDay; period: number; note?: string };

/**
 * Every rule that refuses a proposed week, each with a sentence naming the fix.
 *
 * Runs over the *draft* rather than the saved schedule, so the picker can call it on
 * every edit and grey out the slots that will not be accepted. That is what makes a
 * hard block invisible as a failure: the admin is told before they commit.
 *
 * Rules, in the order an admin should resolve them — most structural first:
 *
 * 1. `cohort-slot` — a cohort's two classes at one slot. They share a roster, so
 *    both at once is twenty students in two rooms (ADR-0023).
 * 2. `cohort-days` — the same two classes on the same *day*, at different times.
 * 3. `cohort-teacher` — one teacher set to teach both classes of a cohort.
 * 4. `teacher` — one teacher in two rooms at once.
 * 5. `room` — one room holding two classes at once.
 * 6. `teacher-availability` — a slot the teacher is marked unavailable for.
 *
 * An empty week is not a problem here: an unscheduled class is a real state the
 * picker fills in, and `assertValidMeetings` already owns the shape rules.
 */
export function findScheduleProblems(
	subject: EslGateSubject,
	others: readonly (EslScheduleNeighbour & { cohortId: string })[],
	unavailable: readonly EslUnavailableSlot[] = []
): EslScheduleProblemDetail[] {
	const problems: EslScheduleProblemDetail[] = [];
	const slotKey = (day: EslDay, period: number) => `${day} ${period}`;
	const siblings = others.filter((other) => other.cohortId === subject.cohortId);

	for (const meeting of subject.meetings) {
		for (const other of siblings) {
			const clashed = other.meetings.some(
				(candidate) => candidate.day === meeting.day && candidate.period === meeting.period
			);
			if (clashed) {
				problems.push({
					kind: 'cohort-slot',
					message: `${other.className} draws the same students and already meets then.`,
					day: meeting.day,
					period: meeting.period,
					otherName: other.className,
					other
				});
			}
		}
	}

	problems.push(...findCohortDayOverlap(subject, siblings));

	if (subject.teacherId !== undefined && subject.teacherId !== '') {
		for (const other of siblings) {
			if (other.teacherId === subject.teacherId) {
				problems.push({
					kind: 'cohort-teacher',
					message: `${other.className} has the same teacher; the two classes need different ones.`,
					otherName: other.className,
					other
				});
			}
		}
	}

	for (const meeting of subject.meetings) {
		for (const other of others) {
			const atSlot = other.meetings.some(
				(candidate) => candidate.day === meeting.day && candidate.period === meeting.period
			);
			if (!atSlot) continue;
			if (other.teacherId !== undefined && other.teacherId === subject.teacherId) {
				problems.push({
					kind: 'teacher',
					message: `${other.className} has the same teacher at this time, in a different room.`,
					day: meeting.day,
					period: meeting.period,
					otherName: other.className,
					other
				});
			}
			if (other.room !== undefined && other.room === subject.room) {
				problems.push({
					kind: 'room',
					message: `${subject.room} is taken by ${other.className} at this time.`,
					day: meeting.day,
					period: meeting.period,
					otherName: other.className,
					other
				});
			}
		}
	}

	if (subject.teacherId !== undefined && subject.teacherId !== '') {
		const blocked = new Map(unavailable.map((slot) => [slotKey(slot.day, slot.period), slot]));
		for (const meeting of subject.meetings) {
			const slot = blocked.get(slotKey(meeting.day, meeting.period));
			if (slot === undefined) continue;
			problems.push({
				kind: 'teacher-availability',
				message:
					slot.note === undefined
						? 'The teacher is not available at this time.'
						: `The teacher is not available: ${slot.note}`,
				day: meeting.day,
				period: meeting.period
			});
		}
	}

	return problems;
}

/**
 * Rule 2 on its own: a cohort's two classes sharing a *day*.
 *
 * **Provisional.** The department is not certain this holds; it is a policy rather
 * than a physical impossibility, since a student can attend two lessons on one day.
 * Isolated here so that if the school decides otherwise, deleting this function and
 * its one call in `findScheduleProblems` removes the rule outright.
 *
 * It also *subsumes* the same-slot rule for grades 7 and 8 — two classes on a shared
 * day cannot also share a slot — so it skips the slots rule 1 already reported,
 * which words the clash better.
 */
function findCohortDayOverlap(
	subject: EslGateSubject,
	siblings: readonly (EslScheduleNeighbour & { cohortId: string })[]
): EslScheduleProblemDetail[] {
	const out: EslScheduleProblemDetail[] = [];
	for (const meeting of subject.meetings) {
		for (const other of siblings) {
			// An unscheduled sibling is not a clash. The guard below asks "does the
			// sibling meet on a *different* day", and `some` over an empty list is
			// vacuously false — so without this, the rule reported every slot of the
			// subject as sharing a day with a class that meets on no days at all, and
			// blocked saving the first class of a fresh year.
			if (other.meetings.length === 0) continue;
			if (other.meetings.some((c) => c.day !== meeting.day)) continue;
			const sharedSlot = other.meetings.some(
				(c) => c.day === meeting.day && c.period === meeting.period
			);
			if (sharedSlot) continue;
			out.push({
				kind: 'cohort-days',
				message: `${other.className} already meets that day; the two classes take different days.`,
				day: meeting.day,
				period: meeting.period,
				otherName: other.className,
				other
			});
			break;
		}
	}
	return out;
}

/**
 * The clash half of `EslScheduleProblem`.
 */
export type EslScheduleConflict = Extract<EslScheduleProblem, { state: 'conflicting' }>;

/**
 * The department's rooms, offered as suggestions.
 *
 * A **suggestion list, never a whitelist**. The rooms vary year to year and the
 * school adding an `ESL H` next year is not a data error, so nothing rejects a
 * name outside this list — a rule encoding "the most rooms we have ever had" is
 * exactly the brittle convention ADR-0025 warns against. `setRoom` accepts any
 * string (ADR-0027).
 *
 * `settings['esl.rooms.<year>']` is where a per-year vocabulary belongs; it is
 * not read or written here, because no settings editor exists yet.
 */
export const ESL_ROOM_SUGGESTIONS = [
	'ESL A',
	'ESL B',
	'ESL C',
	'ESL D',
	'ESL E',
	'ESL F',
	'ESL G'
] as const;

/**
 * Classify a class's schedule, or null when it is sound.
 *
 * Ordered so the badge names the *first* thing wrong: an unscheduled class is
 * reported as such rather than as also missing a room, because scheduling it is
 * what has to happen before the room means anything.
 *
 * Takes the **gate's own output** rather than the neighbours, so the badge and
 * the red chips are derived from one rule pass. They used to come from two
 * functions covering overlapping rules, which is the arrangement that let a chip
 * stay green while the card marker said conflicted.
 */
export function classifySchedule(
	subject: EslScheduleSubject & { type: EslClassType; cohortId: string },
	problems: readonly EslScheduleProblemDetail[]
): EslScheduleProblem | null {
	if (subject.meetings.length === 0) return { state: 'no-schedule' };
	if (assertValidMeetings(subject.type, subject.meetings) !== null) {
		return { state: 'incomplete' };
	}
	if (subject.room === undefined || subject.room === '') return { state: 'missing-room' };

	// The *first* conflict only. This is the single badge label, and a class can
	// carry several; the card turns every clashing chip red from `problems`, so
	// nothing is hidden by summarising here.
	//
	// A problem with no slot or no other class — `cohort-teacher`, which is about
	// the pair rather than a meeting — has no badge shape to become. The card
	// marker still reports it, which is where a class-wide fault belongs: there is
	// no one chip to redden.
	for (const problem of problems) {
		if (problem.day === undefined || problem.period === undefined || problem.other === undefined) {
			continue;
		}
		const dimension =
			problem.kind === 'cohort-slot' || problem.kind === 'cohort-days'
				? 'cohort'
				: problem.kind === 'teacher'
					? 'teacher'
					: 'room';
		return {
			state: 'conflicting',
			dimension,
			other: problem.other,
			day: problem.day,
			period: problem.period
		};
	}
	return null;
}

/** The badge text for a schedule problem, phrased for a coordinator. */
export function describeScheduleProblem(problem: EslScheduleProblem): string {
	switch (problem.state) {
		case 'no-schedule':
			return 'No schedule';
		case 'incomplete':
			return 'Incomplete';
		case 'missing-room':
			return 'Missing room';
		case 'conflicting': {
			const slot = eslMeetingLabel({ day: problem.day, period: problem.period });
			const what =
				problem.dimension === 'cohort'
					? 'shares its roster'
					: problem.dimension === 'teacher'
						? 'shares its teacher'
						: 'shares its room';
			return `${slot} — ${problem.other.className} ${what}`;
		}
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

/**
 * The ESL semester terms: S1 then S2 of a school year.
 *
 * S2 setup conventionally follows S1's end, but nothing gates it — early
 * planning is never blocked, and the S1/S2 boundary warns rather than
 * refuses.
 */
export const ESL_SEMESTER_TERMS = ['S1', 'S2'] as const;
export type EslSemesterTerm = (typeof ESL_SEMESTER_TERMS)[number];

/** Whether a string names one of the two semester terms. */
export function isEslSemesterTerm(term: string): term is EslSemesterTerm {
	return (ESL_SEMESTER_TERMS as readonly string[]).includes(term);
}

/**
 * The seven typed school events an admin can place on a semester (#216).
 *
 * `no_school` means absent (school closed, the day is gone); `no_class`
 * means present but free (assembly, Sport's Day — meetings keep their rows,
 * greyed). `partial` is a late start / early end with optional period
 * bounds. `exam` anchors term boundaries and the derived semester end.
 * `reminder` is the only ranged type (reminder windows collapsing to the
 * latest eligible class day in the views), qualified by `reminderKind`.
 * `start_school` is a first-day marker only. `g9_mock` is a
 * G9-only mock exam marker (single-date, like an exam but anchoring
 * nothing).
 */
export const ESL_EVENT_TYPES = [
	'start_school',
	'reminder',
	'no_school',
	'no_class',
	'partial',
	'exam',
	'g9_mock'
] as const;
export type EslEventType = (typeof ESL_EVENT_TYPES)[number];

/** Whether a string names one of the seven event types. */
export function isEslEventType(type: string): type is EslEventType {
	return (ESL_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * The six reminder kinds (#216): what a `reminder` row is reminding about.
 * Quiz/task kinds take a free-text title; passport/recording/checks take
 * their locked title from `ESL_REMINDER_TITLES`.
 */
export const ESL_REMINDER_KINDS = [
	'quiz',
	'passport',
	'recording',
	'task',
	'passport_check',
	'workbook_check'
] as const;
export type EslReminderKind = (typeof ESL_REMINDER_KINDS)[number];

/** Whether a string names one of the six reminder kinds. */
export function isEslReminderKind(kind: string): kind is EslReminderKind {
	return (ESL_REMINDER_KINDS as readonly string[]).includes(kind);
}

/**
 * The locked chip/banner title per fixed event type (#210, #216). `reminder`
 * rows take their title per kind (see `ESL_REMINDER_TITLES`): `quiz` and
 * `task` kinds take a free-text title (required, always the banner — quiz
 * drafts default to `Unit N Quiz Due` via `quizTitle`); `exam` takes one of
 * `ESL_EXAM_TITLES`. Titles are explicit and never derived from notes.
 */
export const ESL_EVENT_TITLES = {
	start_school: 'Start at P3',
	no_school: 'Off',
	no_class: 'No class',
	partial: 'No class',
	g9_mock: 'G9 Mock Exam'
} as const;

/**
 * The banner title per reminder kind (#216). `quiz`/`task` entries are the
 * fallback a migration stamps when the legacy title is blank — live writes
 * for those kinds keep their free-text title instead.
 */
export const ESL_REMINDER_TITLES: Record<EslReminderKind, string> = {
	quiz: 'Quiz',
	passport: 'Passport due',
	recording: 'Recording due',
	task: 'Task',
	passport_check: 'Passport check',
	workbook_check: 'Workbook check'
};

/** The three locked exam titles — the exam dropdown options. */
export const ESL_EXAM_TITLES = ['Exam 1', 'Exam 2', 'Final Exam'] as const;

/**
 * The human label per event type, as the EventForm type dropdown reads.
 * Single-sourced here so the form's option list can never drift from the
 * canonical `ESL_EVENT_TYPES` union it iterates.
 */
export const ESL_EVENT_TYPE_LABELS: Record<EslEventType, string> = {
	start_school: 'Start of school',
	reminder: 'Reminder',
	no_school: 'No school',
	no_class: 'No class',
	partial: 'Partial day',
	exam: 'Exam',
	g9_mock: 'G9 mock'
};

/** Pre-v3 event types and where they land in the current union (#210, #216). */
const V3_TYPE_MIGRATION: Record<string, EslEventType> = {
	start_school: 'start_school',
	quiz: 'reminder',
	no_school: 'no_school',
	off: 'no_school',
	no_class: 'no_class',
	partial: 'partial',
	exam: 'exam',
	passport_due: 'reminder',
	recording_due: 'reminder',
	task: 'reminder',
	task_due: 'reminder',
	homework_due: 'reminder',
	g9_mock: 'g9_mock'
};

/** The v3 due-type behind each pre-reminder row (#216). */
const V3_REMINDER_KIND_MIGRATION: Record<string, EslReminderKind> = {
	quiz: 'quiz',
	passport_due: 'passport',
	recording_due: 'recording',
	task: 'task',
	task_due: 'task',
	homework_due: 'task'
};

/** Canonicalise a legacy exam title onto the locked set, case-insensitively. */
function canonicalExamTitle(raw: string): string | null {
	const found = ESL_EXAM_TITLES.find((locked) => locked.toLowerCase() === raw.trim().toLowerCase());
	return found ?? null;
}

/**
 * Map one pre-v3 event row onto the current model, or null when its type is
 * unknown. `homework_due`/`task_due` rows become `reminder` kind=task,
 * `quiz` becomes kind=quiz, `passport_due`/`recording_due` their kinds,
 * `off` becomes `no_school`; the legacy display text becomes the explicit
 * `title` — locked per type, with displaced text preserved in `note`
 * (quiz/task-kind reminders keep their free-text title).
 *
 * Pure so the migration mutation stays a thin applier and the mapping stays
 * unit-testable.
 */
export function migrateLegacyEslEvent(input: { type: string; label: string; note?: string }):
	| { type: EslEventType; title: string; note?: string }
	| {
			type: 'reminder';
			title: string;
			note?: string;
			reminderKind: EslReminderKind;
			isBanner: true;
	  }
	| null {
	const mappedType = V3_TYPE_MIGRATION[input.type];
	if (mappedType === undefined) return null;
	const rawLabel = input.label.trim();
	if (mappedType === 'reminder') {
		const kind = V3_REMINDER_KIND_MIGRATION[input.type] ?? ('task' as EslReminderKind);
		if (kind === 'quiz' || kind === 'task') {
			return {
				type: mappedType,
				title: rawLabel === '' ? ESL_REMINDER_TITLES[kind] : rawLabel,
				note: input.note,
				reminderKind: kind,
				isBanner: true as const
			};
		}
		const locked = ESL_REMINDER_TITLES[kind];
		if (rawLabel === locked || rawLabel === '')
			return {
				type: mappedType,
				title: locked,
				note: input.note,
				reminderKind: kind,
				isBanner: true as const
			};
		return {
			type: mappedType,
			title: locked,
			note: `${rawLabel}${input.note ? ` — ${input.note}` : ''}`,
			reminderKind: kind,
			isBanner: true as const
		};
	}
	if (mappedType === 'exam') {
		const canonical = canonicalExamTitle(rawLabel);
		if (canonical !== null) return { type: mappedType, title: canonical, note: input.note };
		return {
			type: mappedType,
			title: 'Exam 1',
			note: rawLabel === '' ? input.note : `${rawLabel}${input.note ? ` — ${input.note}` : ''}`
		};
	}
	const locked: string = ESL_EVENT_TITLES[mappedType];
	if (rawLabel === locked) return { type: mappedType, title: locked, note: input.note };
	return {
		type: mappedType,
		title: locked,
		note: rawLabel === '' ? input.note : `${rawLabel}${input.note ? ` — ${input.note}` : ''}`
	};
}

/**
 * Map one v3 due row (`quiz`/`passport_due`/`recording_due`/`task`) onto
 * the consolidated `reminder` model (#216), or null when its type is not a
 * legacy due-type. The legacy title rides through (free-text kinds keep
 * it; locked kinds keep theirs, blank falls back to the kind's title) and
 * `isBanner` stamps true.
 *
 * Pure so the `migrateToReminder` mutation stays a thin applier.
 */
export function migrateToReminderEslEvent(input: { type: string; title: string; note?: string }): {
	type: 'reminder';
	title: string;
	note?: string;
	reminderKind: EslReminderKind;
	isBanner: true;
} | null {
	const kind = V3_REMINDER_KIND_MIGRATION[input.type];
	if (kind === undefined) return null;
	const rawTitle = input.title.trim();
	if (kind === 'quiz' || kind === 'task') {
		return {
			type: 'reminder',
			title: rawTitle === '' ? ESL_REMINDER_TITLES[kind] : rawTitle,
			note: input.note,
			reminderKind: kind,
			isBanner: true as const
		};
	}
	const locked = ESL_REMINDER_TITLES[kind];
	return {
		type: 'reminder',
		title: locked,
		note:
			rawTitle === '' || rawTitle === locked
				? input.note
				: `${rawTitle}${input.note ? ` — ${input.note}` : ''}`,
		reminderKind: kind,
		isBanner: true as const
	};
}

/**
 * Which classes an event reaches: everyone, one lesson, or one grade.
 *
 * Single-select, defaulting to `all`. `G7`/`G8` reach every class of that
 * grade (both its CLIL and its Comm class); `H1` reaches the grade 10
 * classes, which have no target of their own and otherwise see `all`
 * events only.
 */
export const ESL_EVENT_TARGETS = ['all', 'CLIL', 'Comm', 'G7', 'G8', 'G9', 'H1'] as const;
export type EslEventTarget = (typeof ESL_EVENT_TARGETS)[number];

/** Whether a string names one of the seven event targets. */
export function isEslEventTarget(target: string): target is EslEventTarget {
	return (ESL_EVENT_TARGETS as readonly string[]).includes(target);
}

/**
 * The target each event type is locked to (#212, #216), or null when the admin
 * picks from the full dropdown (Start of School, Partial, Reminder with
 * kind=task).
 *
 * Reminder kinds lock per kind (see `ESL_LOCKED_REMINDER_TARGETS`): quizzes
 * are CLIL-only, passport/recording/checks Comm-only except workbook checks
 * (CLIL), tasks open; exams, no-school days, and no-class days reach
 * everyone, so the form locks them to All rather than offering a choice
 * that would be refused.
 */
export const ESL_LOCKED_EVENT_TARGETS: Record<EslEventType, EslEventTarget | null> = {
	start_school: null,
	reminder: null,
	no_school: 'all',
	no_class: 'all',
	partial: null,
	exam: 'all',
	g9_mock: 'G9'
};

/** The target each reminder kind is locked to (#216), or null when open. */
export const ESL_LOCKED_REMINDER_TARGETS: Record<EslReminderKind, EslEventTarget | null> = {
	quiz: 'CLIL',
	passport: 'Comm',
	recording: 'Comm',
	task: null,
	passport_check: 'Comm',
	workbook_check: 'CLIL'
};

/** The target a type is locked to, or null when the admin picks (Start/Partial/Task-kind reminder). */
export function lockedTargetForEventType(type: EslEventType): EslEventTarget | null {
	return ESL_LOCKED_EVENT_TARGETS[type];
}

/** The target a reminder kind is locked to, or null when the admin picks (task). */
export function lockedTargetForReminderKind(kind: EslReminderKind): EslEventTarget | null {
	return ESL_LOCKED_REMINDER_TARGETS[kind];
}

/**
 * The target a fresh draft of a type carries: the locked value, or All for
 * the dropdown types. The seed reads this for due windows without an
 * explicit target, and the form snaps to it on type switch.
 */
export function defaultTargetForEventType(
	type: EslEventType,
	reminderKind?: EslReminderKind
): EslEventTarget {
	if (type === 'reminder' && reminderKind !== undefined) {
		return lockedTargetForReminderKind(reminderKind) ?? 'all';
	}
	return lockedTargetForEventType(type) ?? 'all';
}

/** The ranged reminder type: the only type that may carry an inclusive endDate. */
export const ESL_RANGED_EVENT_TYPES: readonly EslEventType[] = ['reminder'];

/** Whether an event type takes an inclusive endDate range. */
export function isRangedEventType(type: EslEventType): boolean {
	return (ESL_RANGED_EVENT_TYPES as readonly EslEventType[]).includes(type);
}

/**
 * Banner-only types hide the note field entirely (#211, #216): Start of
 * School, Exam, G9 Mock, and reminders except kind=task (which takes an
 * optional note). The backend ignores any note written for them, so the
 * form drops a stale note on type switch and omits it from submit.
 */
export const ESL_NOTE_HIDDEN_EVENT_TYPES: readonly EslEventType[] = [
	'start_school',
	'exam',
	'g9_mock',
	'reminder'
];

/** Whether an event type hides the note field (task-kind reminders show it). */
export function isNoteHiddenForEventType(
	type: EslEventType,
	reminderKind?: EslReminderKind
): boolean {
	if (type === 'reminder') return reminderKind !== 'task';
	return (ESL_NOTE_HIDDEN_EVENT_TYPES as readonly EslEventType[]).includes(type);
}

/**
 * Note-required types (#211): No school (`Off`), No class, Partial. Every
 * other visible-note type (`task`) takes an optional note.
 */
export const ESL_NOTE_REQUIRED_EVENT_TYPES: readonly EslEventType[] = [
	'no_school',
	'no_class',
	'partial'
];

/** Whether an event type shows the note field as required. */
export function isNoteRequiredForEventType(type: EslEventType): boolean {
	return (ESL_NOTE_REQUIRED_EVENT_TYPES as readonly EslEventType[]).includes(type);
}

/**
 * Dates are `YYYY-MM-DD` strings, never wall-clock reads in queries — the
 * pre-existing `schoolYearOf` local-vs-Taipei edge drift is out of scope and
 * must not widen, so every comparison here is lexical.
 */
export function isValidEslDate(date: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	const [year, month, day] = date.split('-').map(Number);
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return day <= daysInMonth;
}

/**
 * Why an event write cannot be saved, phrased for the admin fixing it. The
 * mutation throws the sentence directly; this shape exists so the pure rule
 * stays testable without a database while the mutation stays a thin applier,
 * matching `assertValidMeetings`.
 */
export type EslEventValidationError =
	| { kind: 'badDate'; date: string }
	| { kind: 'badEndDate'; endDate: string }
	| { kind: 'rangeNotAllowed'; type: EslEventType }
	| { kind: 'rangeOrder'; date: string; endDate: string }
	| { kind: 'badPeriod'; period: number }
	| { kind: 'boundsNotAllowed'; type: EslEventType }
	| { kind: 'boundsOrder'; startPeriod: number; endPeriod: number }
	| { kind: 'emptyTitle'; type: EslEventType; reminderKind?: EslReminderKind }
	| { kind: 'lockedTitle'; type: EslEventType; expected: readonly string[] }
	| {
			kind: 'badTarget';
			type: EslEventType;
			expected: EslEventTarget;
			reminderKind?: EslReminderKind;
	  }
	| { kind: 'missingReminderKind'; type: EslEventType }
	| { kind: 'badReminderKind'; value: string }
	| { kind: 'kindNotAllowed'; type: EslEventType }
	| { kind: 'bannerNotAllowed'; type: EslEventType };

/** Check an event's title: free text (required) on quiz/task-kind reminders, locked elsewhere. */
export function assertValidEslTitle(
	type: EslEventType,
	title: string,
	reminderKind?: EslReminderKind
): EslEventValidationError | null {
	if (type === 'reminder') {
		if (reminderKind === undefined) return { kind: 'missingReminderKind', type };
		if (reminderKind === 'quiz' || reminderKind === 'task') {
			return title.trim() === '' ? { kind: 'emptyTitle', type, reminderKind } : null;
		}
		const expected: readonly string[] = [ESL_REMINDER_TITLES[reminderKind]];
		return expected.includes(title) ? null : { kind: 'lockedTitle', type, expected };
	}
	const expected: readonly string[] = type === 'exam' ? ESL_EXAM_TITLES : [ESL_EVENT_TITLES[type]];
	return expected.includes(title) ? null : { kind: 'lockedTitle', type, expected };
}
/** Check an event's target against its type's (and reminder kind's) gate, or null when sound. */
export function assertValidEslTarget(
	type: EslEventType,
	target: EslEventTarget,
	reminderKind?: EslReminderKind
): EslEventValidationError | null {
	if (type === 'reminder') {
		if (reminderKind === undefined) return { kind: 'missingReminderKind', type };
		const locked = lockedTargetForReminderKind(reminderKind);
		if (locked === null) return null;
		return target === locked ? null : { kind: 'badTarget', type, expected: locked, reminderKind };
	}
	const locked = lockedTargetForEventType(type);
	if (locked === null) return null;
	return target === locked ? null : { kind: 'badTarget', type, expected: locked };
}
/** Check an event's own fields, or null when they are sound. */
export function assertValidEslEvent(input: {
	type: EslEventType;
	date: string;
	endDate?: string;
	startPeriod?: number;
	endPeriod?: number;
	reminderKind?: string;
	isBanner?: boolean;
}): EslEventValidationError | null {
	if (!isValidEslDate(input.date)) return { kind: 'badDate', date: input.date };

	if (input.type === 'reminder') {
		if (input.reminderKind === undefined) return { kind: 'missingReminderKind', type: input.type };
		if (!isEslReminderKind(input.reminderKind))
			return { kind: 'badReminderKind', value: input.reminderKind };
	} else {
		if (input.reminderKind !== undefined) return { kind: 'kindNotAllowed', type: input.type };
		if (input.isBanner !== undefined) return { kind: 'bannerNotAllowed', type: input.type };
	}

	if (input.endDate !== undefined) {
		if (!isRangedEventType(input.type)) {
			return { kind: 'rangeNotAllowed', type: input.type };
		}
		if (!isValidEslDate(input.endDate)) return { kind: 'badEndDate', endDate: input.endDate };
		if (input.endDate < input.date) {
			return { kind: 'rangeOrder', date: input.date, endDate: input.endDate };
		}
	}

	const { startPeriod, endPeriod } = input;
	if (startPeriod !== undefined || endPeriod !== undefined) {
		if (input.type !== 'partial') {
			return { kind: 'boundsNotAllowed', type: input.type };
		}
		for (const period of [startPeriod, endPeriod]) {
			if (period !== undefined && !isEslPeriod(period)) {
				return { kind: 'badPeriod', period };
			}
		}
		if (startPeriod !== undefined && endPeriod !== undefined && startPeriod > endPeriod) {
			return { kind: 'boundsOrder', startPeriod, endPeriod };
		}
	}

	return null;
}

/** An event validation error as the sentence an admin reads when a save is refused. */
export function describeEslEventError(error: EslEventValidationError): string {
	switch (error.kind) {
		case 'badDate':
			return `${error.date} is not a valid date. Use YYYY-MM-DD.`;
		case 'badEndDate':
			return `${error.endDate} is not a valid date. Use YYYY-MM-DD.`;
		case 'rangeNotAllowed':
			return `Only reminders take a date range.`;
		case 'rangeOrder':
			return `The range end ${error.endDate} is before its start ${error.date}.`;
		case 'badPeriod':
			return `Period ${error.period} is not one of the school's periods (P1-P${ESL_PERIOD_NUMBERS.length}).`;
		case 'boundsNotAllowed':
			return `Only partial days take start-from / end-at periods.`;
		case 'boundsOrder':
			return `The partial starts at P${error.startPeriod} but ends at P${error.endPeriod}.`;
		case 'emptyTitle':
			return error.reminderKind === 'quiz'
				? 'A quiz needs its own title — the banner always shows it (e.g. Unit 1 Quiz Due).'
				: 'A reminder of this kind needs its own title — the banner always shows it.';
		case 'lockedTitle':
			return (
				'That type always shows ' +
				error.expected.map((title) => `"${title}"`).join(' or ') +
				' — put the details in the note instead.'
			);
		case 'badTarget':
			return `${error.reminderKind ?? error.type} events always target ${error.expected === 'all' ? 'All' : error.expected}.`;
		case 'missingReminderKind':
			return `A reminder needs its kind — quiz, passport, recording, task, passport_check, or workbook_check.`;
		case 'badReminderKind':
			return `${error.value} is not a reminder kind. Use quiz, passport, recording, task, passport_check, or workbook_check.`;
		case 'kindNotAllowed':
			return `Only reminders take a reminder kind.`;
		case 'bannerNotAllowed':
			return `Only reminders take a banner flag.`;
	}
}

/**
 * The derived semester end: the max date of its exam-type events, or null
 * before the first final is entered (the "finals TBD" state, when views clamp
 * to startDate..today).
 */
export function deriveSemesterEnd(examDates: readonly string[]): string | null {
	if (examDates.length === 0) return null;
	return examDates.reduce((max, date) => (date > max ? date : max));
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

/**
 * How a level sorts within its grade, easiest first.
 *
 * **Grade 10 is handled explicitly, because it is not levelled by these names.**
 * Its levels are the ability bands `A` and `B` (ADR-0023), and neither appears in
 * `ESL_LEVELS`, so `indexOf` returned -1 for both and they ranked *identically*.
 * Sorting then fell through to the class number alone, leaving `H101A` and
 * `H101B` in whatever order the database returned — which is how a page grouping
 * by level can end up with the same level twice.
 *
 * `A` is the higher band (ESL_GRADE10_LEVELS is declared `A` higher in capability
 * than `B`), and `ESL_LEVELS` runs easiest-first, so the index is reversed to keep
 * `B` ahead of `A`.
 *
 * These ranks deliberately overlap the levelled ones. `compareEslCohorts` only ever
 * compares within a single grade, and a grade never mixes `A`/`B` with the levelled
 * names, so there is nothing for the overlap to confuse.
 *
 * An unrecognised level ranks last, with a missing one: a cohort with a level the
 * school has renamed should sort after every known level rather than before them.
 */
function levelRank(level: string | undefined): number {
	if (!level) return ESL_LEVELS.length;
	const asLevel = ESL_LEVELS.indexOf(level as EslLevel);
	if (asLevel !== -1) return asLevel;
	if (isGrade10Level(level)) return ESL_GRADE10_LEVELS.length - ESL_GRADE10_LEVELS.indexOf(level);
	return ESL_LEVELS.length;
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
/**
 * The other section of a grade 10 Chinese class: `A` ↔ `B`.
 *
 * Null for a levelled grade's level, and for a section letter the school has
 * renamed — in both cases there is no partner to keep in step, and guessing one
 * would refuse writes against a class that does not exist.
 */
export function grade10SiblingLevel(level: string | undefined): EslGrade10Level | null {
	if (!level) return null;
	const index = ESL_GRADE10_LEVELS.indexOf(level as EslGrade10Level);
	if (index === -1) return null;
	return ESL_GRADE10_LEVELS[ESL_GRADE10_LEVELS.length - 1 - index] ?? null;
}

export function compareEslCohorts(
	a: { grade: number; level?: string; classNumber: string },
	b: { grade: number; level?: string; classNumber: string }
): number {
	if (a.grade !== b.grade) return a.grade - b.grade;

	// Grade 10 leads with the Chinese class, not the section: H101A, H101B,
	// H102A, H102B.
	//
	// This is the opposite of what it was, when the section was the primary key
	// and every `A` cohort sorted ahead of every `B`. That order is correct for
	// levelled grades — the level *is* the band a reader scans for — but a grade 10
	// `A` and `B` are two sections of one Chinese class, not two ability bands. The
	// class number already puts a class's two sections together, so leading with it
	// interleaves `A`/`B` within each class rather than separating them by a page.
	if (!isLevelledGrade(a.grade)) {
		const byClass = a.classNumber.localeCompare(b.classNumber);
		return byClass !== 0 ? byClass : grade10SectionRank(a.level) - grade10SectionRank(b.level);
	}

	const byLevel = levelRank(a.level) - levelRank(b.level);
	return byLevel !== 0 ? byLevel : a.classNumber.localeCompare(b.classNumber);
}

/**
 * `A` before `B` within one grade 10 Chinese class.
 *
 * The deliberate opposite of `levelRank`'s handling of the same two letters. There
 * they are ranked as ability bands and `B` leads, matching easiest-first; here they
 * are two sections of a class whose number has already been compared, so `A` leads
 * because that is the order the class names read in.
 *
 * An unrecognised or missing section sorts last, for the reason `levelRank` does: a
 * section the school has renamed should end up at the end rather than displace a
 * real one.
 */
function grade10SectionRank(level: string | undefined): number {
	if (!level) return ESL_GRADE10_LEVELS.length;
	const index = ESL_GRADE10_LEVELS.indexOf(level as EslGrade10Level);
	return index === -1 ? ESL_GRADE10_LEVELS.length : index;
}

/**
 * The teacher day-join core (ticket #192): pure rules that turn one teacher's
 * weekly meetings plus a semester's events into day-view rows both UIs consume.
 *
 * Each meeting occurrence in the range becomes one row carrying its teaching
 * status, the cause, badges, collapsed dues, and the per-term count-up. The
 * query in `esl/schedule` reads the rows and this module decides them, so the
 * rules stay testable without a database and both views share one source of
 * truth. Dates are `YYYY-MM-DD` strings compared lexically (zero-padded, so
 * string order is calendar order) — the pre-existing `schoolYearOf`
 * local-vs-Taipei edge drift is out of scope and must not widen, so no
 * wall-clock reads happen here. Sunday dates never match a Mon–Fri meeting and
 * so never produce rows.
 */

/** One weekly meeting occurrence as the query reads it. */
export type ScheduleMeetingInput = {
	classId: string;
	type: EslClassType;
	cohortGrade: number;
	day: EslDay;
	period: number;
};

/** One semester event as the query reads it. */
export type ScheduleEventInput = {
	type: EslEventType;
	/** The explicit chip/banner title — never derived from the note. */
	title: string;
	target: EslEventTarget;
	date: string;
	endDate?: string;
	note?: string;
	startPeriod?: number;
	endPeriod?: number;
	reminderKind?: EslReminderKind;
	isBanner?: boolean;
};

/** A due collapsed onto a day row: the title plus its reminder window. */
export type ScheduleDue = {
	title: string;
	type: 'reminder';
	reminderKind: EslReminderKind;
	/**
	 * Whether the due rides the week row as a banner (the default, `#224`)
	 * instead of a day chip on the collapse day itself. Reminders default to
	 * `true` at write time, so a row written before the flag existed reads as
	 * a banner too.
	 */
	isBanner: boolean;
	windowStart: string;
	windowEnd: string;
};

/** The teaching status a day row carries. */
export type ScheduleDayStatus =
	| 'teaching'
	| 'off'
	| 'no_class'
	| 'exam'
	| 'partial'
	| 'oral_exam'
	| 'g9_mock';

/**
 * The first period with class on the first day of school (#212): Start of
 * School reads `Start at P3`, so meetings before P3 that day render No
 * class while P3 and later run as usual. The title and the window are one
 * rule — the title is locked, so the period is a constant beside it rather
 * than a field an admin could set out of sync.
 */
export const START_SCHOOL_FIRST_PERIOD = 3;

/** One rendered day-view row. */
export type ScheduleDayRow = {
	date: string;
	weekday: EslDay;
	classId: string;
	type: EslClassType;
	cohortGrade: number;
	period: number;
	status: ScheduleDayStatus;
	/** The human cause: the event label behind a non-teaching status. */
	cause: string | null;
	/** Render badges: window spans, out-of-window marks, oral marks. */
	badges: string[];
	/**
	 * True on partial rows whose meeting falls outside the partial window
	 * (#212): the list shows the note only ("class as usual") instead of
	 * title+note. Absent everywhere else — fixtures omit it for in-window
	 * rows.
	 */
	outOfWindow?: boolean;
	/** Dues collapsed onto this day (latest-eligible rule). */
	dues: ScheduleDue[];
	/**
	 * The per-term count-up (`Class k/n to <label>`) or null past the final
	 * anchor. Exams carry their own label; teaching days count toward their
	 * term's exam.
	 */
	count: { position: number; total: number; label: string } | null;
};

/** The weekday name of a `YYYY-MM-DD` date at noon UTC; null on weekends. */
export function weekdayOfDate(date: string): EslDay | null {
	const [year, month, day] = date.split('-').map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
	const name = (
		['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
	)[weekday];
	return name === 'Sunday' || name === 'Saturday' ? null : (name as EslDay);
}

/** Step a `YYYY-MM-DD` date forward one calendar day. */
export function nextEslDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

/** Whether an event reaches a class: `all` reaches everyone, `H1` the grade 10 classes. */
export function eventReachesClass(
	target: EslEventTarget,
	classType: EslClassType,
	cohortGrade: number
): boolean {
	if (target === 'all') return true;
	if (target === 'H1') return cohortGrade === 10;
	if (cohortGrade === 10) return false;
	if (target === 'CLIL') return classType === 'CLIL';
	if (target === 'Comm') return classType === 'Comm';
	if (target === 'G7') return cohortGrade === 7;
	if (target === 'G8') return cohortGrade === 8;
	return classType === 'G9';
}

/** Display order of day rows: date, then class, then period. */
function compareDayRows(a: ScheduleDayRow, b: ScheduleDayRow): number {
	return a.date.localeCompare(b.date) || a.classId.localeCompare(b.classId) || a.period - b.period;
}

/**
 * Whether a date is eligible to collect a due window or count toward an
 * exam: the class actually meets there — no off, no exam, no no-class, and
 * inside any partial window. Off wins over everything upstream (exclusivity
 * is refused at write time, so at most one exclusive event sits on a date).
 */
function isEslActiveDay(args: {
	date: string;
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	classId: string;
	period: number;
	type: EslClassType;
	cohortGrade: number;
}): boolean {
	const sameDay = args.events.filter(
		(event) =>
			event.date === args.date && eventReachesClass(event.target, args.type, args.cohortGrade)
	);
	if (sameDay.some((event) => event.type === 'no_school' || event.type === 'exam')) return false;
	if (sameDay.some((event) => event.type === 'no_class')) return false;
	// A mock day replaces the lesson, like an exam day (#224).
	if (sameDay.some((event) => event.type === 'g9_mock')) return false;
	// Before P3 on the start day the school has not started yet (#212).
	const start = sameDay.find((event) => event.type === 'start_school');
	if (start && args.period < START_SCHOOL_FIRST_PERIOD) return false;
	const meeting = args.meetings.find(
		(m) =>
			m.classId === args.classId && weekdayOfDate(args.date) === m.day && m.period === args.period
	);
	if (!meeting) return false;
	const partial = sameDay.find((event) => event.type === 'partial');
	if (partial) {
		if (partial.startPeriod !== undefined && args.period < partial.startPeriod) return false;
		if (partial.endPeriod !== undefined && args.period > partial.endPeriod) return false;
	}
	return true;
}

/**
 * Resolve one row's status from the events reaching it. Precedence:
 * exam > off > no_class > start-window > partial-window > oral > teaching.
 * Before P3 on the start day the school has not started yet, so those
 * meetings render No class (#212) while P3 and later run as usual. The oral
 * mark goes to the latest teaching-status meeting of each eligible class
 * before each reached exam, with the CLIL skip (CLIL classes never mark
 * orals) and G10 out of scope.
 */
function resolveEslDayStatus(args: {
	date: string;
	meeting: ScheduleMeetingInput;
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	exams: readonly ScheduleEventInput[];
}): { status: ScheduleDayStatus; cause: string | null; badges: string[]; outOfWindow: boolean } {
	const dayEvents = args.events.filter(
		(event) =>
			event.date === args.date &&
			eventReachesClass(event.target, args.meeting.type, args.meeting.cohortGrade)
	);
	const exam = dayEvents.find((event) => event.type === 'exam');
	if (exam) return { status: 'exam', cause: exam.title, badges: [], outOfWindow: false };
	const off = dayEvents.find((event) => event.type === 'no_school');
	if (off) return { status: 'off', cause: off.title, badges: [], outOfWindow: false };
	const noClass = dayEvents.find((event) => event.type === 'no_class');
	if (noClass) return { status: 'no_class', cause: noClass.title, badges: [], outOfWindow: false };
	// A G9 mock day is exam-like: the mock replaces the lesson, so the day
	// renders as its own chip rather than a teaching row (#224). It anchors
	// nothing, so it never counts toward an exam.
	const g9Mock = dayEvents.find((event) => event.type === 'g9_mock');
	if (g9Mock) return { status: 'g9_mock', cause: g9Mock.title, badges: [], outOfWindow: false };

	const start = dayEvents.find((event) => event.type === 'start_school');
	if (start && args.meeting.period < START_SCHOOL_FIRST_PERIOD) {
		return {
			status: 'no_class',
			cause: start.title,
			badges: [`out-of-window P${args.meeting.period} (window from P${START_SCHOOL_FIRST_PERIOD})`],
			outOfWindow: false
		};
	}

	const partial = dayEvents.find((event) => event.type === 'partial');
	const outOfWindow =
		partial &&
		((partial.startPeriod !== undefined && args.meeting.period < partial.startPeriod) ||
			(partial.endPeriod !== undefined && args.meeting.period > partial.endPeriod));

	if (outOfWindow && partial) {
		return {
			status: 'partial',
			cause: partial.title,
			badges: [
				`out-of-window P${args.meeting.period} (window${partial.startPeriod !== undefined ? ` from P${partial.startPeriod}` : ''}${partial.endPeriod !== undefined ? ` to P${partial.endPeriod}` : ''})`
			],
			outOfWindow: true
		};
	}

	// Oral-exam marking: eligible classes only (no CLIL, no G10), and only the
	// latest active day before each reached exam.
	if (args.meeting.type !== 'CLIL' && args.meeting.cohortGrade !== 10) {
		for (const target of args.exams) {
			if (target.date <= args.date) continue;
			if (!eventReachesClass(target.target, args.meeting.type, args.meeting.cohortGrade)) continue;
			let laterActive = false;
			for (let later = nextEslDate(args.date); later < target.date; later = nextEslDate(later)) {
				if (
					isEslActiveDay({
						date: later,
						meetings: args.meetings,
						events: args.events,
						classId: args.meeting.classId,
						period: args.meeting.period,
						type: args.meeting.type,
						cohortGrade: args.meeting.cohortGrade
					})
				) {
					laterActive = true;
					break;
				}
			}
			if (!laterActive) {
				const badges = [`oral ahead of ${target.title}`];
				if (partial)
					return { status: 'oral_exam', cause: partial.title, badges, outOfWindow: false };
				return {
					status: 'oral_exam',
					cause: `Oral exam ahead of ${target.title}`,
					badges,
					outOfWindow: false
				};
			}
		}
	}

	if (partial) return { status: 'partial', cause: partial.title, badges: [], outOfWindow: false };
	return { status: 'teaching', cause: null, badges: [], outOfWindow: false };
}

/**
 * The graduation ceremony anchoring G9-in-S2 counts: the no_class event
 * naming it in its title or note. Other no-class events (Sport's Day,
 * anniversary) never anchor a count — G9 mocks are g9_mock-typed by the
 * term-calculation safety rule, so ceremony matching never mistakes a mock
 * for the cutoff. Per-type gating (#212) locks new ceremonies to All, but
 * rows seeded before the gate keep their G9 target — either anchors.
 */
function g9CeremonyOf(events: readonly ScheduleEventInput[]): ScheduleEventInput | null {
	const ceremony = events
		.filter(
			(event) =>
				event.type === 'no_class' &&
				(event.target === 'G9' || event.target === 'all') &&
				/graduation|ceremony/i.test(`${event.title} ${event.note ?? ''}`)
		)
		.sort((a, b) => a.date.localeCompare(b.date))[0];
	return ceremony ?? null;
}

/** Count active meetings of one class inside `[from, to]`. */
function countEslActiveDays(args: {
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	classId: string;
	type: EslClassType;
	cohortGrade: number;
	from: string;
	to: string;
}): number {
	let total = 0;
	for (let cursor = args.from; cursor <= args.to; cursor = nextEslDate(cursor)) {
		const weekday = weekdayOfDate(cursor);
		if (weekday === null) continue;
		for (const meeting of args.meetings.filter(
			(m) => m.classId === args.classId && m.day === weekday
		)) {
			if (
				isEslActiveDay({
					date: cursor,
					meetings: args.meetings,
					events: args.events,
					classId: meeting.classId,
					period: meeting.period,
					type: args.type,
					cohortGrade: args.cohortGrade
				})
			) {
				total += 1;
			}
		}
	}
	return total;
}
/**
 * Build the teacher's day rows for a date range.
 *
 * Collapse: each ranged `reminder` lands once, on the latest active class
 * day inside its window; earlier occurrences are stripped (dues only attach
 * to the collapse target), and a window with no active day lands nowhere.
 * Count-ups run per term toward Exam 1 / Exam 2 / Final Exam as
 * `Class k/n to <label>`, with G9-in-S2 anchored on the graduation
 * ceremony; rows past the final anchor carry no count (also the finals-TBD
 * state before any exam exists).
 */
export function buildTeacherDayRows(args: {
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	semesterStart: string;
	semesterEnd: string | null;
	term: EslSemesterTerm;
	fromDate: string;
	toDate: string;
}): ScheduleDayRow[] {
	const start = args.fromDate < args.semesterStart ? args.semesterStart : args.fromDate;
	const end =
		args.semesterEnd !== null && args.toDate > args.semesterEnd ? args.semesterEnd : args.toDate;
	if (end < start) return [];

	const exams = args.events
		.filter((event) => event.type === 'exam' && event.date >= args.semesterStart)
		.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
	const ceremony = args.term === 'S2' ? g9CeremonyOf(args.events) : null;
	const rows: ScheduleDayRow[] = [];
	for (let date = start; date <= end; date = nextEslDate(date)) {
		const weekday = weekdayOfDate(date);
		if (weekday === null) continue;
		for (const meeting of args.meetings.filter((m) => m.day === weekday)) {
			// G9 graduates at the ceremony: no meeting rows past it, same as
			// past the final exam (the derived window clamps there).
			if (meeting.type === 'G9' && ceremony && date > ceremony.date) continue;
			const { status, cause, badges, outOfWindow } = resolveEslDayStatus({
				date,
				meeting,
				meetings: args.meetings,
				events: args.events,
				exams
			});

			let count: ScheduleDayRow['count'] = null;
			if (status === 'exam') {
				count = { position: 1, total: 1, label: cause ?? 'Exam' };
			} else if (
				status !== 'g9_mock' &&
				meeting.type === 'G9' &&
				ceremony &&
				date <= ceremony.date
			) {
				const position = countEslActiveDays({
					meetings: args.meetings,
					events: args.events,
					classId: meeting.classId,
					type: meeting.type,
					cohortGrade: meeting.cohortGrade,
					from: args.semesterStart,
					to: date
				});
				const total = countEslActiveDays({
					meetings: args.meetings,
					events: args.events,
					classId: meeting.classId,
					type: meeting.type,
					cohortGrade: meeting.cohortGrade,
					from: args.semesterStart,
					to: ceremony.date
				});
				count = { position, total, label: ceremony.note ?? ceremony.title };
			} else if (status !== 'g9_mock') {
				const reached = exams.filter((exam) =>
					eventReachesClass(exam.target, meeting.type, meeting.cohortGrade)
				);
				// Past the last reached exam (or past the final with the G9
				// ceremony extending the window) no upcoming anchor remains:
				// the row stays, the count drops — post-final carries no count.
				const upcoming = reached.find((exam) => exam.date >= date);
				if (upcoming) {
					const beforeUpcoming = reached
						.filter((exam) => exam.date < upcoming.date)
						.sort((a, b) => a.date.localeCompare(b.date));
					const previous =
						beforeUpcoming.length > 0 ? beforeUpcoming[beforeUpcoming.length - 1] : undefined;
					const windowFromExclusive =
						previous && previous.date >= args.semesterStart ? previous.date : null;
					const windowFrom =
						windowFromExclusive === null ? args.semesterStart : nextEslDate(windowFromExclusive);
					const from = windowFrom <= date ? windowFrom : date;
					const position = countEslActiveDays({
						meetings: args.meetings,
						events: args.events,
						classId: meeting.classId,
						type: meeting.type,
						cohortGrade: meeting.cohortGrade,
						from,
						to: date
					});
					const total = countEslActiveDays({
						meetings: args.meetings,
						events: args.events,
						classId: meeting.classId,
						type: meeting.type,
						cohortGrade: meeting.cohortGrade,
						from: windowFrom,
						to: upcoming.date
					});
					count = { position, total, label: upcoming.title };
				}
			}

			rows.push({
				date,
				weekday,
				classId: meeting.classId,
				type: meeting.type,
				cohortGrade: meeting.cohortGrade,
				period: meeting.period,
				status,
				cause,
				badges,
				...(outOfWindow ? { outOfWindow: true as const } : {}),
				dues: [],
				count
			});
		}
	}

	for (const event of args.events) {
		if (event.type !== 'reminder') continue;
		if (event.reminderKind === undefined) continue;
		const windowEnd = event.endDate ?? event.date;
		for (const row of rows) {
			if (row.date < event.date || row.date > windowEnd) continue;
			if (!eventReachesClass(event.target, row.type, row.cohortGrade)) continue;
			if (
				!isEslActiveDay({
					date: row.date,
					meetings: args.meetings,
					events: args.events,
					classId: row.classId,
					period: row.period,
					type: row.type,
					cohortGrade: row.cohortGrade
				})
			)
				continue;
			const laterExists = rows.some(
				(other) =>
					other.classId === row.classId &&
					other.date > row.date &&
					other.date <= windowEnd &&
					eventReachesClass(event.target, other.type, other.cohortGrade) &&
					isEslActiveDay({
						date: other.date,
						meetings: args.meetings,
						events: args.events,
						classId: other.classId,
						period: other.period,
						type: other.type,
						cohortGrade: other.cohortGrade
					})
			);
			if (laterExists) continue;
			const isBanner = event.isBanner ?? true;
			row.dues.push({
				title: event.title,
				type: 'reminder',
				reminderKind: event.reminderKind,
				isBanner,
				windowStart: event.date,
				windowEnd
			});
			// A banner carries its window in the week row (#224); only a day
			// chip needs the window as a badge on the collapse day.
			if (!isBanner) {
				row.badges.push(
					event.endDate && event.endDate !== event.date
						? `due window ${event.date}–${event.endDate}`
						: 'due'
				);
			}
		}
	}

	rows.sort(compareDayRows);
	return rows;
}

/**
 * Seed-service math (ticket #193): the auto rules that fill a semester's
 * draft rows so admins edit details instead of building from blank.
 *
 * All pure — the seed mutation in `esl/seed` stays a thin applier and these
 * rules stay unit-testable without a database.
 */

/**
 * Weekday counts per exam range: Exams 1/2 run two weekdays, the Final exam
 * three (#184 resolution; "Exam 3" is the wrong name per the #184 naming
 * comment — the third range is the Final exam).
 */
export const EXAM_SEED_WEEKDAYS: Readonly<Record<string, number>> = {
	'Exam 1': 2,
	'Exam 2': 2,
	'Final Exam': 3
};

/** G9 mocks are fixed two-day ranges (#184 resolution). */
export const G9_MOCK_SEED_DAYS = 2;

/**
 * The suggested end of an exam range: start + (N-1) weekdays, skipping
 * weekends. The start counts as day one, so a Friday two-day exam ends the
 * following Monday. Always a suggestion — the seeded rows stay editable.
 */
export function suggestExamEndDate(startDate: string, weekdayCount: number): string {
	let end = startDate;
	let counted = 1;
	while (counted < weekdayCount) {
		end = nextEslDate(end);
		if (weekdayOfDate(end) !== null) counted += 1;
	}
	return end;
}

/** The weekday dates of an inclusive range — the rows a multi-day exam seeds. */
export function weekdayDatesBetween(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	for (let date = startDate; date <= endDate; date = nextEslDate(date)) {
		if (weekdayOfDate(date) !== null) dates.push(date);
	}
	return dates;
}

/**
 * The teaching days an exam fans out to (#212): `dayCount` school days from
 * `startDate` inclusive, pushing past weekends and off days.
 *
 * The start counts when teachable; a weekend/off start slides forward to the
 * next teaching day. `offDates` holds the semester's no-school dates —
 * finite, so the walk always terminates.
 */
export function expandExamDays(args: {
	startDate: string;
	dayCount: number;
	offDates: ReadonlySet<string>;
}): string[] {
	const dates: string[] = [];
	let cursor = args.startDate;
	while (dates.length < args.dayCount) {
		if (weekdayOfDate(cursor) !== null && !args.offDates.has(cursor)) {
			dates.push(cursor);
		}
		cursor = nextEslDate(cursor);
	}
	return dates;
}

/** Whether a `YYYY-MM-DD` date falls on a weekend (no ESL meetings run). */
export function isWeekendEslDate(date: string): boolean {
	return weekdayOfDate(date) === null;
}

/** Step a `YYYY-MM-DD` date back one calendar day. */
function prevEslDate(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day - 1, 12)).toISOString().slice(0, 10);
}

/**
 * The Friday before a date — pure weekday math. The seed no longer
 * synthesizes a makeup row from it (#207: the official calendar's own
 * rows are authoritative); admins add any observed-day row by hand.
 */
export function fridayBeforeDate(date: string): string {
	let candidate = prevEslDate(date);
	while (weekdayOfDate(candidate) !== 'Friday') {
		candidate = prevEslDate(candidate);
	}
	return candidate;
}

/** Whether a seeded row is protected against deletion: exams + ceremony. */
export function isProtectedSeedEvent(event: {
	type: EslEventType;
	title: string;
	target?: EslEventTarget;
	note?: string;
}): boolean {
	if (event.type === 'exam') return true;
	// The S2 G9 cutoff — the same anchor `teacherDays` reads through
	// `/graduation|ceremony/i` on no_class rows (title or note: titles
	// are locked, so the ceremony names itself in the note). Per-type
	// gating (#212) locks new ceremonies to All, but rows seeded before
	// the gate keep their G9 target — both stay protected.
	return (
		event.type === 'no_class' &&
		(event.target === 'G9' || event.target === 'all' || event.target === undefined) &&
		/graduation|ceremony/i.test(`${event.title} ${event.note ?? ''}`)
	);
}

/** One Taiwan-Calendar day row, as the holiday API serves it (`YYYYMMDD`). */
export type TaiwanCalendarDayRow = {
	date: string;
	isHoliday: boolean;
	caption: string;
};

/** Read an API `YYYYMMDD` date (or an already-dashed one) as `YYYY-MM-DD`. */
function normalizeHolidayDate(date: string): string {
	const digits = date.replace(/-/g, '');
	if (/^\d{8}$/.test(digits)) {
		return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
	}
	return date;
}

/**
 * The off-day dates of one lunar festival with their captions: the
 * contiguous `isHoliday=true` run containing its caption.
 *
 * A cluster, not an exact caption==date lookup: when lunar 5/5 falls on a
 * Saturday (Dragon Boat 2025-05-31), the observed school off-day (Fri 05-30)
 * is captioned 補假 — but both rows share one `isHoliday` run with the
 * festival (t185 §2).
 */
export function findLunarOffDays(
	dayRows: readonly TaiwanCalendarDayRow[],
	festivalCaption: string
): { date: string; caption: string }[] {
	const normalized = dayRows
		.map((row) => ({
			date: normalizeHolidayDate(row.date),
			isHoliday: row.isHoliday,
			caption: row.caption
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
	const runs: { date: string; caption: string }[][] = [];
	for (const row of normalized) {
		if (!row.isHoliday) continue;
		const current = runs[runs.length - 1];
		const previous = current?.[current.length - 1];
		if (current && previous && nextEslDate(previous.date) === row.date) {
			current.push(row);
		} else {
			runs.push([row]);
		}
	}
	return runs
		.filter((run) => run.some((row) => row.caption.includes(festivalCaption)))
		.flatMap((run) => run.map((row) => ({ date: row.date, caption: row.caption })));
}

/**
 * The off-day dates of one lunar festival (captions dropped) — the seed's
 * weekday-math seam. See `findLunarOffDays` for the cluster rule.
 */
export function findLunarOffCluster(
	dayRows: readonly TaiwanCalendarDayRow[],
	festivalCaption: string
): string[] {
	return findLunarOffDays(dayRows, festivalCaption).map((row) => row.date);
}

/**
 * How far the S1 end-date default sits before the CNY break (ticket #209):
 * two weeks (14 calendar days), revised from the earlier 3-day rule. Exact
 * calendar days — no weekend shifting — so the admin sees a stable date to
 * adjust freely.
 */
export const S1_END_CNY_LEAD_DAYS = 14;

/**
 * Step a `YYYY-MM-DD` date by a signed number of calendar days (weekends
 * count — the #209 end defaults are calendar arithmetic, not weekday math).
 */
export function shiftEslDate(date: string, deltaDays: number): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + deltaDays, 12)).toISOString().slice(0, 10);
}

/**
 * The proposed S1 end: the `春節` isHoliday-run start minus two weeks. The
 * run start rides in resolved from `esl_holiday_cache` (see
 * `esl/semesters.endDateDefault`); the result stays an editable suggestion.
 */
export function suggestedS1EndDate(cnyRunStart: string): string {
	return shiftEslDate(cnyRunStart, -S1_END_CNY_LEAD_DAYS);
}

/**
 * The proposed S2 end: July 1st of the school year's second calendar year
 * (`2025-2026` → `2026-07-01`). Pure — no cache read — so both terms share
 * one `endDateDefault` seam.
 */
export function suggestedS2EndDate(schoolYear: string): string {
	const second = schoolYear.split('-')[1] ?? schoolYear;
	return `${second}-07-01`;
}

/**
 * Official-calendar CSV upload (ticket #207): dataset 14718 rows land in
 * the year-keyed `esl_holiday_cache`, which stays the runtime source the
 * seed reads at seed time.
 *
 * The Directorate-General files arrive in two encodings — Big5 (ROC-114
 * style) or UTF-8 with BOM (ROC-115/116 style) — with headers
 * `西元日期,星期,是否放假,備註`, dates as `YYYYMMDD`, and `是否放假=2`
 * marking an off day. Every row (off or workday) is stored: the official
 * `補假` rows are authoritative, so no weekend-makeup synthesis happens
 * anywhere in this flow.
 */

/**
 * Cleaned festival-caption translations (ticket #208): one key per caption
 * (the duplicated `端午節` is merged), with `春節→Chinese New Year` kept as
 * the fallback the S1 defaults read. Captions outside this list are not
 * dropped — `translateHolidayCaption` carries them verbatim and flags them
 * for manual translation instead.
 */
export const HOLIDAY_CAPTION_TRANSLATIONS: Record<string, string> = {
	開國紀念日: "New Year's Day",
	補假: 'Compensatory day off',
	和平紀念日: 'Peace Memorial Day',
	兒童節及民族掃墓節: "Children's Day and Tomb-Sweeping Day",
	兒童節: "Children's Day",
	民族掃墓節: 'Tomb-Sweeping Day',
	清明節: 'Tomb-Sweeping Day',
	端午節: 'Dragon Boat Festival',
	中秋節: 'Moon Festival',
	國慶日: 'Double Tenth Day',
	勞動節: 'Labor Day',
	'孔子誕辰紀念日/教師節': "Teacher's Day",
	教師節: "Teacher's Day",
	臺灣光復暨金門古寧頭大捷紀念日: 'Retrocession Day',
	行憲紀念日: 'Xmas',
	小年夜: "Lunar New Year's Eve",
	農曆除夕: "Lunar New Year's Eve",
	春節: 'Chinese New Year'
};

/**
 * English label for an official-calendar caption. Known captions translate
 * through the cleaned map; unknown ones ride through verbatim with
 * `needsTranslation: true` so the cache row is flagged for a human. Empty
 * captions (workday rows) carry no note and need no flag.
 */
export function translateHolidayCaption(caption: string): {
	english: string;
	needsTranslation: boolean;
} {
	const trimmed = caption.trim();
	if (trimmed === '') return { english: '', needsTranslation: false };
	const english = HOLIDAY_CAPTION_TRANSLATIONS[trimmed];
	if (english === undefined) return { english: trimmed, needsTranslation: true };
	return { english, needsTranslation: false };
}

/** One parsed official-calendar row, in the cache's storage form. */
export type HolidayCsvRow = {
	/** Day in `YYYYMMDD` form, e.g. `20250101`. */
	date: string;
	/** True when `是否放假` is `2`. */
	isHoliday: boolean;
	/** The `備註` caption, e.g. `元旦`, `補假` — empty otherwise. */
	caption: string;
};

const HOLIDAY_REQUIRED_HEADERS = ['西元日期', '星期', '是否放假', '備註'] as const;

/**
 * Decode an uploaded calendar file: strip a UTF-8 BOM when present,
 * otherwise decode strict UTF-8 with a Big5 fallback (the ROC-114 files
 * carry no BOM, so undecodable-as-UTF-8 bytes mean Big5).
 */
export function decodeHolidayBytes(bytes: Uint8Array): string {
	let buf = bytes;
	if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
		buf = buf.subarray(3);
	}
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(buf);
	} catch {
		return new TextDecoder('big5').decode(buf);
	}
}

/** Split one CSV line, honouring double-quoted fields. */
function splitHolidayCsvLine(line: string): string[] {
	const cells: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}
		if (char === ',' && !inQuotes) {
			cells.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	cells.push(current.trim());
	return cells;
}

/** Whether an 8-digit string is a real calendar date. */
function isRealYyyymmdd(digits: string): boolean {
	const year = Number(digits.slice(0, 4));
	const month = Number(digits.slice(4, 6));
	const day = Number(digits.slice(6, 8));
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const check = new Date(Date.UTC(year, month - 1, day));
	return (
		check.getUTCFullYear() === year &&
		check.getUTCMonth() === month - 1 &&
		check.getUTCDate() === day
	);
}

/**
 * Parse official-calendar CSV text (already decoded) into cache rows.
 *
 * Requires the four official headers (extra columns are tolerated),
 * keeps file order, skips rows without a valid `YYYYMMDD` date, and
 * throws when the file is empty, headerless, or holds no usable row.
 */
export function parseHolidayCsv(csvText: string): HolidayCsvRow[] {
	const withoutBom = csvText.replace(/^\ufeff/, '');
	const lines = withoutBom
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.split('\n')
		.filter((line) => line.trim() !== '');

	if (lines.length === 0) {
		throw new Error('CSV file is empty');
	}
	const headers = splitHolidayCsvLine(lines[0] ?? '');
	for (const required of HOLIDAY_REQUIRED_HEADERS) {
		if (!headers.includes(required)) {
			throw new Error(`Missing required header: ${required}`);
		}
	}
	const dateIdx = headers.indexOf('西元日期');
	const offIdx = headers.indexOf('是否放假');
	const noteIdx = headers.indexOf('備註');
	const needed = Math.max(dateIdx, offIdx, noteIdx);

	const rows: HolidayCsvRow[] = [];
	for (const line of lines.slice(1)) {
		const cells = splitHolidayCsvLine(line);
		if (cells.length <= needed) continue;
		const digits = (cells[dateIdx] ?? '').trim();
		if (!/^\d{8}$/.test(digits) || !isRealYyyymmdd(digits)) continue;
		rows.push({
			date: digits,
			isHoliday: (cells[offIdx] ?? '').trim() === '2',
			caption: (cells[noteIdx] ?? '').trim()
		});
	}
	if (rows.length === 0) {
		throw new Error('No valid rows found in CSV');
	}
	return rows;
}

/**
 * Advisory checklist panel (ticket #213): four expected-default groups on
 * the semester detail screen, each ✓/⚠ with one-click create. Advisory
 * only — nothing here refuses a write; the backend guards stay where they
 * are (`events.create`, `seed.seed`). Task items stay manual-only
 * (free-text title, no checklist entry).
 *
 * All pure — the `esl/checklist` query/mutation stays a thin applier and
 * these rules stay unit-testable without a database.
 */

/** One official-calendar row as the checklist reads it. */
export type ChecklistCacheRow = {
	/** `YYYYMMDD` (cache storage) or `YYYY-MM-DD` — both read. */
	date: string;
	isHoliday: boolean;
	caption: string;
};

/** One semester event as the checklist reads it. */
export type ChecklistEventRow = {
	type: EslEventType;
	date: string;
	title?: string;
	reminderKind?: EslReminderKind;
};

/**
 * The advisory window for group (a): official off-days in
 * `[startDate, derivedEnd-or-today]`. Before the first exam the end is
 * underivable (finals TBD), so the views clamp to start→today and the
 * checklist does the same. Lexical compare — zero-padded dates.
 */
export function checklistWindow(
	startDate: string,
	derivedEnd: string | null,
	today: string
): { start: string; end: string } {
	return { start: startDate, end: derivedEnd ?? today };
}

/**
 * Group (a): official off-days in-window. `expected` is every *named
 * weekday* `isHoliday` cache date inside the window — caption-less rows
 * are plain non-school days and named weekends need no event (no ESL
 * meetings run on weekends), so neither ever counts and the one-click
 * create can never stamp them; `present` the ones a `no_school` row
 * already covers; `missing` the one-click create fills.
 */
export function offDayChecklist(
	cacheRows: readonly ChecklistCacheRow[],
	events: readonly ChecklistEventRow[],
	window: { start: string; end: string }
): { expected: string[]; present: string[]; missing: string[]; ok: boolean } {
	const covered = new Set(
		events.filter((event) => event.type === 'no_school').map((event) => event.date)
	);
	const expected = [
		...new Set(
			cacheRows
				.filter((row) => row.isHoliday && row.caption.trim() !== '')
				.map((row) => normalizeHolidayDate(row.date))
				.filter((date) => date >= window.start && date <= window.end && !isWeekendEslDate(date))
				.sort()
		)
	];
	const present = expected.filter((date) => covered.has(date));
	const missing = expected.filter((date) => !covered.has(date));
	return { expected, present, missing, ok: missing.length === 0 };
}

/**
 * Group (b): even/odd unit-test + quiz drafts. Counts only — the date and
 * window rules belong to #214. This seam is the interface #214 fills:
 * `expectedUnitQuizDrafts` gives the per-term counts the checklist and the
 * one-click create both read, so #214's helpers slot in behind the same
 * names without moving the panel.
 */
export const QUNIT_QUIZ_PER_SEMESTER = 6;
export const QUNIT_UNIT_PER_SEMESTER = 6;

/** The stub expectation per term behind the #214 seam. */
export function expectedUnitQuizDrafts(term: 'S1' | 'S2'): { units: number; quizzes: number } {
	void term;
	return { units: QUNIT_UNIT_PER_SEMESTER, quizzes: QUNIT_QUIZ_PER_SEMESTER };
}

/**
 * Group (c): Passport-due + Recording-due per term — three of each per
 * semester, except G9 in S2 where the term ends at graduation (first two
 * terms only). Both types lock to Comm (#212), so the counts are the
 * whole rule.
 */
export const PASSPORT_RECORDING_PER_SEMESTER = 3;
export function expectedPassportRecordingCounts(args: { term: 'S1' | 'S2'; g9S2?: boolean }): {
	passport: number;
	recording: number;
} {
	if (args.term === 'S2' && args.g9S2 === true) return { passport: 2, recording: 2 };
	return {
		passport: PASSPORT_RECORDING_PER_SEMESTER,
		recording: PASSPORT_RECORDING_PER_SEMESTER
	};
}

/**
 * Group (d): G9-Mock drafts — two mock starts in S1, three in S2. Counts
 * are starts (each start seeds a two-day `g9_mock`/G9 pair — never
 * exam-typed, so the derived end stays safe).
 */
export const G9_MOCK_STARTS_BY_TERM: Readonly<Record<'S1' | 'S2', number>> = { S1: 2, S2: 3 };
export function expectedG9MockStarts(term: 'S1' | 'S2'): number {
	return G9_MOCK_STARTS_BY_TERM[term];
}

/**
 * The Gregorian calendar years whose official rows a checklist window can
 * draw: S1 spans two years (fall → spring), S2 sits in one. Same rule as
 * the setup page's `semesterUploadYears` (`$lib/esl-semesters`), repeated
 * here because Convex modules cannot import from `$lib`.
 */
export function checklistCacheYears(term: 'S1' | 'S2', startDate: string): string[] {
	const year = startDate.slice(0, 4);
	if (term === 'S2') return [year];
	return [year, String(Number(year) + 1)];
}

/**
 * Even/odd unit + quiz draft generation (ticket #214): pure ranges the
 * #213 advisory checklist consumes with one-click create.
 *
 * Model: 6 units per semester (S1 = U1–6, S2 = U7–12), each paired with
 * one quiz. Even-numbered units sit in the exact 7 calendar days before
 * their exam (`examStart−7d … examStart−1d`, no weekend shifting — the
 * views ignore non-teaching days on their own). Odd-numbered units are
 * the Mon–Fri week holding the median class meeting of their term
 * (`start→exam1`, `exam1→exam2`, `exam2→final`). Quiz drafts are ranged
 * `quiz` rows (fixed title `Quiz`, CLIL-only per #212) over their unit's
 * range, collapsing in the views to the last match date through the
 * existing dues rule — no new collapse code here. Unit drafts are
 * `task` rows with free-text `Unit N` titles, so a rarely skipped unit
 * is fixed by the admin editing titles forward; nothing is locked.
 *
 * Every generated range spans at least one school week: even ranges are
 * exactly 7 calendar days, odd ranges are always a full Mon–Fri week
 * (never clipped to a term edge).
 */

/** A draft's inclusive window: the shape both unit and quiz drafts share. */
export type UnitQuizRange = { date: string; endDate: string };

function checkUnitQuizDate(date: string): void {
	if (!isValidEslDate(date)) {
		throw new Error(`${date} is not a valid date. Use YYYY-MM-DD.`);
	}
}

/**
 * The even unit before an exam: the exact 7 calendar days
 * `examStart−7d … examStart−1d`. Calendar arithmetic — weekends stay
 * inside the range and the views skip them, so the draft never shifts.
 */
export function evenUnitRange(examStart: string): UnitQuizRange {
	checkUnitQuizDate(examStart);
	return { date: shiftEslDate(examStart, -7), endDate: shiftEslDate(examStart, -1) };
}

/**
 * The Monday of the week containing a date. Weekend dates fall back to
 * the Monday of the week just ended — a median is always a teaching day
 * (weekends never hold meetings), so this only steadies hand-passed
 * dates, never real medians.
 */
export function mondayOfWeekContaining(date: string): string {
	checkUnitQuizDate(date);
	const [year, month, day] = date.split('-').map(Number);
	const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
	return shiftEslDate(date, -((weekday + 6) % 7));
}

/**
 * The odd unit holding a date: the full Mon–Fri week, never clipped to
 * a term edge — clipping would mint a sub-week draft and break the
 * duration rule below.
 */
export function oddUnitRange(medianDate: string): UnitQuizRange {
	const monday = mondayOfWeekContaining(medianDate);
	return { date: monday, endDate: shiftEslDate(monday, 4) };
}

/** One class meeting occurrence inside a term window, as the median reads it. */
export type TermClassMeeting = {
	date: string;
	weekday: EslDay;
	classId: string;
	period: number;
};

/**
 * The term's class meetings in `[from, to]`: every weekly meeting whose
 * date falls in the window and whose class actually meets there — the
 * same exclusions the teacher join core applies (`isEslActiveDay`):
 * `Off`/`No class`-titled days (and exam days, which never teach),
 * partial windows the period falls outside of, and Start-of-School rows
 * before P3. Out-of-target events never reach the meeting. Sorted by
 * date, then class, then period, so the median below is deterministic.
 */
export function listTermClassMeetings(args: {
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	from: string;
	to: string;
}): TermClassMeeting[] {
	checkUnitQuizDate(args.from);
	checkUnitQuizDate(args.to);
	if (args.to < args.from) return [];
	const hits: TermClassMeeting[] = [];
	for (let date = args.from; date <= args.to; date = nextEslDate(date)) {
		const weekday = weekdayOfDate(date);
		if (weekday === null) continue;
		for (const meeting of args.meetings) {
			if (meeting.day !== weekday) continue;
			const dayEvents = args.events.filter(
				(event) =>
					event.date === date && eventReachesClass(event.target, meeting.type, meeting.cohortGrade)
			);
			if (dayEvents.some((event) => event.type === 'no_school' || event.type === 'exam')) {
				continue;
			}
			if (dayEvents.some((event) => event.type === 'no_class')) continue;
			const start = dayEvents.find((event) => event.type === 'start_school');
			if (start && meeting.period < START_SCHOOL_FIRST_PERIOD) continue;
			const partial = dayEvents.find((event) => event.type === 'partial');
			if (
				partial &&
				((partial.startPeriod !== undefined && meeting.period < partial.startPeriod) ||
					(partial.endPeriod !== undefined && meeting.period > partial.endPeriod))
			) {
				continue;
			}
			hits.push({ date, weekday, classId: meeting.classId, period: meeting.period });
		}
	}
	hits.sort(
		(a, b) =>
			a.date.localeCompare(b.date) || a.classId.localeCompare(b.classId) || a.period - b.period
	);
	return hits;
}

/**
 * The median class meeting's date: the middle occurrence, or the lower
 * of the two middles for an even count (the meeting by which half the
 * term's classes are done). Null when there is nothing to mediate —
 * the caller (#213) leaves that term without an odd draft rather than
 * guessing a week.
 */
export function medianMeetingDate(occurrences: readonly TermClassMeeting[]): string | null {
	if (occurrences.length === 0) return null;
	const sorted = [...occurrences].sort((a, b) => a.date.localeCompare(b.date));
	const median = sorted[Math.floor((sorted.length - 1) / 2)];
	return median?.date ?? null;
}

/**
 * The odd unit of one term window (`start→exam1`, `exam1→exam2`,
 * `exam2→final`): the Mon–Fri week holding the median of the term's
 * class count. Null for a term with no countable meetings — a degenerate
 * window drafts nothing.
 */
export function oddUnitRangeForTerm(args: {
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	from: string;
	to: string;
}): UnitQuizRange | null {
	const median = medianMeetingDate(
		listTermClassMeetings({
			meetings: args.meetings,
			events: args.events,
			from: args.from,
			to: args.to
		})
	);
	return median === null ? null : oddUnitRange(median);
}

/**
 * The six unit numbers of a semester term: S1 runs U1–6, S2 runs U7–12.
 * Odd numbers take odd-unit weeks, even numbers take even-unit weeks.
 */
export function unitNumbersForSemesterTerm(term: EslSemesterTerm): number[] {
	return term === 'S1' ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12];
}

/**
 * A unit's display title: sequential `Unit N`, so a rarely skipped unit
 * is fixed by the admin editing titles forward — never a locked value.
 */
export function unitTitle(unitNumber: number): string {
	return `Unit ${unitNumber}`;
}

/**
 * A quiz's default title: `Unit N Quiz Due`, so the checklist's one-click
 * drafts arrive numbered (Unit 1 Quiz Due, Unit 2 Quiz Due, …). The title
 * stays free-text — admins edit the number after creation when a unit
 * shifts — never a locked value.
 */
export function quizTitle(unitNumber: number): string {
	return `Unit ${unitNumber} Quiz Due`;
}

/** One unit draft: a free-title task-kind `reminder` over the unit's range. */
export type UnitDraft = {
	unit: string;
	type: 'reminder';
	reminderKind: 'task';
	title: string;
	target: EslEventTarget;
	date: string;
	endDate: string;
	isBanner: true;
};

/**
 * Draft the task-kind `reminder` for a unit: free-text title, default
 * target, the unit's range. The row stays editable — title shifts,
 * retargets, and range moves all go through the ordinary event edit.
 */
export function unitDraftForRange(unitNumber: number, range: UnitQuizRange): UnitDraft {
	const title = unitTitle(unitNumber);
	return {
		unit: title,
		type: 'reminder',
		reminderKind: 'task',
		title,
		target: defaultTargetForEventType('reminder', 'task'),
		date: range.date,
		endDate: range.endDate,
		isBanner: true as const
	};
}

/** One quiz draft: a numbered-title ranged quiz-kind `reminder` over its unit's range. */
export type QuizDraft = {
	unit: string;
	type: 'reminder';
	reminderKind: 'quiz';
	title: string;
	target: EslEventTarget;
	date: string;
	endDate: string;
	isBanner: true;
};

/**
 * Draft the quiz-kind `reminder` for a unit: the title defaults to
 * `Unit N Quiz Due` (free-text — admins edit the number after creation
 * when a unit shifts) and the target is always CLIL (the #212 per-type
 * gate). The `unit` label rides along for the #213 checklist display
 * only — it is never stored on the row.
 */
export function quizDraftForUnit(unitNumber: number, range: UnitQuizRange): QuizDraft {
	return {
		unit: unitTitle(unitNumber),
		type: 'reminder',
		reminderKind: 'quiz',
		title: quizTitle(unitNumber),
		target: defaultTargetForEventType('reminder', 'quiz'),
		date: range.date,
		endDate: range.endDate,
		isBanner: true as const
	};
}

/**
 * The start date of each exam group, oldest first: the min date of the rows
 * sharing an `examGroup` (title fallback for rows written before the field
 * existed — the same key `examGroupsOf` in `esl/events` refuses on).
 *
 * The #213 one-click create reads these as its even-unit anchors and
 * odd-unit window edges, so unit/quiz drafts land on the real #214 ranges
 * instead of placeholder dates. Non-exam rows never anchor a unit.
 */
export function examGroupStarts(
	events: readonly { type: EslEventType; title: string; date: string; examGroup?: string }[]
): string[] {
	const starts = new Map<string, string>();
	for (const event of events) {
		if (event.type !== 'exam') continue;
		const key = event.examGroup ?? event.title;
		const known = starts.get(key);
		if (known === undefined || event.date < known) starts.set(key, event.date);
	}
	return [...starts.values()].sort();
}

/**
 * The six unit/quiz ranges of a semester term, aligned with
 * `unitNumbersForSemesterTerm(term)` (#213+#214 wiring).
 *
 * Odd positions take the Mon–Fri week holding the median class meeting of
 * their term window (`start→exam1`, `exam1→exam2`, `exam2→final`);
 * even positions take the exact 7 calendar days before their exam. A
 * window with no countable meetings — or a missing anchor — falls back to
 * a 7-day placeholder stepping back from `fallbackEnd`, so every generated
 * draft still spans at least one school week (#214 duration rule) and stays
 * editable rather than guessed.
 */
export function planUnitQuizRanges(args: {
	term: EslSemesterTerm;
	semesterStart: string;
	examStarts: readonly string[];
	meetings: readonly ScheduleMeetingInput[];
	events: readonly ScheduleEventInput[];
	fallbackEnd: string;
}): UnitQuizRange[] {
	const anchors = [...args.examStarts].sort().slice(0, 3);
	const bounds = [args.semesterStart, ...anchors];
	let fallbacksUsed = 0;
	const fallback = (): UnitQuizRange => {
		const end = shiftEslDate(args.fallbackEnd, -7 * fallbacksUsed);
		fallbacksUsed += 1;
		return { date: shiftEslDate(end, -6), endDate: end };
	};
	const ranges: UnitQuizRange[] = [];
	for (let position = 0; position < 6; position += 1) {
		if (position % 2 === 0) {
			const from = bounds[position / 2];
			const to = bounds[position / 2 + 1];
			const odd =
				from !== undefined && to !== undefined
					? oddUnitRangeForTerm({ meetings: args.meetings, events: args.events, from, to })
					: null;
			ranges.push(odd ?? fallback());
		} else {
			const anchor = anchors[(position - 1) / 2];
			ranges.push(anchor !== undefined ? evenUnitRange(anchor) : fallback());
		}
	}
	return ranges;
}
