import { describe, it, expect } from 'vitest';
import {
	IMPORT_DISABLED_REASON,
	chineseClassCode,
	classifySheet,
	cohortOfGroup,
	deriveSchoolYear,
	detectColumns,
	deriveGradeForSchoolYear,
	gradesNamedInWorkbook,
	isGrade10StudentId,
	isReadableRosterSheet,
	normalizeSchoolStudentId,
	parseRosterGroup,
	parseRosterSheet,
	parseRosterWorkbook,
	planRosterImport,
	reversedPrefixForRocYear,
	rocEntryYearForSchoolYear,
	rosterGroupText,
	schoolYearFromGrade10Id,
	schoolYearFromRocEntry,
	type ExistingCohort,
	type ExistingStudent,
	type LevelledRosterGroup,
	type RosterStudent
} from './esl_import';

/** The G10 header order, measured from `G10 roster 0903026.xlsx`. */
const G10_HEADER = ['ESL group', 'Std ID#', 'Class', 'Name', 'English Name'];

/**
 * The levelled grades' order with the Chinese-class column the import now needs.
 *
 * The measured header is `Student ID | C Class | Seat No. | Chinese Name | English
 * Name | ESL Group | Email`; the seat and email columns are left out because no
 * rule reads them, and their absence is itself worth covering — a parser that
 * matched by position instead of by name would be caught here.
 */
const LEVELLED_CHINESE_HEADER = [
	'Student ID',
	'C Class',
	'Chinese Name',
	'English Name',
	'ESL Group'
];

/**
 * A `H101` sheet as the school writes it: 24 of section A, then 21 of section B.
 *
 * Every ID is `511xxx` — the reversed ROC year of 2026-2027, then three of
 * sequence — and both sections share it. A previous fixture gave section B a
 * `512` prefix, which was a fabrication the old two-digit reading could not
 * detect because it only ever read two digits; under the three-digit reversal it
 * resolves to ROC 215 and would report the class as holding two school years.
 * All 487 IDs in the real 2025-2026 G10 workbook are `411xxx` with no exception.
 */
function h101Rows(): string[][] {
	const rows: string[][] = [];
	for (let seat = 1; seat <= 24; seat++) {
		rows.push(['H101A', `511${String(100 + seat)}`, 'H101', `王${seat}`, `Remy ${seat}`]);
	}
	for (let seat = 1; seat <= 21; seat++) {
		rows.push(['H101B', `511${String(200 + seat)}`, 'H101', `李${seat}`, `Jeremy ${seat}`]);
	}
	return rows;
}

/**
 * The `Chinese Class` summary sheet: the whole grade, so no single base class has
 * a majority. Built across every base class the school runs, as the real sheet is —
 * a two-class "summary" would be indistinguishable from a class sheet with one
 * misfiled row, which is exactly the confusion the majority rule exists to avoid.
 */
function chineseClassRows(): string[][] {
	const rows: string[][] = [];
	for (let base = 1; base <= 11; base++) {
		const id = String(base).padStart(2, '0');
		for (const section of ['A', 'B']) {
			for (let seat = 1; seat <= 20; seat++) {
				rows.push([
					`H1${id}${section}`,
					`5${id}${section === 'A' ? '1' : '2'}${String(seat).padStart(2, '0')}`,
					`H1${id}`,
					`陳${base}${section}${seat}`,
					`Test ${base}${section}${seat}`
				]);
			}
		}
	}
	return rows;
}

