/**
 * Pure rules for reading the ESL department's roster workbooks.
 *
 * Everything here is a function of the file's contents alone — no database, no
 * Convex runtime — so the browser and the apply mutation share one definition
 * of what a workbook means (ADR-0022). The importer runs in the browser to
 * spare the free-tier quota, and the server re-runs these same functions on the
 * staged payload rather than trusting it.
 *
 * The shapes encoded here were measured from the school's September workbooks
 * rather than assumed; see ADR-0022 §Context.
 */

import {
	chineseClassCode,
	grade10BaseClass,
	grade10ClassName,
	isValidSchoolStudentId,
	normalizeEslLevel,
	parseChineseClass,
	type ChineseClassReadError,
	type EslLevel
} from './esl';

/**
 * Re-exported so the import surface stays one module.
 *
 * `esl_import` is the vocabulary the import mutation and the browser both speak
 * (ADR-0022), and the homeroom rules belong to that vocabulary rather than to a
 * caller that happens to know which file they live in.
 */
export { chineseClassCode, parseChineseClass } from './esl';
export type { ChineseClassReadError } from './esl';

/**
 * A school student ID as read from a workbook cell.
 *
 * Excel frequently stores an all-digit ID as a number, which round-trips as
 * `511024.0`. Left alone, `511024.0` and `511024` are different strings and one
 * student becomes two. The trailing `.0` is the giveaway that the cell was
 * numeric, so an integral numeric value is written back as its integer string.
 *
 * A non-integral value is rejected rather than truncated: `511024.50` is not a
 * student ID, and truncating it to `511024` would merge two distinct students.
 *
 * Returns null when the value is not a usable ID.
 */
export function normalizeSchoolStudentId(raw: string): string | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;

	// A plain digit string is already in the right shape; it is still validated
	// so a wrong-length value cannot slip past the numeric branch below.
	if (/^\d+$/.test(trimmed)) {
		return isValidSchoolStudentId(trimmed) ? trimmed : null;
	}

	const asNumber = Number(trimmed);
	if (!Number.isFinite(asNumber)) return null;
	if (!Number.isInteger(asNumber)) return null;

	const normalized = String(asNumber);
	return isValidSchoolStudentId(normalized) ? normalized : null;
}

/**
 * The two ROC years a school year spans, as the leading three digits of an ID.
 *
 * The school's first three ID digits are the Taiwan (ROC) year the student
 * entered grade 7. Grade 7 is the intake year, so a student in grade `g` during
 * school year `Y` carries the prefix for `Y - (g - 7)`.
 */
const ROC_OFFSET = 1911;

/** The school year a cohort of students entered grade 7 in that ROC year. */
export function schoolYearFromRocEntry(rocEntryYear: number): string {
	const gregorian = rocEntryYear + ROC_OFFSET;
	return `${gregorian}-${gregorian + 1}`;
}

/** The ROC entry year for a `YYYY-YYYY` school year. */
export function rocEntryYearForSchoolYear(year: string): number {
	const start = Number(year.slice(0, 4));
	if (!Number.isInteger(start)) {
		throw new Error(`School year must look like YYYY-YYYY, got "${year}"`);
	}
	return start - ROC_OFFSET;
}

/** A levelled grade's group: a level and a class number within it. */
export type LevelledRosterGroup = { grade: number; level: EslLevel; classNumber: string };

/** Grade 10's group: a base class and its A/B section. */
export type Grade10RosterGroup = { grade: 10; baseClass: string; section?: 'A' | 'B' };

/**
 * A group as written in the workbook's `ESL Group` column, split into the parts
 * the cohort key needs.
 *
 * Levelled grades write `G9 Advanced 1`; grade 10 writes `H101A`. The two are
 * told apart by shape, not by trusting the sheet: `H1nn` followed by an optional
 * section letter is grade 10, everything else is a level and a number.
 *
 * The union discriminates on a literal rather than a widened `number`, so a
 * grade 10 group narrows properly and cannot be mistaken for a levelled one.
 */
export type ParsedRosterGroup = LevelledRosterGroup | Grade10RosterGroup;

/**
 * Whether a parsed group is one of grade 10's base classes rather than levelled.
 *
 * Exported so the import mutation can reject a grade 10 section appearing in a
 * levelled file with the same reading the parser used, rather than a second
 * version of the rule.
 */
export function isGrade10Group(group: ParsedRosterGroup): group is Grade10RosterGroup {
	return group.grade === 10;
}

/** `H1nn` optionally followed by a section letter, e.g. `H101`, `H101A`, `H110B`. */
const GRADE10_GROUP = /^H1(\d{2})([AB])?$/i;

/** A trailing class number, e.g. the `1` in `G9 Advanced 1`. */
const TRAILING_CLASS_NUMBER = /^(.*?)[\s]*(\d+)$/;

/** An optional leading grade marker, e.g. the `G9` in `G9 Advanced 1`. */
const LEADING_GRADE = /^G(\d+)\s*/i;

/**
 * Split an `ESL Group` cell into its level and class number.
 *
 * The class number is separated before the level is normalised, because the
 * workbooks contain at least one value missing a space (`G9 Elementary1`) and
 * the number has to come off first. The optional leading grade marker is
 * stripped next, and only then is the level matched through the alias table, so
 * the abbreviated spellings the workbooks use (`Pre-Ele`, `Ele`, `Int`, `Adv`)
 * resolve to the official names.
 *
 * A group with no number — G7 carries a bare `Pre-Ele` for its single
 * pre-elementary class — is class 1. That keeps `classNumber` required for every
 * levelled grade, so no special case leaks into the indexes and queries that
 * read cohorts, and a year that runs two of them (`G7 Pre-Ele 1`,
 * `G7 Pre-Ele 2`) still parses.
 *
 * Returns null when the cell is not a group at all, so the caller reports it
 * rather than filing a student under a guessed class.
 */
export function parseRosterGroup(raw: string): ParsedRosterGroup | null {
	const group = raw.trim();
	if (group === '') return null;

	const grade10 = GRADE10_GROUP.exec(group);
	if (grade10) {
		const baseClass = String(Number(grade10[1]));
		return {
			grade: 10,
			baseClass,
			...(grade10[2] ? { section: grade10[2].toUpperCase() as 'A' | 'B' } : {})
		};
	}

	const withNumber = TRAILING_CLASS_NUMBER.exec(group);
	const afterNumber = (withNumber ? withNumber[1] : group).trim();
	const classNumber = withNumber ? withNumber[2] : '1';
	if (afterNumber === '') return null;

	const gradeMatch = LEADING_GRADE.exec(afterNumber);
	const levelPart = gradeMatch ? afterNumber.slice(gradeMatch[0].length).trim() : afterNumber;
	if (levelPart === '') return null;

	const level = normalizeEslLevel(levelPart);
	if (level === null) return null;

	return {
		grade: gradeMatch ? Number(gradeMatch[1]) : 7,
		level,
		classNumber
	};
}

