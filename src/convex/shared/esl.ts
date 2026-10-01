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