describe('grade 10 sheets', () => {
	// The real `H101` sheet holds 24 of section A and 21 of section B, and the
	// `Chinese Class` sheet restates all 496 students across 22 sections.

	it('reads one base class holding both sections as a single class', () => {
		// The regression this whole change exists for: two groups in one sheet used
		// to fail the single-group test, so every G10 sheet was discarded as a
		// whole-grade summary and the import staged nothing at all.
		const sheet = classifySheet('H101', h101Rows(), G10_HEADER, 2, 10);

		expect(sheet.kind).toBe('class');
		if (sheet.kind !== 'class') throw new Error('expected a class sheet');
		expect(sheet.parsed.students).toHaveLength(45);
		expect(sheet.parsed.rejected).toEqual([]);
		// Two sections of one class, not a spelling difference to report.
		expect(sheet.reason).toBeUndefined();
	});

	it('still sets aside a summary sheet that spans many base classes', () => {
		const summary = classifySheet('Chinese Class', chineseClassRows(), G10_HEADER, 2, 10);

		expect(summary.kind).toBe('summary');
		if (summary.kind !== 'summary') throw new Error('expected a summary sheet');
		// Reported in the unit the classification used, so the admin is told what
		// actually differed.
		expect(summary.reason).toContain('No single class accounts for its rows');
	});

	/**
	 * The G9 column order, for the row-reading cases below.
	 *
	 * Carries the Chinese-class column the import now requires, appended at the
	 * end so the four measured columns keep their positions.
	 */
	const G9_HEADER = ['Student ID', 'Chinese Name', 'English Name', 'ESL Group', 'C Class'];

	it('reports an unreadable ID with the value found, so the cell can be fixed', () => {
		// The admin's job is to open one cell in Excel. A message that only said
		// "unreadable" would leave them guessing which of 495 rows, and which column.
		const parsed = parseRosterSheet(
			[
				['1150002.5', '王芃頵', 'Yoyo', 'G7 Advanced 1', 'J101'],
				['115-0003', '李大文', 'Jeremy', 'G7 Advanced 1', 'J101'],
				['', '陳小明', 'Ming', 'G7 Advanced 1', 'J101'],
				['1150004', '張美玲', 'Mei', 'G7 Advanced 1', 'J101']
			],
			detectColumns(G9_HEADER),
			2,
			7
		);

		expect(parsed.students).toHaveLength(1);
		// Every abnormality at once, each naming its own line and value.
		expect(parsed.rejected).toHaveLength(3);
		expect(parsed.rejected[0].rowNumber).toBe(2);
		expect(parsed.rejected[0].reason).toContain('"1150002.5"');
		expect(parsed.rejected[0].reason).toContain('not a whole student number');
		expect(parsed.rejected[1].rowNumber).toBe(3);
		expect(parsed.rejected[1].reason).toContain('"115-0003"');
		expect(parsed.rejected[2].rowNumber).toBe(4);
		expect(parsed.rejected[2].reason).toContain('empty');
	});

	it('reports an unreadable group with the value found, and what to write', () => {
		const parsed = parseRosterSheet(
			[
				['1130001', '王芃頵', 'Yoyo', 'G9 Wizard 1', 'J301'],
				['1130002', '李大文', 'Jeremy', '', 'J301'],
				['1130003', '陳小明', 'Ming', 'G9 Advanced 1', 'J301']
			],
			detectColumns(G9_HEADER),
			2,
			9
		);

		expect(parsed.students).toHaveLength(1);
		expect(parsed.rejected[0].reason).toContain('"G9 Wizard 1"');
		expect(parsed.rejected[0].reason).toContain('G9 Advanced 1');
		expect(parsed.rejected[1].reason).toContain('empty');
	});

	it('refuses a class sheet that holds one misfiled row, until the workbook agrees with itself', () => {
		// The measured case: `G7 Basic 5` holds a student whose `ESL Group` reads
		// `G7 Elementary 4`. This used to import, filing the row under the class its
		// column named and warning about it — but a wrong ability band is silent:
		// every count still adds up and the roster is quietly wrong. The department
		// confirmed these are typos they will fix, so the file is refused and the
		// message names the disagreeing group (ADR-0025).
		const rows: string[][] = [];
		for (let seat = 1; seat <= 18; seat++) {
			// Column order follows LEVELLED_CHINESE_HEADER: id, C Class, names, group.
			rows.push([`115${String(1000 + seat)}`, 'J101', '王', `Yoyo ${seat}`, 'G7 Basic 5']);
		}
		// The one student who moved down a level and had their column left behind.
		rows.push(['1159999', 'J101', '李', 'Moved', 'G7 Elementary 4']);

		const sheet = classifySheet('G7 Basic 5', rows, LEVELLED_CHINESE_HEADER, 2, 7);

		expect(sheet.kind).toBe('misfiled');
		if (sheet.kind !== 'misfiled') throw new Error('expected a misfiled sheet');
		// Named, so the admin knows which cell to open.
		expect(sheet.reason).toContain('G7 Elementary 4');
		// The rows are still parsed, so the caller can report what was in the file
		// — but they are never applied.
		expect(sheet.parsed.students).toHaveLength(19);
	});

	it('refuses a grade 10 sheet whose one row names another base class', () => {
		// 45 rows of one base class and a single row of another. Refused for the
		// same reason: the workbook disagrees with itself and there is no basis for
		// choosing which of the two columns is right.
		const straddling = classifySheet(
			'H101',
			[...h101Rows(), ['H102A', '511301', 'H102', '陳小明', 'Ming Chen']],
			G10_HEADER,
			2,
			10
		);

		expect(straddling.kind).toBe('misfiled');
		if (straddling.kind !== 'misfiled') throw new Error('expected a misfiled sheet');
		expect(straddling.reason).toContain('H102A');
		expect(straddling.parsed.students).toHaveLength(46);
	});

	it('reads a grade 10 file end to end, with one cohort per base class', () => {
		const parsed = parseRosterWorkbook(10, [
			{ name: 'H101', headerRow: G10_HEADER, rows: h101Rows(), rowOffset: 2 },
			{ name: 'Chinese Class', headerRow: G10_HEADER, rows: chineseClassRows(), rowOffset: 2 }
		]);

		expect(parsed.classes).toHaveLength(1);
		expect(parsed.students).toHaveLength(45);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['Chinese Class']);
		// Grade 10's IDs name the school year itself, reversed, so the year is
		// derived from them like any other grade's.
		expect(parsed.derivedYear).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 115
		});
	});

	it('gives each level of a base class its own cohort', () => {
		const a = cohortOfGroup({ grade: 10, baseClass: '01', section: 'A' });
		const b = cohortOfGroup({ grade: 10, baseClass: '01', section: 'B' });
		const other = cohortOfGroup({ grade: 10, baseClass: '02', section: 'A' });

		// Two cohorts, because A and B are ability levels holding different students
		// (ADR-0023). They shared one cohort when A and B were called sections, which
		// merged the two bands the sorting test exists to separate — and the student
		// counts still added up, so nothing downstream could see it.
		expect(a).toEqual({ grade: 10, level: 'A', classNumber: '01' });
		expect(b).toEqual({ grade: 10, level: 'B', classNumber: '01' });
		expect(a).not.toEqual(b);

		// The Chinese class is still part of the identity, so a different base class
		// is a different cohort again.
		expect(other).toEqual({ grade: 10, level: 'A', classNumber: '02' });
		expect(cohortOfGroup({ grade: 10, baseClass: '01' }).level).toBeUndefined();
	});

	it('rebuilds the workbook section text, so the server re-reads what it parsed', () => {
		expect(rosterGroupText({ grade: 10, baseClass: '01', section: 'A' })).toBe('H101A');
		expect(rosterGroupText({ grade: 10, baseClass: '11', section: 'B' })).toBe('H111B');
	});

	it('round-trips every section through the text the server re-parses', () => {
		// The text is what crosses the wire and what the server re-parses, so the
		// property that matters is that the text is stable: parse → render → parse
		// lands on the same group the renderer started from.
		//
		// Note the padding: `parseRosterGroup` normalises `H101A` to the unpadded
		// `1`, and `rosterGroupText` pads back to `01` for the `H101A` spelling.
		// Both are the same cohort — `cohortOfGroup` pads before it becomes a key,
		// and `esl/cohorts.create` stores it padded — so the round trip is stable
		// from the second pass on, which is what the assertion below checks.
		for (const text of ['H101A', 'H101B', 'H109A', 'H110B', 'H111A', 'H111B']) {
			const first = parseRosterGroup(text);
			if (first === null) throw new Error(`expected ${text} to parse`);

			const rendered = rosterGroupText(first);
			const second = parseRosterGroup(rendered);
			if (second === null) throw new Error(`expected ${rendered} to parse`);

			expect(second).toEqual(first);
			// And the rendered text is the school's own spelling.
			expect(rendered).toBe(text);
		}
	});

	it('ignores the blank rows a sheet runs on to, without shifting the lines above', () => {
		// Every sheet in the school's workbooks is padded to 1000 rows. Reading
		// those as unreadable rows reported 10,485 of them for the G10 file and
		// buried the one misfiled row the report exists to surface.
		const padded = [
			['H101A', '511101', 'H101', '林承叡', 'Remy Lin'],
			['', 'misfiled, no ID', '', '', ''],
			...Array.from({ length: 20 }, () => ['', '', '', '', ''])
		];

		const parsed = parseRosterSheet(padded, detectColumns(G10_HEADER), 2, 10);

		expect(parsed.students).toHaveLength(1);
		// The blank padding is silent; the row with content but no ID is not.
		expect(parsed.rejected).toHaveLength(1);
		expect(parsed.rejected[0].rowNumber).toBe(3);
		expect(parsed.rejected[0].reason).toContain('student ID');
	});

	it('refuses a levelled group in a grade 10 file, and a section in a levelled one', () => {
		const levelledInG10 = parseRosterSheet(
			[['G9 Advanced 1', '1130001', 'G9', '王芃頵', 'Yoyo Lin']],
			detectColumns(G10_HEADER),
			2,
			10
		);
		expect(levelledInG10.students).toEqual([]);
		expect(levelledInG10.rejected[0].reason).toContain('taught by sections');

		// The other direction, unchanged: a `H101A` row in a G9 file is a misfiled
		// row, not a student to file under a guessed class.
		const sectionInG9 = parseRosterSheet(
			[['H101A', '1130001', 'H101', '王芃頵', 'Yoyo Lin']],
			detectColumns(G10_HEADER),
			2,
			9
		);
		expect(sectionInG9.students).toEqual([]);
		expect(sectionInG9.rejected[0].reason).toContain('Grade 10 group');
	});
});