/** The leading ROC entry year of a student ID, e.g. `115` from `1150002`. */
function entryYearOf(schoolStudentId: string): number | null {
	if (schoolStudentId.length < 3) return null;
	const prefix = schoolStudentId.slice(0, 3);
	if (!/^\d{3}$/.test(prefix)) return null;
	return Number(prefix);
}

/**
 * The grade 10 ID space a student ID belongs to, or `null` if it is not on that
 * scheme at all.
 *
 * Grade 10 sits on a numbering space of its own that no other grade uses, and the
 * ID does say which grade it is because of that. A grade 10 ID is six digits: a
 * two-digit space, then four digits of sequence. The space advances one step per
 * school year, so it also carries the year — see `grade10SpaceForSchoolYear`.
 *
 * Told apart from a levelled ID by the third digit. A levelled ID is
 * `115001` — three-digit ROC entry year, always `1xx` — while a grade 10 ID's
 * first three digits run `500`–`599` and up. So the two never collide, and the
 * grade 10 space is read as two digits off an ID that is not `1xx`.
 */
function grade10SpaceOf(schoolStudentId: string): number | null {
	if (!/^\d{6}$/.test(schoolStudentId)) return null;
	const leading = Number(schoolStudentId.slice(0, 3));
	if (leading >= 100 && leading <= 199) return null;
	return Number(schoolStudentId.slice(0, 2));
}

/**
 * The two-digit grade 10 ID space used in 2026-2027.
 *
 * That year's G10 workbook numbers every student `51xxxx`. The school confirmed
 * the space is two digits rather than one because a single leading digit runs out
 * at ROC 119 (2030-2031) — the year after `5`, `6`, `7`, `8`, `9` — and what
 * happens after that is not yet known. Two digits buys decades instead, and the
 * only open question is whether the school restarts from `00` when the space
 * passes `99`, which `spaceOffset` handles by wrapping rather than by failing.
 */
const GRADE10_SPACE_ANCHOR = 51;

/** The school year whose grade 10 space is `51xxxx`. */
const GRADE10_SPACE_ANCHOR_YEAR = '2026-2027';

/**
 * How many school years after the anchor a space sits, wrapping at 100.
 *
 * Wrapping because the space is two digits and the school may well run `99` then
 * `00`; a space below the anchor is read as the next cycle rather than as a
 * negative offset, so the year still moves forward one step at a time.
 */
function spaceOffset(space: number): number {
	return (space - GRADE10_SPACE_ANCHOR + 100) % 100;
}

/**
 * The grade 10 ID space a given school year is numbered in, or `null` if the year
 * is not shaped like a school year.
 *
 * The inverse of the school's own numbering, and the only thing tying a grade 10
 * file to a year: its IDs name no intake year, so the arithmetic that places a
 * levelled file does nothing here.
 */
export function grade10SpaceForSchoolYear(year: string): number | null {
	const [from, to] = year.split('-').map((part) => Number(part));
	if (!Number.isInteger(from) || !Number.isInteger(to) || to - from !== 1) return null;
	const [anchorFrom, anchorTo] = GRADE10_SPACE_ANCHOR_YEAR.split('-').map(Number);
	if (to - anchorTo !== from - anchorFrom) return null;
	return (GRADE10_SPACE_ANCHOR + to - anchorTo + 100) % 100;
}

/** The school year a grade 10 ID space belongs to. */
export function schoolYearForGrade10Space(space: number): string | null {
	if (!Number.isInteger(space) || space < 0 || space > 99) return null;
	const [anchorFrom] = GRADE10_SPACE_ANCHOR_YEAR.split('-').map(Number);
	const start = anchorFrom + spaceOffset(space);
	return `${start}-${start + 1}`;
}

/**
 * What a file's IDs say about which school year it belongs to.
 *
 * `current` — every ID agrees on one school year.
 * `conflict` — the IDs imply more than one year, so the file has two years
 *   merged into it. Importing it would scatter students across cohorts in a way
 *   nothing could later reconcile, so it is refused rather than guessed at.
 * `indeterminate` — too few usable IDs to say.
 * `unsupported` — the grade cannot carry the arithmetic (grade 10 uses a
 *   separate numbering scheme with no grade relationship, so its file never
 *   determines a year).
 */
export type DerivedSchoolYear =
	| { kind: 'current'; year: string; entryYear: number }
	| { kind: 'conflict'; years: string[] }
	| { kind: 'indeterminate' }
	| { kind: 'unsupported'; reason: string };

/**
 * Work out which school year a file belongs to from its student IDs.
 *
 * The first three digits of an ID are the ROC year the student entered grade 7,
 * and grade 7 is the intake year — so for a student in grade `g` the school year
 * is `entryYear + (g - 7)`. For 2026-27 that gives G7 → `115`, G8 → `114`,
 * G9 → `113`, which is exactly the range layout measured in the workbooks.
 *
 * This derives the year from the data rather than inferring it. The obvious
 * alternative — treating "all G7 IDs are new" as a new school year — carries no
 * information at all, because grade 7 has an entirely new intake every year, so
 * it is equally true of a September import and of a mid-year re-import.
 *
 * Grade 10 is unsupported: its IDs move `4xxxxx` → `5xxxxx` → `6xxxxx` year to
 * year with no relationship to the intake year, so a G10 file follows whatever
 * year is current rather than determining one.
 */
export function deriveSchoolYear(
	grade: number,
	schoolStudentIds: readonly string[]
): DerivedSchoolYear {
	if (grade === 10) {
		return {
			kind: 'unsupported',
			reason: 'Grade 10 uses a separate ID scheme that does not identify a school year.'
		};
	}
	if (grade < 7 || grade > 9) {
		return { kind: 'unsupported', reason: `Grade ${grade} does not carry the intake-year scheme.` };
	}

	// Map each ID to the school year it implies, keeping only the IDs that
	// carry a usable three-digit prefix.
	const years = new Map<string, number>();
	for (const id of schoolStudentIds) {
		const entryYear = entryYearOf(id);
		if (entryYear === null) continue;
		const year = schoolYearFromRocEntry(entryYear + (grade - 7));
		years.set(year, entryYear);
	}

	if (years.size === 0) return { kind: 'indeterminate' };
	if (years.size > 1) return { kind: 'conflict', years: [...years.keys()].sort() };

	const [[year, entryYear]] = [...years];
	return { kind: 'current', year, entryYear };
}

/**
 * What a workbook's IDs say about which grade of which year it is.
 *
 * `grade` — every ID places in the same grade of the given year, so the grade
 *   follows from the year the admin confirmed and there is nothing to ask. That
 *   covers all four: the three levelled grades from their intake-year prefixes, and
 *   grade 10 from its own ID space.
 * `twoYears` — the IDs span two intake years, so the file has two school years
 *   merged into it. Reported, not resolved: importing it would scatter the cohort
 *   irrecoverably. Also covers a file mixing the levelled and grade 10 schemes,
 *   which has no single grade either.
 * `unknown` — the IDs are on no scheme this can read, so nothing places them.
 */