describe('normalizeSchoolStudentId', () => {
	it('accepts a plain digit ID unchanged', () => {
		expect(normalizeSchoolStudentId('1150002')).toBe('1150002');
		expect(normalizeSchoolStudentId('  1130537 ')).toBe('1130537');
	});

	it('resolves an ID Excel stored as a float', () => {
		// Measured: G10 holds `511024.0` and 40 G9 rows hold `1130501.0`.
		// Left alone these are different strings from the same student.
		expect(normalizeSchoolStudentId('511024.0')).toBe('511024');
		expect(normalizeSchoolStudentId('1130501.0')).toBe('1130501');
	});

	it('rejects a non-integral number rather than truncating it', () => {
		// Truncating `511024.50` would merge two distinct students.
		expect(normalizeSchoolStudentId('511024.50')).toBeNull();
	});

	it('rejects an ID that is not a usable student number', () => {
		expect(normalizeSchoolStudentId('')).toBeNull();
		expect(normalizeSchoolStudentId('abc')).toBeNull();
		expect(normalizeSchoolStudentId('12345')).toBeNull();
	});
});

describe('parseRosterGroup', () => {
	it('reads a levelled group with its level and class number', () => {
		expect(parseRosterGroup('G9 Advanced 1')).toEqual({
			grade: 9,
			level: 'Advanced',
			classNumber: '1'
		});
		expect(parseRosterGroup('G8 Intermediate 7')).toEqual({
			grade: 8,
			level: 'Intermediate',
			classNumber: '7'
		});
	});

	it('reads a grade 10 base class and its section', () => {
		expect(parseRosterGroup('H101A')).toEqual({ grade: 10, baseClass: '1', section: 'A' });
		expect(parseRosterGroup('H110B')).toEqual({ grade: 10, baseClass: '10', section: 'B' });
		expect(parseRosterGroup('H101')).toEqual({ grade: 10, baseClass: '1' });
	});

	it('tolerates a group missing the space before its number', () => {
		// Measured: the G9 workbook contains one row reading `G9 Elementary1`.
		expect(parseRosterGroup('G9 Elementary1')).toEqual({
			grade: 9,
			level: 'Elementary',
			classNumber: '1'
		});
	});

	it('treats a bare pre-elementary group as its single class', () => {
		// Measured: G7 carries a bare `Pre-Ele` with no class number.
		expect(parseRosterGroup('Pre-Ele')).toEqual({
			grade: 7,
			level: 'Pre-Elementary',
			classNumber: '1'
		});
	});

	it('reads two numbered pre-elementary classes if a year runs them', () => {
		expect(parseRosterGroup('G7 Pre-Ele 2')).toEqual({
			grade: 7,
			level: 'Pre-Elementary',
			classNumber: '2'
		});
	});

	it('returns null rather than guessing an unrecognised group', () => {
		expect(parseRosterGroup('Gifted 1')).toBeNull();
		expect(parseRosterGroup('')).toBeNull();
	});
});

describe('school year derivation', () => {
	it('maps a ROC entry year onto the school year it started', () => {
		expect(schoolYearFromRocEntry(115)).toBe('2026-2027');
		expect(rocEntryYearForSchoolYear('2026-2027')).toBe(115);
	});

	it('derives the year a grade file belongs to from its ID range', () => {
		// The measured ranges: G7 115xxx, G8 114xxx, G9 113xxx.
		expect(deriveSchoolYear(7, ['1150002', '1150329'])).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 115
		});
		expect(deriveSchoolYear(8, ['1140001', '1140413'])).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 114
		});
		expect(deriveSchoolYear(9, ['1130002', '1130501'])).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 113
		});
	});

	it("reports next year's file as next year's year", () => {
		// Next year this year's G7 (115xxx) becomes G8, keeping the same IDs.
		expect(deriveSchoolYear(8, ['1150002'])).toEqual({
			kind: 'current',
			year: '2027-2028',
			entryYear: 115
		});
	});

	it('refuses a file that has two years merged into it', () => {
		// Importing this would scatter students across cohorts irrecoverably.
		expect(deriveSchoolYear(8, ['1140001', '1150002'])).toEqual({
			kind: 'conflict',
			years: ['2026-2027', '2027-2028']
		});
	});

	it('derives grade 10’s year from its own IDs', () => {
		// Grade 10 names the school year itself, reversed, so there is no intake
		// offset to apply. Previously this returned `unsupported` on the claim that
		// grade 10 IDs identify no year at all, which sent a real 2025-2026 file to
		// 2116-2117; see the "reversed ROC year" block for that reading.
		expect(deriveSchoolYear(10, ['511024', '511355'])).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 115
		});
	});

	it('reports indeterminate when no ID carries a usable prefix', () => {
		expect(deriveSchoolYear(7, []).kind).toBe('indeterminate');
	});
});