export type DerivedGrade =
	| { kind: 'grade'; grade: number }
	| { kind: 'twoYears'; years: string[] }
	| { kind: 'unknown' };

/**
 * The grade a file's IDs place in, for a school year the admin has confirmed.
 *
 * The inverse of `deriveSchoolYear`: for 2026-2027 a `113xxxx` ID is a student who
 * entered in ROC 113, two years after the 2026 intake, so they are in grade 9.
 *
 * Deliberately refuses to guess. A file that straddles two intake years is a fault
 * to report rather than a grade to pick, and picking the more common prefix would
 * quietly import the majority of it under the wrong year.
 */
export function deriveGradeForSchoolYear(
	year: string,
	schoolStudentIds: readonly string[]
): DerivedGrade {
	let intake;
	try {
		intake = rocEntryYearForSchoolYear(year);
	} catch {
		return { kind: 'unknown' };
	}

	// Only prefixes that place a student in a levelled grade of this year are
	// intake years at all. Grade 10 is on its own scheme, so it is set aside and
	// read separately below: its `511101` and `512101` have three leading digits like
	// any other ID, but they are not intake years, and counting them would report a
	// grade 10 file as holding school years 2422-2423 and 2423-2424.
	const grades = new Map<number, number>();
	const grade10Spaces = new Set<number>();
	for (const id of schoolStudentIds) {
		const space = grade10SpaceOf(id);
		if (space !== null) {
			grade10Spaces.add(space);
			continue;
		}
		const entryYear = entryYearOf(id);
		if (entryYear === null) continue;
		const grade = 7 + (intake - entryYear);
		if (grade < 7 || grade > 9) continue;
		grades.set(grade, entryYear);
	}

	// A file on the grade 10 space says so outright — no other grade is numbered
	// this way — so it needs nothing asked of the admin, the same as a levelled file.
	if (grades.size === 0 && grade10Spaces.size > 0) {
		return { kind: 'grade', grade: 10 };
	}

	// A file holding both schemes has no single grade. Reporting it as a merged file
	// is the honest answer: importing it would file one of the two halves under the
	// other's grade.
	if (grades.size > 0 && grade10Spaces.size > 0) {
		return { kind: 'twoYears', years: [] };
	}

	// Neither scheme: a file of unusable numbers.
	if (grades.size === 0) return { kind: 'unknown' };

	// One grade across the whole file: the ordinary case, and nothing to ask.
	if (grades.size === 1) return { kind: 'grade', grade: [...grades.keys()][0] };

	// Two or more levelled grades, so two intake years merged into one file.
	// Reported by the school years those cohorts entered on, which is the way the
	// admin thinks about it. Guessing the majority instead would import most of the
	// file under one year and say nothing about the rest.
	return {
		kind: 'twoYears',
		years: [...grades.values()].map((entryYear) => schoolYearFromRocEntry(entryYear)).sort()
	};
}

/**
 * The school year a grade 10 file's IDs place it in, or that they cannot.
 *
 * The counterpart to `deriveGradeForSchoolYear` for the one grade whose IDs carry
 * the year rather than an intake: the space moves one step per school year, so
 * `5xxxxx` is one year and `6xxxxx` the next. That is what lets a grade 10 file be
 * checked against the page's year the same way a levelled file is — its IDs name no
 * intake year, so the arithmetic that places a levelled file does nothing here.
 */
export function deriveGrade10SchoolYear(
	schoolStudentIds: readonly string[]
): { kind: 'current'; year: string } | { kind: 'conflict' } | { kind: 'unknown' } {
	const spaces = new Set<number>();
	for (const id of schoolStudentIds) {
		const space = grade10SpaceOf(id);
		if (space !== null) spaces.add(space);
	}
	if (spaces.size === 0) return { kind: 'unknown' };
	if (spaces.size > 1) return { kind: 'conflict' };
	const year = schoolYearForGrade10Space([...spaces][0]);
	return year === null ? { kind: 'unknown' } : { kind: 'current', year };
}

/**
 * The grades a workbook names for itself, read from its `ESL Group` column.
 *
 * Every levelled group is written `G7`, `G8` or `G9 …`, and grade 10's are `H1nn`,
 * so this is the file's own account of which grade it holds.
 *
 * It has no bearing on *which* grade a file is — that comes from the student IDs,
 * which are unique and whose relationship to the ROC year is fixed, so
 * `deriveGradeForSchoolYear` settles it on its own. This exists so the page can
 * notice that a file and the year on the page disagree, which is what lets it offer
 * to advance the year before staging. Reading the grade from the IDs alone cannot
 * surface that: set the year to 2027-2028 and a grade 7 file's `115xxxx` IDs resolve
 * cleanly to grade 8, consistently and wrongly, with nothing left to object.
 *
 * So it is a signal about the *year*, not a second opinion on the grade, and it
 * never changes the grade a file is imported as.
 */
export function gradesNamedInWorkbook(workbook: ParsedRosterWorkbook): number[] {
	const grades = new Set<number>();
	for (const student of workbook.students) grades.add(student.group.grade);
	return [...grades].sort((a, b) => a - b);
}

/** Header spellings that identify each column, matched case- and space-insensitively. */
const COLUMN_ALIASES = {
	schoolStudentId: ['student id', 'std id#', 'std id', 'id', 'studentid', '學號', '学号'],
	chineseName: ['chinese name', 'name', '中文姓名', '中文姓名'],
	englishName: ['english name', '英文姓名'],
	group: ['esl group', 'eslgroup', 'group', 'esl 組別'],
	chineseClass: ['c class', 'class', 'cclass']
} as const;

type RosterColumn = keyof typeof COLUMN_ALIASES;

/** One header cell reduced to a comparison key: lowercase, alphanumerics only. */
function headerKey(header: string): string {
	return header.toLowerCase().replace(/[^a-z0-9#]/g, '');
}

/**
 * Which column of a sheet holds each roster field, or null when absent.
 *
 * Columns are matched by header name rather than position, because the
 * workbooks disagree: G7 is `Student ID | C Class | Seat No. | Chinese Name |
 * English Name | ESL Group | Email` while G10 is `ESL group | Std ID# | Class |
 * Name | English Name` — the same fields in a different order, under different
 * spellings, with grade 10 leading with the group rather than trailing with it.
 */
export type SheetColumns = Record<RosterColumn, number | null>;

/** Map a sheet's header row onto the roster fields it provides. */
export function detectColumns(headerRow: readonly string[]): SheetColumns {
	const columns: SheetColumns = {
		schoolStudentId: null,
		chineseName: null,
		englishName: null,
		group: null,
		chineseClass: null
	};

	headerRow.forEach((header, index) => {
		const key = headerKey(header);
		if (key === '') return;
		for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
			RosterColumn,
			readonly string[]
		][]) {
			if (columns[field] !== null) continue;
			if (aliases.some((alias) => headerKey(alias) === key)) {
				columns[field] = index;
				return;
			}
		}
	});

	return columns;
}

/** Whether a sheet carries enough columns to be read as a class sheet at all. */
export function isReadableRosterSheet(columns: SheetColumns): boolean {
	if (columns.schoolStudentId === null || columns.group === null) return false;
	// The Chinese-class column is required, so a sheet without one is not readable
	// as a roster — the rows would be rejected one by one for the same missing
	// column, burying the real problem under 400 identical messages. Reported once
	// per sheet instead (ADR-0025).
	return columns.chineseClass !== null;
}

/** One student row, already normalised, with the group resolved to a cohort key. */
export type RosterStudent = {
	schoolStudentId: string;
	chineseName: string;
	/** Absent when the file has no English name yet — students may arrive without one. */
	englishName?: string;
	/**
	 * The Chinese homeroom's two-digit class number, e.g. `01` in a grade 7 cohort.
	 *
	 * Read out of the workbook's `C Class` / `Class` column and required: the
	 * Communication Slip prints the homeroom so a teacher can reach the right
	 * homeroom teacher, and a student with no homeroom cannot be given one
	 * (ADR-0025). The `J1`/`J2`/`J3`/`H1` marker is not stored — it is derived
	 * from the cohort's grade by `chineseClassCode`.
	 */
	chineseClass: string;
	group: ParsedRosterGroup;
};

/**
 * What to tell the admin about a `C Class` cell that could not be read.
 *
 * Phrased as the cell's actual contents beside the form the school uses, for the
 * same reason `describeUnreadableId` is: the admin's job is to fix the cell in
 * Excel, so the message has to say what is in it and what belongs there.
 */
export function describeUnreadableChineseClass(
	error: ChineseClassReadError,
	grade: number
): string {
	if (error === 'empty') {
		return `The Chinese class cell is empty. It should hold the student's homeroom, e.g. "${chineseClassCode(grade, '01')}".`;
	}
	if (error === 'shape') {
		return `The Chinese class cell is not in the school's form. It should read a grade marker and a two-digit class number, e.g. "${chineseClassCode(grade, '01')}".`;
	}
	return `The Chinese class starts "${error.found}", which is not a grade ${grade} homeroom — this is a grade ${grade} file, so it should read like "${chineseClassCode(grade, '01')}".`;
}

/**
 * What to tell the admin about a student ID cell that could not be read.
 *
 * The admin's job is to fix the cell in Excel, so the message names what the
 * cell actually reads and what the department expects there. "Unreadable
 * student ID" would leave them guessing which of the 495 rows — and which
 * column — to open.
 *
 * A value with a fractional part is called out separately from a value that is
 * not a number at all, because they are different mistakes: `511024.5` is a
 * number Excel mangled, while `115-0002` is a number someone typed with a dash.
 */
export function describeUnreadableId(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed === '') {
		return 'The student ID cell is empty. It should hold the school student number, e.g. 1130001.';
	}
	if (/^\d+\.\d*$/.test(trimmed)) {
		const value = Number(trimmed);
		return Number.isInteger(value)
			? `The student ID reads "${trimmed}". Excel stored it as a decimal; it should read ${String(value)}.`
			: `The student ID reads "${trimmed}", which is not a whole student number. It should read whole digits only, e.g. 1130001.`;
	}
	return `The student ID reads "${trimmed}", which is not a student number. It should read whole digits only, e.g. 1130001.`;
}

/** A row the importer could not read, kept so the admin can fix the workbook. */
export type RejectedRosterRow = { rowNumber: number; reason: string; raw: string[] };

/** The outcome of reading one sheet: its students, and what could not be read. */
export type ParsedRosterSheet = {
	students: RosterStudent[];
	rejected: RejectedRosterRow[];
	/**
	 * The distinct groups the sheet's rows name. More than one means the sheet is
	 * not a single class — either a summary sheet restating the whole grade, or a
	 * genuinely misfiled row.
	 */
	groups: string[];
};

/**
 * Read one sheet's rows into students, resolving each row's group.
 *
 * The `ESL Group` column is read, not the sheet name: sheet names are abbreviated
 * and do not round-trip (`G9 Adv 1` holds `G9 Advanced 1`). A row whose group
 * disagrees with the rest of its sheet is read here and refused by `classifySheet`
 * rather than adjudicated here, because there is no basis for choosing which of two
 * disagreeing columns is right (ADR-0025).
 *
 * `rowOffset` is the 1-based number of the first data row in the sheet, so
 * rejections point at the line the admin sees in Excel.
 */