describe('grade derivation from a confirmed year', () => {
	it('places each levelled grade from its own IDs, the inverse of the year', () => {
		// The admin confirms 2026-2027; the grade follows from the intake prefixes.
		// This is the pair that was wrong in the field: a grade 7 workbook was read as
		// grade 9, so its 2026-27 IDs came out naming 2028-2029.
		expect(deriveGradeForSchoolYear('2026-2027', ['1150001', '1150399'])).toEqual({
			kind: 'grade',
			grade: 7
		});
		expect(deriveGradeForSchoolYear('2026-2027', ['1140001'])).toEqual({ kind: 'grade', grade: 8 });
		expect(deriveGradeForSchoolYear('2026-2027', ['1130001'])).toEqual({ kind: 'grade', grade: 9 });
	});

	it('places a file against whichever year the admin confirmed', () => {
		// The same ID, a different year, a different grade — which is why the year is
		// the thing to get right, and why the grade cannot be read off the file alone.
		// A `114xxxx` student is this year's grade 8, last year's grade 7, and next
		// year's grade 9, all from the same six digits.
		const gradeIn = (year: string) => {
			const placed = deriveGradeForSchoolYear(year, ['1140001']);
			return placed.kind === 'grade' ? placed.grade : null;
		};
		expect(gradeIn('2026-2027')).toBe(8);
		expect(gradeIn('2025-2026')).toBe(7);
		expect(gradeIn('2027-2028')).toBe(9);
	});

	it('places a grade 10 file from its own ID length, with nothing asked', () => {
		// Grade 10 is numbered `511xxx` in 2026-2027, six digits where no levelled
		// grade is numbered that way. So the ID says which grade it is, which is what
		// lets the page stop asking for one.
		expect(deriveGradeForSchoolYear('2026-2027', ['511001', '511002'])).toEqual({
			kind: 'grade',
			grade: 10
		});
	});

	it('tells a grade 10 ID from a levelled one that looks similar', () => {
		// Both begin `115` or `511` in the same positions, so reading the leading
		// digits would confuse them; only the length separates the schemes.
		// `511024` is grade 10 in 2026-2027 and `1150024` is grade 7 entered in ROC
		// 115. Getting it wrong would file a whole G10 roster as a levelled grade.
		expect(deriveGradeForSchoolYear('2026-2027', ['511024', '511355'])).toEqual({
			kind: 'grade',
			grade: 10
		});
		expect(deriveGradeForSchoolYear('2026-2027', ['1150024'])).toEqual({
			kind: 'grade',
			grade: 7
		});
	});

	it('places a grade 10 file whatever year the page is set to', () => {
		// The length says the grade; the year above says the year. Neither is derived
		// from the other, so a file that is plainly grade 10 stays grade 10 instead of
		// being told it is some levelled grade.
		for (const year of ['2025-2026', '2026-2027', '2027-2028']) {
			expect(deriveGradeForSchoolYear(year, ['511001'])).toEqual({
				kind: 'grade',
				grade: 10
			});
		}
	});

	it('does not read a grade 10 file as holding two years', () => {
		// A regression with a real failure behind it. `511101` and `512101` have
		// three leading digits like any other ID, so counting prefixes without
		// checking they place a student in a levelled grade reported this file as
		// holding two absurd school years, and the admin was asked to split a
		// perfectly good grade 10 file in two.
		expect(deriveGradeForSchoolYear('2026-2027', ['511101', '512101'])).toEqual({
			kind: 'grade',
			grade: 10
		});
	});

	it('reports a file holding both schemes as unplaceable, not as one grade', () => {
		// There is no single grade here, and picking either would file half the
		// students under the other's grade.
		expect(deriveGradeForSchoolYear('2026-2027', ['1150001', '510001'])).toEqual({
			kind: 'twoYears',
			years: []
		});
	});

	it('still refuses IDs on no scheme it can read', () => {
		// Two digits, a five-digit number and a seven-digit one: none is the six-digit
		// shape either scheme uses.
		expect(deriveGradeForSchoolYear('2026-2027', ['12', '12345', '1234567'])).toEqual({
			kind: 'unknown'
		});
	});

	it('reports a file spanning two intake years rather than guessing a grade', () => {
		// The merged-year case. Picking the more common prefix would import most of
		// the file under the wrong year and say nothing about the rest.
		expect(deriveGradeForSchoolYear('2026-2027', ['1150001', '1150399', '1140001'])).toEqual({
			kind: 'twoYears',
			years: ['2025-2026', '2026-2027']
		});
	});

	it('is unknown rather than throwing on a year that is not one', () => {
		expect(deriveGradeForSchoolYear('not-a-year', ['1150001'])).toEqual({ kind: 'unknown' });
		expect(deriveGradeForSchoolYear('2026-2027', [])).toEqual({ kind: 'unknown' });
	});
});

describe("grade 10's reversed ROC year", () => {
	// Grade 10's IDs are six digits: the ROC year of the school year itself,
	// digit-reversed, then three of sequence. `411019` is `114` — ROC 114, which is
	// 2025-2026. There is no anchor to be wrong about and no wrap to run off the
	// end, because the reversal is a bijection with ROC years.

	it('reads the school year off a grade 10 ID', () => {
		expect(schoolYearFromGrade10Id('411019')).toBe('2025-2026');
		expect(schoolYearFromGrade10Id('511024')).toBe('2026-2027');
		expect(schoolYearFromGrade10Id('611001')).toBe('2027-2028');
	});

	it('reads the years the school has actually used', () => {
		// The four years of grade 10 files the school has produced, in the order
		// they were given: `211` (ROC 112), `311`, `411`, `511`.
		expect(schoolYearFromGrade10Id('211001')).toBe('2023-2024');
		expect(schoolYearFromGrade10Id('311001')).toBe('2024-2025');
		expect(schoolYearFromGrade10Id('411001')).toBe('2025-2026');
		expect(schoolYearFromGrade10Id('511001')).toBe('2026-2027');
	});

	it('reads the 2025-2026 workbook the reported bug came from', () => {
		// The bug this guards: `411xxx` was read as a two-digit `41` "space" below a
		// `51` anchor, which the wrap turned into +90 years, so a real 2025-2026
		// file was reported as belonging to 2116-2117. `41` is not a space; it is
		// ROC 114 backwards.
		expect(schoolYearFromGrade10Id('411001')).toBe('2025-2026');
		expect(deriveSchoolYear(10, ['411001', '411549'])).toEqual({
			kind: 'current',
			year: '2025-2026',
			entryYear: 114
		});
	});

	it('keeps reading years past the point a single leading digit would run out', () => {
		// One digit would stop at ROC 119 (2030-2031). The reversal needs no special
		// case: `021` is simply ROC 120 backwards, so 2031-2032 falls out of the same
		// rule rather than a case written for it.
		expect(schoolYearFromGrade10Id('911001')).toBe('2030-2031');
		expect(schoolYearFromGrade10Id('021001')).toBe('2031-2032');
		expect(schoolYearFromGrade10Id('121001')).toBe('2032-2033');
	});

	it('writes a ROC year back out as the prefix the school uses', () => {
		expect(reversedPrefixForRocYear(114)).toBe('411');
		expect(reversedPrefixForRocYear(115)).toBe('511');
		expect(reversedPrefixForRocYear(120)).toBe('021');
	});

	it('refuses a ROC year that is not three digits', () => {
		expect(reversedPrefixForRocYear(99)).toBeNull();
		expect(reversedPrefixForRocYear(1000)).toBeNull();
		expect(reversedPrefixForRocYear(114.5)).toBeNull();
	});

	it('refuses a reversed 000, which is not a year', () => {
		// `000001` is six digits and so reads as grade 10, but reversed it is ROC 0,
		// which is not a year. Reading it as 1911 would put a junk ID in 1911-1912.
		expect(isGrade10StudentId('000001')).toBe(true);
		expect(schoolYearFromGrade10Id('000001')).toBeNull();
	});

	it('reports a file holding two school years as a conflict', () => {
		// The shape the fixed `h101Rows` fixture used to have: section A on `511`
		// and section B on `512`. Under the two-digit reading both were space `51`
		// and this was invisible; reversed, `512` is ROC 215, so a class that is
		// really one cohort reads as two years and the import would split it.
		expect(deriveSchoolYear(10, ['511101', '512101'])).toEqual({
			kind: 'conflict',
			years: ['2026-2027', '2126-2127']
		});
	});

	it('is indeterminate for a file with no usable grade 10 IDs', () => {
		expect(deriveSchoolYear(10, ['1150001'])).toEqual({ kind: 'indeterminate' });
		expect(deriveSchoolYear(10, [])).toEqual({ kind: 'indeterminate' });
	});

	it('tells grade 10 from a levelled grade by length, not by leading digits', () => {
		// Length is the discriminator, because the leading digits cannot be. A
		// reversed grade 10 prefix beginning `1` looks exactly like a levelled ROC
		// entry year, and the old reading relied on that never happening.
		expect(isGrade10StudentId('110019')).toBe(true);
		expect(isGrade10StudentId('1100019')).toBe(false);
		expect(deriveGradeForSchoolYear('2021-2022', ['110019', '110020'])).toEqual({
			kind: 'grade',
			grade: 10
		});
		expect(deriveGradeForSchoolYear('2026-2027', ['1150001'])).toEqual({
			kind: 'grade',
			grade: 7
		});
	});
});