export function parseRosterSheet(
	rows: readonly string[][],
	columns: SheetColumns,
	rowOffset = 2,
	grade = 7
): ParsedRosterSheet {
	const students: RosterStudent[] = [];
	const rejected: RejectedRosterRow[] = [];
	const groups = new Set<string>();

	const cell = (row: string[], index: number | null): string =>
		index === null || index >= row.length ? '' : (row[index] ?? '').trim();

	rows.forEach((row, offset) => {
		const rowNumber = rowOffset + offset;

		// A wholly empty row is not a row that could not be read. SheetJS is asked
		// to keep blank rows so that the ones above keep their Excel line numbers,
		// and every sheet in the school's workbooks runs on to a fixed 1000 rows
		// past its last student. Reporting those as rejections showed the admin
		// "10,485 rows could not be read" for a clean file, and buried the one
		// genuinely misfiled row the report exists to surface. A row with any
		// content in it is still judged on its merits below.
		if (row.every((value) => value.trim() === '')) return;

		const rawId = cell(row, columns.schoolStudentId);
		const schoolStudentId = normalizeSchoolStudentId(rawId);
		if (schoolStudentId === null) {
			// Every abnormality at once, and specific enough to fix the cell: what
			// the cell reads, and what the department expects to find there.
			rejected.push({ rowNumber, reason: describeUnreadableId(rawId), raw: row });
			return;
		}

		const rawGroup = cell(row, columns.group);
		if (rawGroup === '') {
			rejected.push({
				rowNumber,
				reason:
					'The ESL group cell is empty. It should read the class, e.g. "G9 Advanced 1" or "H101A".',
				raw: row
			});
			return;
		}
		groups.add(rawGroup);

		const parsed = parseRosterGroup(rawGroup);
		if (parsed === null) {
			rejected.push({
				rowNumber,
				reason: `The ESL group "${rawGroup}" is not a class the department runs. Expected a level and number such as "G9 Advanced 1", or a grade 10 section such as "H101A".`,
				raw: row
			});
			return;
		}
		if (isGrade10Group(parsed)) {
			// A grade 10 section is only meaningful in a grade 10 file, and vice
			// versa. Reported rather than coerced: a `H101A` row sitting in a G9
			// sheet is a misfiled row, and guessing which file was meant would
			// enrol a student in the wrong year.
			if (grade !== 10) {
				rejected.push({ rowNumber, reason: 'Grade 10 group in a levelled-grade sheet', raw: row });
				return;
			}
		} else if (grade === 10) {
			rejected.push({
				rowNumber,
				reason: `Levelled group "${rawGroup}" in a grade 10 file, which is taught by sections`,
				raw: row
			});
			return;
		}

		const chineseName = cell(row, columns.chineseName);
		if (chineseName === '') {
			rejected.push({
				rowNumber,
				reason: 'The Chinese name cell is empty, so the student cannot be enrolled.',
				raw: row
			});
			return;
		}

		// The Chinese class is read last, so a row that is already unreadable for a
		// stronger reason — an unusable ID, no group — reports that reason alone
		// rather than three at once for one cell.
		//
		// The marker is checked against the grade **this row's own group names**,
		// not the grade the file is being read as. The two agree in the ordinary
		// case, and differ exactly when the page derived the wrong grade from the
		// year — which is the year-mismatch case the import page's year prompt
		// exists to catch. Validating against the derived grade there rejected
		// every row, which emptied `students` and silenced the prompt it should
		// have raised, filing the file under the wrong grade instead (ADR-0025).
		//
		// A grade 10 group carries no grade of its own in the levelled sense, so
		// the file's grade is its only account of itself and stays the reference.
		const markerGrade = isGrade10Group(parsed) ? grade : parsed.grade;
		const rawChineseClass = cell(row, columns.chineseClass);
		const chineseClass = parseChineseClass(rawChineseClass, markerGrade);
		if ('error' in chineseClass) {
			rejected.push({
				rowNumber,
				reason: describeUnreadableChineseClass(chineseClass.error, markerGrade),
				raw: row
			});
			return;
		}

		// A blank English name is legitimate — G7 may arrive before teachers fill
		// them in — so it is left absent rather than stored as an empty string.
		const englishName = cell(row, columns.englishName);
		students.push({
			schoolStudentId,
			chineseName,
			...(englishName === '' ? {} : { englishName }),
			chineseClass: chineseClass.classNumber,
			group: parsed
		});
	});

	return { students, rejected, groups: [...groups] };
}

/** What kind of sheet a workbook contains, and why it was judged that way. */
export type ClassifiedSheet =
	| {
			kind: 'class';
			sheetName: string;
			parsed: ParsedRosterSheet;
			columns: SheetColumns;
			/** Set when the sheet spelled its single group more than one way. */
			reason?: string;
	  }
	| { kind: 'summary'; sheetName: string; reason: string; columns: SheetColumns }
	| { kind: 'unreadable'; sheetName: string; reason: string }
	| {
			/**
			 * A class sheet that disagrees with itself — a row filed under another
			 * class, or a grade 10 homeroom that is not its cohort's. Refused whole:
			 * the file is not applied until the workbook is fixed (ADR-0025).
			 */
			kind: 'misfiled';
			sheetName: string;
			reason: string;
			columns: SheetColumns;
			parsed: ParsedRosterSheet;
	  };

/** A group's identity after parsing, so spelling drift does not split one class. */
function groupKey(group: ParsedRosterGroup): string {
	return isGrade10Group(group)
		? `10:${group.baseClass}:${group.section ?? ''}`
		: `${group.grade}:${group.level}:${group.classNumber}`;
}

/**
 * The unit a sheet's rows must agree on for the sheet to be one class.
 *
 * For G7–G9 that is the whole group. For grade 10 it is the **base class**: one
 * sheet is one Chinese class, and its rows carry that class's two sections
 * (`H101A` and `H101B`), so the two sections are one class rather than two. A
 * sheet spanning `H101A` and `H102A` still fails, which is what keeps the
 * `Chinese Class` summary sheet out.
 */
function classKeyOf(group: ParsedRosterGroup): string {
	return isGrade10Group(group) ? `10:${group.baseClass}` : groupKey(group);
}

/**
 * How much of a sheet one class must account for before the sheet is that class.
 *
 * A class sheet is one class. The measured exception is a single misfiled row —
 * a student who moved level and had their `ESL Group` left unchanged — which makes
 * the sheet name two classes. Read strictly, that discarded the whole sheet: 18
 * students in `G7 Basic 5` and 22 in `G8 Inter 1` vanished because of one row each,
 * and the sheet was reported as a whole-grade summary, which is the opposite of what
 * it is.
 *
 * A half is enough to tell the two apart without a maintained list of sheet names: a
 * class sheet is one class by a wide margin, while a summary sheet that restates the
 * grade has no majority at all — the largest group in the grade 10 `Chinese Class`
 * sheet is 52 of 495, about a tenth.
 *
 * A sheet that clears this bar is still refused if it disagrees with itself, which is
 * what the misfiled-row check below is for (ADR-0025).
 */
const MAJORITY_CLASS_SHARE = 0.5;

/**
 * The class a sheet's rows mostly name, spelled the way the workbook spells it.
 *
 * Read back out of the sheet's own `ESL Group` cells rather than composed from the
 * cohort key, so the message quotes the file back to the admin verbatim — the same
 * principle as `describeUnreadableId`, and the reason a sheet whose name is
 * abbreviated (`G8 Inter 1`) still reports the full form the column holds.
 */
function describeLeadingClass(parsed: ParsedRosterSheet, leadingClass: string): string | null {
	const written = parsed.groups.find((raw) => {
		const group = parseRosterGroup(raw);
		return group !== null && classKeyOf(group) === leadingClass;
	});
	// Null rather than a guess: a sheet always has such a cell by this point, since
	// `leadingClass` came from one of them. If it somehow does not, the odd groups
	// alone still name what to fix.
	return written ?? null;
}

/**
 * Why a grade 10 sheet's homerooms disagree with its own cohort, or null when
 * they agree.
 *
 * Grade 10's cohorts are keyed by Chinese class, so a sheet's `Class` column and
 * the base class in its `ESL Group` column are the same fact stated twice
 * (ADR-0023). Levelled grades are deliberately mixed across homerooms, so there
 * is nothing to check them against and they are left alone.
 *
 * Every homeroom in the sheet must match, not just the majority: one student in
 * the wrong homeroom is the same silent error as one in the wrong ability band.
 */
function describeChineseClassMismatch(
	parsed: ParsedRosterSheet,
	grade: number,
	leadingClass: string
): string | null {
	if (grade !== 10) return null;
	// `classKeyOf` keys grade 10 as `10:<baseClass>` with the base class unpadded,
	// so it is read from index 1 and normalised through the shared padding helper
	// before being compared to a stored two-digit class number.
	const rawNumber = leadingClass.split(':')[1];
	if (rawNumber === undefined) return null;
	const cohortNumber = grade10BaseClass(rawNumber);

	const wrong = [
		...new Set(
			parsed.students
				.filter((student) => student.chineseClass !== cohortNumber)
				.map(
					(student) =>
						`${student.schoolStudentId} (${chineseClassCode(grade, student.chineseClass)})`
				)
		)
	];
	if (wrong.length === 0) return null;

	return `A grade 10 class draws students from exactly one Chinese class, but this sheet's class is ${chineseClassCode(grade, cohortNumber)} while ${wrong.join(', ')} name a different one. Fix the Class cell in the workbook, or the ESL Group cell if that is the wrong one — the file is not applied until they agree.`;
}