describe('gradesNamedInWorkbook', () => {
	it('reads the grade off the group column, which names it outright', () => {
		// Not a second opinion on which grade the file is — the IDs settle that on
		// their own. This is the file's account of itself, which is how the page
		// notices that the year it was given is not the year the file is for.
		const parsed = parseRosterWorkbook(7, [
			{
				name: 'G7 Basic 1',
				headerRow: LEVELLED_CHINESE_HEADER,
				rows: [['1150001', 'J101', '陳明', 'Ming Chen', 'G7 Basic 1']]
			}
		]);
		expect(gradesNamedInWorkbook(parsed)).toEqual([7]);
	});

	it('is empty for a workbook with no readable rows', () => {
		const parsed = parseRosterWorkbook(7, []);
		expect(gradesNamedInWorkbook(parsed)).toEqual([]);
	});
});

describe('detectColumns', () => {
	it('reads the G7 column order', () => {
		const columns = detectColumns([
			'Student ID',
			'C Class',
			'Seat No.',
			'Chinese Name',
			'English Name',
			'ESL Group',
			'Email'
		]);
		expect(columns).toEqual({
			schoolStudentId: 0,
			chineseName: 3,
			englishName: 4,
			group: 5,
			chineseClass: 1
		});
	});

	it('reads the G10 column order, which differs and leads with the group', () => {
		const columns = detectColumns(['ESL group', 'Std ID#', 'Class', 'Name', 'English Name']);
		expect(columns).toEqual({
			schoolStudentId: 1,
			chineseName: 3,
			englishName: 4,
			group: 0,
			// G10 heads the same column `Class` that the levelled grades call `C Class`.
			chineseClass: 2
		});
	});
});

describe('parseRosterSheet', () => {
	const g7Columns = detectColumns([
		'Student ID',
		'C Class',
		'Seat No.',
		'Chinese Name',
		'English Name',
		'ESL Group',
		'Email'
	]);

	it('reads a row, normalising a float ID', () => {
		const parsed = parseRosterSheet(
			[['1130501.0', 'J304', '42.0', '石芠瑈', 'Blare Shi', 'G9 Elementary 1']],
			g7Columns,
			2,
			9
		);
		expect(parsed.students).toEqual([
			{
				schoolStudentId: '1130501',
				chineseName: '石芠瑈',
				englishName: 'Blare Shi',
				// Stored as the number only; the `J3` marker is the grade's.
				chineseClass: '04',
				group: { grade: 9, level: 'Elementary', classNumber: '1' }
			}
		]);
		expect(parsed.rejected).toEqual([]);
	});

	it('accepts a blank English name, which G7 may arrive with', () => {
		const parsed = parseRosterSheet(
			[['1150002', 'J101', '1', '王芃頵', '', 'G7 Basic 1']],
			g7Columns
		);
		expect(parsed.students[0].englishName).toBeUndefined();
		expect(parsed.rejected).toEqual([]);
	});

	it('reports an unreadable row against its line in the sheet', () => {
		const parsed = parseRosterSheet(
			[
				['1150002', 'J101', '1', '王芃頵', 'Jenny Wang', 'G7 Basic 1'],
				['', 'J101', '2', '無名', '', 'G7 Basic 1']
			],
			g7Columns
		);
		expect(parsed.students).toHaveLength(1);
		expect(parsed.rejected[0].rowNumber).toBe(3);
		expect(parsed.rejected[0].reason).toMatch(/student ID/i);
	});

	it('rejects a row whose group it cannot read, without guessing', () => {
		const parsed = parseRosterSheet(
			[['1150002', 'J101', '1', '王芃頵', 'Jenny', 'Gifted 1']],
			g7Columns
		);
		expect(parsed.students).toEqual([]);
		expect(parsed.rejected[0].reason).toMatch(/is not a class the department runs/);
	});
});

describe('classifySheet', () => {
	const header = ['Student ID', 'C Class', 'Seat No.', 'Chinese Name', 'English Name', 'ESL Group'];

	it('treats a self-consistent sheet as one class', () => {
		const classified = classifySheet(
			'G9 Adv 1',
			[
				['1130053', 'J301', '6', '林亭佑', 'Yoyo Lin', 'G9 Advanced 1'],
				['1130054', 'J301', '7', '林炫晴', 'Elsa Lin', 'G9 Advanced 1']
			],
			header,
			2,
			9
		);
		expect(classified.kind).toBe('class');
	});

	it('treats a sheet naming many groups as a summary, not a class', () => {
		// A summary sheet restates the whole grade, so no single class has a
		// majority of its rows; importing it as a class would double-enrol every
		// student. Two groups with one row each would not be a summary — it would
		// be a class sheet with one misfiled row, which is a different thing.
		const rows: string[][] = [];
		const groups = ['G9 Advanced 1', 'G9 Elementary 1', 'G9 Basic 1', 'G9 Intermediate 1'];
		groups.forEach((group, groupIndex) => {
			for (let seat = 0; seat < 5; seat++) {
				rows.push([
					`113${String(groupIndex * 10 + seat).padStart(4, '0')}`,
					// A summary sheet restates every class in the grade, so its
					// homerooms are spread across all of them.
					`J3${String(groupIndex + 1).padStart(2, '0')}`,
					'',
					`林${groupIndex}${seat}`,
					`Name ${groupIndex}${seat}`,
					group
				]);
			}
		});

		const classified = classifySheet('G9 Chinese', rows, header, 2, 9);

		expect(classified.kind).toBe('summary');
		if (classified.kind !== 'summary') throw new Error('expected a summary sheet');
		// And the reason says what actually differed, rather than counting groups.
		expect(classified.reason).toContain('No single class accounts for its rows');
	});

	it('reports a sheet with no student ID or group column as unreadable', () => {
		expect(classifySheet('Notes', [['a', 'b']], ['Foo', 'Bar']).kind).toBe('unreadable');
	});
});

describe('parseRosterWorkbook', () => {
	const g9Header = [
		'Student ID',
		'C Class',
		'Seat No.',
		'Chinese Name',
		'English Name',
		'ESL Group'
	];

	it('keeps class sheets, skips summaries, and derives the year', () => {
		const workbook = parseRosterWorkbook(9, [
			{
				name: 'G9 Adv 1',
				headerRow: g9Header,
				rows: [['1130053', 'J301', '6', '林亭佑', 'Yoyo Lin', 'G9 Advanced 1']]
			},
			{
				name: 'G9 Ele 1',
				headerRow: g9Header,
				rows: [
					['1130090', 'J301', '9', '張恩寧', 'Annie Chang', 'G9 Elementary 1'],
					// The one misfiled row the real G9 workbook contains.
					['1130537', 'J304', '42', '石芠瑈', 'Blare Shi', 'G9 Elementary1']
				]
			},
			{
				name: 'G9 Chinese',
				headerRow: g9Header,
				// A real summary restates the whole grade, so no class has a majority
				// of its rows. Two rows, one per class, would look exactly like a
				// class sheet with a misfiled row — which is the confusion the
				// majority rule exists to tell apart.
				rows: ['G9 Advanced 1', 'G9 Elementary 1', 'G9 Basic 1', 'G9 Intermediate 1'].flatMap(
					(group, groupIndex) =>
						[0, 1, 2].map((seat) => [
							`113${String(groupIndex * 10 + seat).padStart(4, '0')}`,
							'',
							'',
							`林${groupIndex}${seat}`,
							`Name ${groupIndex}${seat}`,
							group
						])
				)
			}
		]);

		expect(workbook.classes.map((sheet) => sheet.sheetName)).toEqual(['G9 Adv 1', 'G9 Ele 1']);
		expect(workbook.skipped.map((sheet) => sheet.sheetName)).toEqual(['G9 Chinese']);
		expect(workbook.students).toHaveLength(3);
		expect(workbook.rejected).toEqual([]);
		expect(workbook.derivedYear).toEqual({ kind: 'current', year: '2026-2027', entryYear: 113 });
	});
});