/**
 * Decide whether a sheet is one class or a whole-grade summary.
 *
 * A sheet is a class when one class accounts for at least `MAJORITY_CLASS_SHARE` of
 * its rows. Summary sheets (`Chinese class`, `ESL class`, `ESL Class (2)`, `G9
 * Chinese`) restate every student in the grade, so no class has a majority and they
 * fail this test naturally — no maintained exclusion list is needed, and a class
 * sheet the school adds next year still works.
 *
 * Counts are taken over *resolved* groups, so a sheet that merely spells one class
 * two ways is still recognised as one class: the G9 workbook has a row reading
 * `G9 Elementary1` where the rest of its sheet reads `G9 Elementary 1`, and both
 * parse to the same class.
 */
export function classifySheet(
	sheetName: string,
	rows: readonly string[][],
	headerRow: readonly string[],
	rowOffset = 2,
	grade = 7
): ClassifiedSheet {
	const columns = detectColumns(headerRow);
	if (!isReadableRosterSheet(columns)) {
		return {
			kind: 'unreadable',
			sheetName,
			reason:
				columns.schoolStudentId === null || columns.group === null
					? 'No student ID or ESL group column was found in the header row.'
					: 'No Chinese class column was found in the header row. It should be headed "C Class" or "Class", holding each student\'s homeroom such as J101.'
		};
	}

	const parsed = parseRosterSheet(rows, columns, rowOffset, grade);

	// Rows per resolved class, so a sheet can be judged on what its rows mostly
	// say rather than on whether they all agree. A sheet that merely spells one
	// class two ways counts once, and — for grade 10 — a sheet holding both of one
	// base class's sections counts as the one class it is.
	const perClass = new Map<string, number>();
	let classed = 0;
	for (const raw of parsed.groups) {
		const group = parseRosterGroup(raw);
		if (group === null) continue;
		classed += 1;
		const key = classKeyOf(group);
		perClass.set(key, (perClass.get(key) ?? 0) + 1);
	}

	const [leadingClass, leadingCount] = [...perClass.entries()].sort((a, b) => b[1] - a[1])[0] ?? [
		'',
		0
	];
	const hasMajority = classed > 0 && leadingCount / classed >= MAJORITY_CLASS_SHARE;

	if (perClass.size > 1 && !hasMajority) {
		return {
			kind: 'summary',
			sheetName,
			reason: `No single class accounts for its rows — the largest is ${leadingCount} of ${classed} — so this restates the grade rather than naming one class.`,
			columns
		};
	}
	if (parsed.students.length === 0) {
		return {
			kind: 'summary',
			sheetName,
			reason:
				parsed.rejected.length > 0
					? 'No row could be read into a student, so there is no class to import.'
					: 'No rows carry an ESL group, so there is no class to import.',
			columns
		};
	}

	// Rows naming a class other than the sheet's leading one are misfiled: a row
	// whose `ESL Group` disagrees with the class the rest of its sheet holds. The
	// department has confirmed these are typos they will fix, and a wrong ability
	// band is silent — every count still adds up and the roster is quietly wrong —
	// so the file is refused rather than filed by whichever column looks right
	// (ADR-0025).
	//
	// A mere misspelling — `G9 Elementary1` beside `G9 Elementary 1` — is not
	// reported here: both parse to the same class, so the sheet is simply that class
	// and every student in it is already filed correctly.
	const misfiled = [
		...new Set(
			parsed.groups.filter((raw) => {
				const group = parseRosterGroup(raw);
				return group !== null && classKeyOf(group) !== leadingClass;
			})
		)
	];

	if (misfiled.length > 0) {
		// Refused, not warned about. A wrong ability band is silent — every count
		// still adds up and the roster is quietly wrong — so the department
		// confirmed these are typos they will fix, and the fix belongs in the
		// workbook rather than in a rule that guesses which column is right
		// (ADR-0025).
		//
		// The message names both sides of the disagreement, because the admin's job
		// is to find one cell: the class the sheet otherwise holds, and the value
		// sitting in the column that contradicts it.
		//
		// The majority test above is what keeps this from swallowing class sheets:
		// a sheet is only judged once one class already accounts for its rows.
		return {
			kind: 'misfiled',
			sheetName,
			reason: `This sheet's ESL Group column holds ${misfiled.join(' and ')} beside ${describeLeadingClass(parsed, leadingClass) ?? sheetName}. Fix the ESL Group cell on the odd row${misfiled.length === 1 ? '' : 's'} in the workbook and import again — the file is not applied until the sheet agrees with itself.`,
			columns,
			parsed
		};
	}

	// A grade 10 cohort is one Chinese class by construction (ADR-0023), so the
	// homeroom the file states and the cohort its group names are the same fact
	// said twice. A disagreement means one is a typo, and there is no basis for
	// choosing which — refused for the same reason as the misfiled rows above.
	const chineseClassMismatch = describeChineseClassMismatch(parsed, grade, leadingClass);
	if (chineseClassMismatch !== null) {
		return {
			kind: 'misfiled',
			sheetName,
			reason: chineseClassMismatch,
			columns,
			parsed
		};
	}

	return { kind: 'class', sheetName, parsed, columns };
}

/** A workbook read end to end: the class sheets, and the sheets set aside. */
export type ParsedRosterWorkbook = {
	grade: number;
	classes: Extract<ClassifiedSheet, { kind: 'class' }>[];
	skipped: Exclude<ClassifiedSheet, { kind: 'class' }>[];
	/** Every student across the class sheets, in sheet order. */
	students: RosterStudent[];
	/** Every row that could not be read, tagged with the sheet it came from. */
	rejected: (RejectedRosterRow & { sheetName: string })[];
	/** The school year the file's IDs imply, when the grade can carry the arithmetic. */
	derivedYear: DerivedSchoolYear;
};

/**
 * Read a whole grade workbook: classify every sheet, then keep the class sheets.
 *
 * `grade` is the grade of the file, which the workbooks do not state in a
 * reliable single place — sheet names are abbreviated and grade 10's sheets are
 * named after their base class — so the admin selects it and the year
 * derivation then checks the file's IDs against it.
 */
export function parseRosterWorkbook(
	grade: number,
	sheets: readonly {
		name: string;
		headerRow: readonly string[];
		rows: readonly string[][];
		/**
		 * The 1-based Excel row the first data row sits on. The workbooks carry a
		 * title above the header, so this is not always 2 — and when it is wrong,
		 * every rejected row points at the wrong line of the file the admin is
		 * looking at.
		 */
		rowOffset?: number;
	}[]
): ParsedRosterWorkbook {
	const classes: Extract<ClassifiedSheet, { kind: 'class' }>[] = [];
	const skipped: Exclude<ClassifiedSheet, { kind: 'class' }>[] = [];
	const students: RosterStudent[] = [];
	const rejected: (RejectedRosterRow & { sheetName: string })[] = [];

	for (const sheet of sheets) {
		const classified = classifySheet(
			sheet.name,
			sheet.rows,
			sheet.headerRow,
			sheet.rowOffset ?? 2,
			grade
		);
		if (classified.kind === 'class') {
			classes.push(classified);
			students.push(...classified.parsed.students);
			rejected.push(
				...classified.parsed.rejected.map((row) => ({ ...row, sheetName: sheet.name }))
			);
		} else {
			skipped.push(classified);
		}
	}

	return {
		grade,
		classes,
		skipped,
		students,
		rejected,
		derivedYear: deriveSchoolYear(
			grade,
			students.map((student) => student.schoolStudentId)
		)
	};
}

/** Why a student absent from the workbook is being disabled. */
export const IMPORT_DISABLED_REASON = 'Not in imported roster';

/** A cohort as it exists today, as the planner needs to see it. */
export type ExistingCohort = {
	id: string;
	grade: number;
	level?: string;
	classNumber: string;
};

/** A student as they exist today, as the planner needs to see them. */
export type ExistingStudent = {
	id: string;
	cohortId: string;
	schoolStudentId: string;
	chineseName: string;
	englishName?: string;
	/**
	 * Absent only on a row created by a year advance, whose next homeroom is not
	 * yet known — so a diff against it is never reported, since there is nothing
	 * on file to have changed from (ADR-0025).
	 */
	chineseClass?: string;
	status: 'active' | 'disabled';
};

/**
 * A cohort the file references, reduced to what creating it needs.
 *
 * `level` is absent for grade 10, which is taught by sections rather than ability
 * bands, so it is optional here for the same reason it is optional on the stored
 * row: a required level would either reject every G10 cohort or invite a fake one.
 */
export type RequestedCohort = { grade: number; level?: string; classNumber: string };

/** The key a cohort is matched on within a school year. */
function cohortKeyOf(cohort: { grade: number; level?: string; classNumber: string }): string {
	return `${cohort.grade}:${cohort.level ?? ''}:${cohort.classNumber}`;
}

/**
 * A parsed group back into the `ESL Group` cell text the workbook used.
 *
 * The apply mutation re-reads this text rather than trusting a parsed payload
 * (ADR-0022), so the browser composes it and the server re-parses it. Rendered
 * from the shared spelling helpers rather than by string interpolation, so the
 * grade 10 form is the school's `H101A` and not an invented `G10 … 01`.
 */
export function rosterGroupText(group: ParsedRosterGroup): string {
	if (!isGrade10Group(group)) return `G${group.grade} ${group.level} ${group.classNumber}`;
	// A section is always A or B on a parsed group, but the shared helper takes the
	// class type, so the section letter selects it rather than being interpolated.
	const type = group.section === 'A' ? 'H10A' : 'H10B';
	return grade10ClassName(grade10BaseClass(group.baseClass), type);
}

/**
 * The cohort a parsed group belongs to.
 *
 * The one place a group becomes a cohort key, shared by the planner and the
 * mutation, so a preview and the apply it plans cannot disagree about which
 * cohort a row lands in. Grade 10 contributes its base class as the cohort's
 * class number and no level, which is what makes `H101A` and `H101B` one cohort
 * taught by two classes.
 */
export function cohortOfGroup(group: ParsedRosterGroup): RequestedCohort {
	if (!isGrade10Group(group)) {
		return { grade: group.grade, level: group.level, classNumber: group.classNumber };
	}
	// Grade 10's cohort is one Chinese class at one ability level, so the level
	// letter is part of its identity: `H101A` and `H101B` are two cohorts with two
	// rosters, not one cohort with two classes (ADR-0023). Keying on the base class
	// alone is what merged the two levels together.
	const { section } = group;
	return section === undefined
		? { grade: 10, classNumber: grade10BaseClass(group.baseClass) }
		: { grade: 10, level: section, classNumber: grade10BaseClass(group.baseClass) };
}

/**
 * What the import would do to one existing student, as a reportable change.
 *
 * Each kind is a distinct category because each needs a different decision from
 * the admin. Notably `nameChange` is reported rather than applied silently: a
 * differing English name may be a student's genuine mid-year request — which the
 * school does receive, and which may arrive through this workbook — or a typo in
 * the spreadsheet, and only the admin can tell which.
 */
export type PlannedStudentChange =
	| { kind: 'new'; schoolStudentId: string; cohortKey: string; student: RosterStudent }
	| {
			kind: 'levelChange';
			schoolStudentId: string;
			studentId: string;
			fromCohortId: string;
			toCohortId: string;
			fromCohortKey: string;
			toCohortKey: string;
	  }
	| {
			kind: 'nameChange';
			schoolStudentId: string;
			studentId: string;
			from: string;
			to: string;
	  }
	| {
			/**
			 * A student who moved Chinese homeroom mid-year.
			 *
			 * Reported rather than folded into `unchanged`, because the import
			 * summary is the only place the department learns a transfer happened —
			 * and unlike a name change it needs no approval, since a homeroom that
			 * differs from the one on file is simply the truth arriving late
			 * (ADR-0025).
			 */
			kind: 'classChange';
			schoolStudentId: string;
			studentId: string;
			grade: number;
			from: string;
			to: string;
	  }
	| {
			kind: 'disabled';
			schoolStudentId: string;
			studentId: string;
			cohortId: string;
			reason: string;
	  }
	| { kind: 'unchanged'; schoolStudentId: string; studentId: string };

/** Per-cohort totals, so the report shows counts without rescanning. */
export type PlannedCohortSummary = {
	cohortId: string;
	cohortKey: string;
	added: number;
	moved: number;
	/** Students this import would leave, active and disabled combined. */
	total: number;
};

/** The whole dry-run: what applying this file would change, and what it needs. */
export type ImportPlan = {
	changes: PlannedStudentChange[];
	cohorts: PlannedCohortSummary[];
	/** Cohorts the file needs that do not exist yet, for the create step. */
	missingCohorts: RequestedCohort[];
	/** A student ID appearing more than once in the file. */
	duplicateIds: string[];
	/** A student ID with more than one row in the target year, so matching is ambiguous. */
	ambiguousIds: string[];
	totals: {
		new: number;
		levelChange: number;
		nameChange: number;
		classChange: number;
		disabled: number;
		unchanged: number;
	};
};