describe('planRosterImport', () => {
	const COHORTS: ExistingCohort[] = [
		{ id: 'c_adv1', grade: 9, level: 'Advanced', classNumber: '1' },
		{ id: 'c_adv2', grade: 9, level: 'Advanced', classNumber: '2' },
		{ id: 'c_ele1', grade: 9, level: 'Elementary', classNumber: '1' }
	];

	function student(
		schoolStudentId: string,
		group: LevelledRosterGroup,
		englishName?: string,
		chineseClass = '01'
	): RosterStudent {
		return {
			schoolStudentId,
			chineseName: '王芃頵',
			...(englishName ? { englishName } : {}),
			chineseClass,
			group
		};
	}

	const ADV1 = { grade: 9, level: 'Advanced', classNumber: '1' } as const;
	const ADV2 = { grade: 9, level: 'Advanced', classNumber: '2' } as const;

	function existing(over: Partial<ExistingStudent> & { id: string }): ExistingStudent {
		return {
			cohortId: 'c_adv1',
			schoolStudentId: '1130001',
			chineseName: '王芃頵',
			englishName: 'Yoyo Lin',
			chineseClass: '01',
			status: 'active',
			...over
		};
	}

	it('plans a brand-new student as new, and reports a cohort that must be created', () => {
		const plan = planRosterImport(
			[{ grade: 9, level: 'Advanced', classNumber: '9' }],
			[student('1139999', { ...ADV1, classNumber: '9' })],
			COHORTS,
			[]
		);

		expect(plan.totals.new).toBe(1);
		expect(plan.missingCohorts).toEqual([{ grade: 9, level: 'Advanced', classNumber: '9' }]);
	});

	it('leaves a student who matches on every field alone', () => {
		const plan = planRosterImport([ADV1], [student('1130001', ADV1, 'Yoyo Lin')], COHORTS, [
			existing({ id: 's1' })
		]);

		expect(plan.totals).toEqual({
			new: 0,
			levelChange: 0,
			nameChange: 0,
			classChange: 0,
			disabled: 0,
			unchanged: 1
		});
	});

	it('moves a student the file places in another class, reporting both sides', () => {
		const plan = planRosterImport([ADV1, ADV2], [student('1130001', ADV2, 'Yoyo Lin')], COHORTS, [
			existing({ id: 's1' })
		]);

		const move = plan.changes.find((change) => change.kind === 'levelChange');
		expect(move).toMatchObject({
			fromCohortId: 'c_adv1',
			toCohortId: 'c_adv2',
			fromCohortKey: '9:Advanced:1',
			toCohortKey: '9:Advanced:2'
		});
	});

	it('reports an English name change as its own reviewable fact', () => {
		// A student may ask mid-year for a name change, and it may reach the
		// system through the workbook — or be a typo. Either way the admin decides.
		const plan = planRosterImport([ADV1], [student('1130001', ADV1, 'Blair Lin')], COHORTS, [
			existing({ id: 's1' })
		]);

		expect(plan.totals.nameChange).toBe(1);
		expect(plan.changes.find((change) => change.kind === 'nameChange')).toMatchObject({
			from: 'Yoyo Lin',
			to: 'Blair Lin'
		});
	});

	it('reports a Chinese class change as its own fact, needing no approval', () => {
		// A student transferred homeroom mid-year. Unlike a name change this is not
		// a question of intent — the department's file is simply newer than our
		// record — so it is applied, but it is still reported so the transfer is
		// never invisible in the import summary.
		const plan = planRosterImport([ADV1], [student('1130001', ADV1, 'Yoyo Lin', '02')], COHORTS, [
			existing({ id: 's1' })
		]);

		expect(plan.totals.classChange).toBe(1);
		expect(plan.changes.find((change) => change.kind === 'classChange')).toMatchObject({
			from: '01',
			to: '02',
			// The grade is carried on the change so the report can say `J301 → J302`
			// without the caller having to resolve the cohort.
			grade: 9
		});
		// Not folded into the other categories: the student is neither moved nor renamed.
		expect(plan.totals.levelChange).toBe(0);
		expect(plan.totals.nameChange).toBe(0);
	});

	it('fills in the homeroom of an advanced student without reporting a change', () => {
		// A row `advanceGrade` created carries no homeroom, because next year's is
		// not knowable in June. There is nothing on file to have changed from, so the
		// September import must record the value rather than report a diff against
		// an absence.
		const plan = planRosterImport([ADV1], [student('1130001', ADV1, 'Yoyo Lin', '04')], COHORTS, [
			{ ...existing({ id: 's1' }), chineseClass: undefined }
		]);

		expect(plan.totals.classChange).toBe(0);
		expect(plan.totals.unchanged).toBe(1);
	});

	it('reports a level move and a homeroom change separately', () => {
		const plan = planRosterImport(
			[ADV1, ADV2],
			[student('1130001', ADV2, 'Yoyo Lin', '07')],
			COHORTS,
			[existing({ id: 's1' })]
		);

		expect(plan.totals.levelChange).toBe(1);
		expect(plan.totals.classChange).toBe(1);
	});

	it('never lets a blank name in the file erase a stored one', () => {
		// G7 arrives before teachers fill names in; re-importing must not wipe a
		// name an admin typed.
		const plan = planRosterImport([ADV1], [student('1130001', ADV1)], COHORTS, [
			existing({ id: 's1' })
		]);

		expect(plan.totals.nameChange).toBe(0);
		expect(plan.totals.unchanged).toBe(1);
	});

	it('reports a move and a rename separately when both happen', () => {
		const plan = planRosterImport([ADV1, ADV2], [student('1130001', ADV2, 'Blair Lin')], COHORTS, [
			existing({ id: 's1' })
		]);

		expect(plan.totals.levelChange).toBe(1);
		expect(plan.totals.nameChange).toBe(1);
	});

	it('disables a student absent from the file, with a reason and no deletion', () => {
		const plan = planRosterImport([ADV1], [], COHORTS, [existing({ id: 's1' })]);

		expect(plan.totals.disabled).toBe(1);
		expect(plan.changes.find((change) => change.kind === 'disabled')).toMatchObject({
			studentId: 's1',
			reason: IMPORT_DISABLED_REASON
		});
	});

	it('does not re-disable a student who was already disabled', () => {
		const plan = planRosterImport([ADV1], [], COHORTS, [
			existing({ id: 's1', status: 'disabled' })
		]);

		expect(plan.totals.disabled).toBe(0);
	});

	it('leaves a reappearing transfer disabled rather than silently restoring them', () => {
		// The rare transfer-out-and-back case: the file does not say why they left,
		// so it cannot say they returned. Restoring is an admin's decision.
		const plan = planRosterImport([ADV1], [student('1130001', ADV1, 'Yoyo Lin')], COHORTS, [
			existing({ id: 's1', status: 'disabled' })
		]);

		expect(plan.totals).toEqual({
			new: 0,
			levelChange: 0,
			nameChange: 0,
			classChange: 0,
			disabled: 0,
			unchanged: 0
		});
	});

	it('reports a duplicated ID and plans nothing for it, rather than guessing', () => {
		const plan = planRosterImport(
			[ADV1, ADV2],
			[student('1130001', ADV1, 'Yoyo Lin'), student('1130001', ADV2, 'Yoyo Lin')],
			COHORTS,
			[]
		);

		expect(plan.duplicateIds).toEqual(['1130001']);
		expect(plan.totals.new).toBe(0);
	});

	it('reports an ambiguous existing ID and plans nothing for it', () => {
		// Two rows for one ID in the target year means matching cannot be trusted.
		const plan = planRosterImport([ADV1], [student('1130001', ADV1, 'Yoyo Lin')], COHORTS, [
			existing({ id: 's1' }),
			existing({ id: 's2', cohortId: 'c_adv2' })
		]);

		expect(plan.ambiguousIds).toEqual(['1130001']);
		expect(plan.totals.unchanged).toBe(0);
		expect(plan.totals.disabled).toBe(0);
	});

	it('summarises the grade by cohort, with added and moved counts', () => {
		const plan = planRosterImport(
			[ADV1, ADV2],
			[student('1130001', ADV2, 'Yoyo Lin'), student('1130002', ADV1, 'New One')],
			COHORTS,
			[existing({ id: 's1' })]
		);

		expect(plan.cohorts).toEqual([
			{ cohortId: 'c_adv1', cohortKey: '9:Advanced:1', added: 1, moved: 0, total: 1 },
			{ cohortId: 'c_adv2', cohortKey: '9:Advanced:2', added: 0, moved: 1, total: 0 },
			{ cohortId: 'c_ele1', cohortKey: '9:Elementary:1', added: 0, moved: 0, total: 0 }
		]);
	});

	describe('the Chinese homeroom column', () => {
		// The acceptance table from ADR-0025, one case per row. Only the school's own
		// full form is accepted, because a bare number cannot be told from a truncated
		// one and a misfiled homeroom is the one error nothing downstream would catch.
		const HEADER = ['Student ID', 'Chinese Name', 'English Name', 'ESL Group', 'C Class'];

		function readRow(classCell: string, grade: 7 | 8 | 9 | 10) {
			const prefix = grade === 10 ? '51' : '115';
			const row = [
				`${prefix}0001`,
				'王芃頵',
				'Yoyo Lin',
				// The group names the same grade the row is read as, so the helper
				// tests the cell rather than a mismatch between the two.
				grade === 10 ? 'H101A' : `G${grade} Basic 1`,
				classCell
			];
			return parseRosterSheet([row], detectColumns(HEADER), 2, grade);
		}

		it('stores only the class number, rebuilding the grade marker on demand', () => {
			const parsed = readRow('J101', 7);

			expect(parsed.rejected).toEqual([]);
			// `J1` is derivable from the grade, so only `01` is kept.
			expect(parsed.students[0].chineseClass).toBe('01');
			expect(chineseClassCode(7, parsed.students[0].chineseClass)).toBe('J101');
		});

		it('reads each grade in its own marker', () => {
			// The marker is the grade, so the same class number renders differently per
			// grade: J101 / J201 / J301 / H101 are all class 01.
			expect(chineseClassCode(7, '01')).toBe('J101');
			expect(chineseClassCode(8, '01')).toBe('J201');
			expect(chineseClassCode(9, '01')).toBe('J301');
			expect(chineseClassCode(10, '01')).toBe('H101');
		});

		it('refuses a marker that belongs to another grade', () => {
			// The check the derivation buys us: a J201 cell in a grade 7 workbook is
			// provably wrong, so the file says so rather than importing it.
			const parsed = readRow('J201', 7);

			expect(parsed.students).toEqual([]);
			expect(parsed.rejected[0].reason).toContain('J101');
		});

		it('refuses a bare number rather than guessing which part is the grade', () => {
			// `1` could be class 1 or a truncated `J101`; `701` could be grade 7 class 01
			// or a three-digit class. Neither is safe to read.
			for (const cell of ['1', '01', '701', 'J1', 'J1010', '']) {
				const parsed = readRow(cell, 7);
				expect(parsed.students, `"${cell}" should not import`).toEqual([]);
				expect(parsed.rejected, `"${cell}" should be reported`).toHaveLength(1);
			}
		});

		it('refuses class 00, which the school does not run', () => {
			expect(readRow('J100', 7).rejected).toHaveLength(1);
		});

		it('reports the cell and the form the school uses', () => {
			// So the admin can fix one cell in Excel, not guess which of 495 rows.
			expect(readRow('', 7).rejected[0].reason).toContain('J101');
			expect(readRow('701', 9).rejected[0].reason).toContain('J301');
		});

		it('treats a sheet with no Chinese-class column as unreadable', () => {
			// Otherwise every one of its rows is rejected for the same missing column,
			// burying the real problem under 400 identical messages.
			const withoutColumn = ['Student ID', 'Chinese Name', 'English Name', 'ESL Group'];

			expect(isReadableRosterSheet(detectColumns(withoutColumn))).toBe(false);

			const sheet = classifySheet(
				'G7 Basic 1',
				[['1150001', '王', 'Yoyo', 'G7 Basic 1']],
				withoutColumn,
				2,
				7
			);
			expect(sheet.kind).toBe('unreadable');
			if (sheet.kind !== 'unreadable') throw new Error('expected an unreadable sheet');
			expect(sheet.reason).toContain('Chinese class');
		});

		it('refuses a grade 10 sheet whose homeroom is not its cohort', () => {
			// A grade 10 class draws from exactly one Chinese class (ADR-0023), so the
			// Class column and the H1nn group are the same fact said twice. One row
			// disagreeing means a typo in one of them, and there is no basis for
			// choosing which — so the file is refused whole.
			const rows = h101Rows();
			rows[0] = [...rows[0]];
			rows[0][2] = 'H102';
			const sheet = classifySheet('H101', rows, G10_HEADER, 2, 10);

			expect(sheet.kind).toBe('misfiled');
			if (sheet.kind !== 'misfiled') throw new Error('expected a misfiled sheet');
			expect(sheet.reason).toContain('511101');
			expect(sheet.reason).toContain('H102');
			// The row is not silently filed by one column or the other.
			expect(sheet.parsed.students).toHaveLength(45);
		});

		it('leaves a levelled grade to its own columns', () => {
			// Grades 7–9 are deliberately mixed across homerooms (ADR-0023), so a
			// student sitting in one ESL class with two different homerooms is
			// correct, not a defect — and there is nothing to cross-check against.
			const rows: string[][] = [];
			for (let seat = 1; seat <= 10; seat++) {
				rows.push([
					`115${String(1000 + seat)}`,
					// Ten students drawn from three homerooms, as the school draws them.
					`J${101 + (seat % 3)}`,
					'王',
					`Yoyo ${seat}`,
					'G7 Basic 1'
				]);
			}
			const sheet = classifySheet('G7 Basic 1', rows, LEVELLED_CHINESE_HEADER, 2, 7);

			expect(sheet.kind).toBe('class');
			if (sheet.kind !== 'class') throw new Error('expected a class sheet');
			// All three homerooms recorded, none of them a reason to refuse.
			expect([...new Set(sheet.parsed.students.map((s) => s.chineseClass))].sort()).toEqual([
				'01',
				'02',
				'03'
			]);
		});

		it('reads a file as the grade its own group names, not the one it is read as', () => {
			// The regression the import page's year prompt turned on. When the page's
			// year derives the wrong grade, the file is read as that grade — and the
			// homeroom marker was checked against it. A grade 9 file's `J301` then failed
			// grade 8's `J2` check, so every row was rejected, `students` came back
			// empty, and the year the file actually claims could not be derived to raise
			// the prompt. The file was staged under the wrong grade instead of reported.
			//
			// The marker answers to the group beside it: a `G9` row's homeroom is a
			// grade 9 homeroom whatever the page derived.
			const parsed = parseRosterSheet(
				[['1130001', '王芃頵', 'Yoyo Lin', 'G9 Advanced 1', 'J301']],
				detectColumns(HEADER),
				2,
				// Read as grade 8 — the year-mismatch case, deliberately.
				8
			);

			expect(parsed.rejected).toEqual([]);
			expect(parsed.students).toHaveLength(1);
			expect(parsed.students[0].chineseClass).toBe('01');
			// And the row is still filed under the class its own group names, which is
			// what lets the page notice the year disagrees.
			expect(parsed.students[0].group).toEqual({
				grade: 9,
				level: 'Advanced',
				classNumber: '1'
			});
		});

		it('still refuses a marker that disagrees with the row its own group names', () => {
			// The check is not weakened by the case above: it moves to the row's own
			// account of itself, so a `J201` homeroom on a `G9` row is still wrong.
			const parsed = parseRosterSheet(
				[['1130001', '王芃頵', 'Yoyo Lin', 'G9 Advanced 1', 'J201']],
				detectColumns(HEADER),
				2,
				9
			);

			expect(parsed.students).toEqual([]);
			expect(parsed.rejected[0].reason).toContain('J301');
		});
	});
});