/** The identity of the cohort a student row belongs to. */
function cohortShapeOf(
	cohortId: string,
	cohorts: readonly ExistingCohort[]
): { grade: number; level?: string; classNumber: string } {
	return cohorts.find((cohort) => cohort.id === cohortId) ?? { grade: 0, classNumber: '' };
}

/**
 * Plan what importing a workbook would do, without touching the database.
 *
 * This is the dry run the admin confirms before anything is written, and it is a
 * pure function so the same plan is produced in the browser for the preview and
 * on the server, which re-derives it from the staged payload rather than
 * trusting what the browser sent.
 *
 * The rules, and why each is asymmetric:
 *
 * - **Grouping is the file's authority.** A student the file places in a
 *   different cohort is moved there, because the workbook is the class of record.
 * - **A blank English name never erases a stored one.** G7 may arrive before
 *   teachers fill names in, and re-importing must not wipe a name an admin typed.
 * - **A non-blank differing name is reported, not applied on sight** — see
 *   `PlannedStudentChange`.
 * - **A student absent from the file is disabled with a reason, never deleted**,
 *   so transfer history survives and the change is reversible.
 *
 * `existingStudents` must already be scoped to the target school year: a
 * student's ID legitimately has one row per year, so matching must not reach
 * across years and treat this year's grade 8 as a different student from last
 * year's grade 7.
 */
export function planRosterImport(
	requested: readonly RequestedCohort[],
	students: readonly RosterStudent[],
	existingCohorts: readonly ExistingCohort[],
	existingStudents: readonly ExistingStudent[]
): ImportPlan {
	const cohortsByKey = new Map(existingCohorts.map((cohort) => [cohortKeyOf(cohort), cohort]));

	const missingCohorts: RequestedCohort[] = [];
	const seenMissing = new Set<string>();
	for (const request of requested) {
		const key = cohortKeyOf(request);
		if (cohortsByKey.has(key) || seenMissing.has(key)) continue;
		seenMissing.add(key);
		missingCohorts.push(request);
	}

	const byId = new Map<string, ExistingStudent[]>();
	for (const student of existingStudents) {
		byId.set(student.schoolStudentId, [...(byId.get(student.schoolStudentId) ?? []), student]);
	}
	const ambiguousIds = [...byId.entries()]
		.filter(([, rows]) => rows.length > 1)
		.map(([id]) => id)
		.sort();
	const ambiguous = new Set(ambiguousIds);

	const seenInFile = new Map<string, RosterStudent>();
	const duplicateIds: string[] = [];
	for (const student of students) {
		if (seenInFile.has(student.schoolStudentId)) {
			if (!duplicateIds.includes(student.schoolStudentId))
				duplicateIds.push(student.schoolStudentId);
			continue;
		}
		seenInFile.set(student.schoolStudentId, student);
	}

	const changes: PlannedStudentChange[] = [];
	const addedPerCohort = new Map<string, number>();
	const movedPerCohort = new Map<string, number>();
	const cohortIdFor = (key: string): string | undefined => cohortsByKey.get(key)?.id;

	for (const [id, student] of seenInFile) {
		// An ambiguous or duplicated ID is left out of the plan entirely: applying
		// either row would be a guess, so the report tells the admin to fix it.
		if (ambiguous.has(id) || duplicateIds.includes(id)) continue;

		const toCohortKey = cohortKeyOf(cohortOfGroup(student.group));
		const toCohortId = cohortIdFor(toCohortKey);
		const existing = (byId.get(id) ?? [])[0];

		if (!existing) {
			if (toCohortId !== undefined) {
				addedPerCohort.set(toCohortId, (addedPerCohort.get(toCohortId) ?? 0) + 1);
			}
			changes.push({ kind: 'new', schoolStudentId: id, cohortKey: toCohortKey, student });
			continue;
		}

		// A student already disabled is not re-disabled, and a reappearing transfer
		// is left disabled for an admin to restore deliberately: the file does not
		// say why they left, so it cannot say they came back.
		if (existing.status === 'disabled') continue;

		if (toCohortId !== undefined && toCohortId !== existing.cohortId) {
			changes.push({
				kind: 'levelChange',
				schoolStudentId: id,
				studentId: existing.id,
				fromCohortId: existing.cohortId,
				toCohortId,
				fromCohortKey: cohortKeyOf(cohortShapeOf(existing.cohortId, existingCohorts)),
				toCohortKey
			});
			movedPerCohort.set(toCohortId, (movedPerCohort.get(toCohortId) ?? 0) + 1);
		} else {
			changes.push({ kind: 'unchanged', schoolStudentId: id, studentId: existing.id });
		}

		// A name change is reported independently of a group change, so a student
		// who moved class and was renamed appears as two reviewable facts.
		const incoming = student.englishName;
		if (incoming !== undefined && incoming !== '' && incoming !== existing.englishName) {
			changes.push({
				kind: 'nameChange',
				schoolStudentId: id,
				studentId: existing.id,
				from: existing.englishName ?? '',
				to: incoming
			});
		}
		// A homeroom change is reported independently of a group change, on the same
		// terms as a name change: a student who moved Chinese class and moved ESL
		// level is two separate facts.
		//
		// Skipped when the stored row has no homeroom, which happens only on a
		// year-advance row: there is nothing on file to have changed from, and the
		// file simply fills it in.
		if (existing.chineseClass !== undefined && student.chineseClass !== existing.chineseClass) {
			changes.push({
				kind: 'classChange',
				schoolStudentId: id,
				studentId: existing.id,
				grade: cohortShapeOf(existing.cohortId, existingCohorts).grade,
				from: existing.chineseClass,
				to: student.chineseClass
			});
		}
	}

	// Anyone in this year's cohorts but absent from the file is disabled, unless
	// the ID was ambiguous or duplicated and therefore already reported.
	for (const [id, rows] of byId) {
		if (seenInFile.has(id) || ambiguous.has(id)) continue;
		for (const existing of rows) {
			if (existing.status === 'disabled') continue;
			changes.push({
				kind: 'disabled',
				schoolStudentId: id,
				studentId: existing.id,
				cohortId: existing.cohortId,
				reason: IMPORT_DISABLED_REASON
			});
		}
	}

	const totals = {
		new: 0,
		levelChange: 0,
		nameChange: 0,
		classChange: 0,
		disabled: 0,
		unchanged: 0
	};
	for (const change of changes) totals[change.kind] += 1;

	const grade = requested[0]?.grade;
	const cohorts: PlannedCohortSummary[] = existingCohorts
		.filter((cohort) => cohort.grade === grade)
		.map((cohort) => ({
			cohortId: cohort.id,
			cohortKey: cohortKeyOf(cohort),
			added: addedPerCohort.get(cohort.id) ?? 0,
			moved: movedPerCohort.get(cohort.id) ?? 0,
			total: existingStudents.filter((student) => student.cohortId === cohort.id).length
		}));

	return { changes, cohorts, missingCohorts, duplicateIds, ambiguousIds, totals };
}
