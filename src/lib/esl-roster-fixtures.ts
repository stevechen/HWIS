/**
 * Synthetic roster workbooks, shaped like the department's real ones.
 *
 * The shapes were measured against the September 2026 workbooks, and that
 * measurement is the point: every structural quirk below is one a hand-written
 * fixture would have got wrong and the real import would have failed on. But the
 * **data is entirely invented**. No student name, ID, email or class roster from
 * the school appears anywhere in this file, and none can — there is no path from
 * a real workbook to the output.
 *
 * That is deliberate. An earlier version of these fixtures was built by
 * anonymising the real workbooks, and the anonymiser silently failed: a
 * case-sensitive header match meant every `chineseCol` came back -1, so no name
 * was ever replaced and ~8,900 real students' names were written into files
 * destined for git, while the script reported success throughout. Synthetic data
 * removes the entire class of failure rather than guarding against it.
 *
 * The second reason is that the real workbooks move. They were re-synced
 * mid-task, and a rebuild silently produced a different file — one no longer
 * containing the misfiled row the tests assert. A fixture that cannot change
 * underneath its own assertions is worth more than one that mirrors a snapshot.
 *
 * The structural quirks reproduced, and why each matters:
 *
 * - **Per-grade column order.** G10 puts `ESL group` first and `Std ID#` second;
 *   the levelled grades put the ID first. The importer matches by header name, so
 *   a fixture that always ordered columns the tidy way would pass regardless.
 * - **Header spellings.** `Std ID#` and bare `Name` for G10, `Student ID` and
 *   `Chinese Name` elsewhere, and G9's summary sheet headed entirely in Chinese.
 * - **Summary sheets** that restate the whole grade, which the importer must set
 *   aside rather than import as one enormous class.
 * - **A summary sheet with no ID header at all** (G7's `Chinese class ` leaves
 *   A1 blank). The importer finds the header by looking for one, so a fixture
 *   that always had a full header would miss the case entirely.
 * - **Trailing whitespace in a sheet name** (`ESL Class `).
 * - **Abbreviated sheet names** (`G8 Inter 1`, `G9 Ele 1`) that do not round-trip
 *   to the group they hold (`G8 Intermediate 1`).
 * - **A bare `Pre-Ele` group** on G7, the department's one unnumbered class.
 * - **The malformed `G9 Elementary1`**, missing a space, which must resolve to the
 *   same class rather than splitting the sheet.
 * - **The two misfiled rows**, in G7 and G8: a row whose `ESL Group` names a
 *   different class from the sheet it sits in, because a student changed level and
 *   the column was not updated. The column is the class of record.
 * - **One student listed on two G7 class sheets**, which makes that file
 *   unappliable and is the real defect tracked in #141.
 * - **Float-formatted and numeric IDs.** G10 stores its IDs as Excel numbers and
 *   the levelled grades as text, and the importer has to read both.
 */
import XLSX from 'xlsx';

export type FixtureCell = string | number;

export type RosterFixtureSheet = {
	/** The name as Excel shows it, trailing spaces and all. */
	name: string;
	grid: FixtureCell[][];
};

export type RosterFixture = {
	/** The file name a browser upload would carry. */
	fileName: string;
	sheets: RosterFixtureSheet[];
};

/** Students per class sheet, matching the scale measured in the real files. */
const PER_CLASS = 20;

/** The levelled groups each grade runs, in the order the school writes them. */
const LEVELLED: Record<7 | 8 | 9, { level: string; count: number }[]> = {
	7: [
		{ level: 'Advanced', count: 3 },
		{ level: 'Intermediate', count: 6 },
		{ level: 'Basic', count: 6 },
		{ level: 'Elementary', count: 4 }
	],
	8: [
		{ level: 'Advanced', count: 3 },
		{ level: 'Intermediate', count: 7 },
		{ level: 'Basic', count: 7 },
		{ level: 'Elementary', count: 3 }
	],
	9: [
		{ level: 'Advanced', count: 3 },
		{ level: 'Intermediate', count: 6 },
		{ level: 'Basic', count: 7 },
		{ level: 'Elementary', count: 4 }
	]
};

/**
 * The abbreviations each grade uses in its sheet names, which never round-trip to
 * the group they hold.
 *
 * Per grade because the school is not consistent: G7 writes `G7 Elementary 1` in
 * full while G8 and G9 write `G8 Ele 1`. A single global table would have quietly
 * normalised that away, and a fixture that always abbreviated would not notice a
 * parser that resolved a sheet name to a class by abbreviation.
 */
const SHEET_ABBREVIATION: Record<7 | 8 | 9, Record<string, string>> = {
	7: {},
	8: { Advanced: 'Adv', Intermediate: 'Inter', Elementary: 'Ele' },
	9: { Advanced: 'Adv', Intermediate: 'Inter', Elementary: 'Ele' }
};

/**
 * The leading ROC entry year of each grade's IDs, which is how the importer
 * derives the school year a file belongs to.
 *
 * Grade 7 is the intake year, so for a student in grade `g` the year follows from
 * `entryYear + (g - 7)`. Grade 10 uses a separate scheme that names no year, so
 * its IDs carry none and the year is confirmed by the admin instead.
 */
const ROC_PREFIX: Record<7 | 8 | 9 | 10, string> = { 7: '115', 8: '114', 9: '113', 10: '5' };

/** The grade 7 class whose one row is filed under another class. */
const MISFILED_SHEET_G7 = 'G7 Basic 5';
const MISFILED_GROUP_G7 = 'G7 Elementary 4';
/** The grade 8 equivalent, on a sheet whose name is abbreviated. */
const MISFILED_SHEET_G8 = 'G8 Inter 1';
const MISFILED_GROUP_G8 = 'G8 Intermediate 2';
/** The one malformed group: a missing space, which must still resolve. */
const MALFORMED_SHEET_G9 = 'G9 Ele 1';
const MALFORMED_GROUP_G9 = 'G9 Elementary1';
/** G7's single pre-elementary class, which the school does not number. */
const PRE_ELEMENTARY_SHEET_G7 = 'G7 Pre-Elementary';
const PRE_ELEMENTARY_GROUP_G7 = 'Pre-Ele';
/** The two G7 sheets the duplicated student is listed on. See #141. */
const DUPLICATED_SHEETS_G7 = ['G7 Elementary 2', 'G7 Pre-Elementary'];

/** The levelled grades' header, in the school's column order. */
const LEVELLED_HEADER = [
	'Student ID',
	'C Class',
	'Seat No.',
	'Chinese Name',
	'English Name',
	'ESL Group'
];

/** G9's summary sheet is headed entirely in Chinese. */
const G9_SUMMARY_HEADER = [' ', '班級', '座號', '中文姓名', '英文姓名', 'ESL 組別'];

/** G10 leads with the group, and calls the ID `Std ID#` and the name `Name`. */
const G10_HEADER = ['ESL group', 'Std ID#', 'Class', 'Seat No.', 'Name', 'English Name'];

/** Grade 10 base classes, each taught by an A and a B section. */
const G10_CLASSES = 11;

/** A name that cannot be mistaken for a student's. */
function fakeName(n: number): string {
	return `Test Student ${String(n).padStart(4, '0')}`;
}

/** A C Class code, which is the school's Chinese class, not an ESL cohort. */
function fakeChineseClass(n: number): string {
	return `J${100 + (n % 90)}`;
}

/**
 * One student row, laid out under `header`.
 *
 * Column order differs per grade, so the row is built by walking the header rather
 * than by position: a fixture that always emitted the levelled order would not
 * notice a parser that read G10 by the wrong column index.
 */
function studentRow(
	header: string[],
	row: { id: FixtureCell; group: string; index: number; classCode: string; seat: string }
): FixtureCell[] {
	return header.map((cell) => {
		if (/std\s*id|student\s*id/i.test(cell)) return row.id;
		if (/^c class|^班級$/i.test(cell)) return row.classCode;
		if (/seat|座號/i.test(cell)) return row.seat;
		if (/group|組別/i.test(cell)) return row.group;
		if (/english|英文/i.test(cell)) return `${fakeName(row.index)} EN`;
		return fakeName(row.index);
	});
}

/**
 * A sheet restating every class in the grade, so no single class has a majority.
 *
 * The importer sets such a sheet aside rather than importing it as one enormous
 * class, which is the property the majority rule exists to provide.
 */
function summarySheet(
	name: string,
	header: string[],
	groups: string[],
	firstIndex: number
): RosterFixtureSheet {
	const rows: FixtureCell[][] = [header.slice()];
	let n = firstIndex;
	for (const group of groups) {
		for (let s = 0; s < PER_CLASS; s++) {
			rows.push(
				studentRow(header, {
					id: `5${100000 + n}`,
					group,
					index: n,
					classCode: fakeChineseClass(n),
					seat: String((n % 40) + 1).padStart(2, '0')
				})
			);
			n++;
		}
	}
	return { name, grid: rows };
}

export type RosterFixtureOptions = {
	/**
	 * Re-prefix one grade 7 class sheet to the previous intake year, producing a
	 * workbook holding two school years.
	 *
	 * The department has never sent one, which is exactly why the refusal needs
	 * testing: importing it would scatter a cohort irrecoverably. A whole sheet is
	 * moved rather than a few rows, because that is what saving last September's
	 * sheet into this year's workbook actually looks like.
	 */
	mergedYears?: boolean;
};

/** One of the grade's class sheets: a sheet name and the group it holds. */
type ClassSheet = { sheet: string; group: string };

/** The class sheets a levelled grade runs, in the order the school writes them. */
function levelledClasses(grade: 7 | 8 | 9): ClassSheet[] {
	const sheets: ClassSheet[] = [];
	const abbreviations = SHEET_ABBREVIATION[grade];
	for (const { level, count } of LEVELLED[grade]) {
		for (let i = 1; i <= count; i++) {
			sheets.push({
				sheet: `G${grade} ${abbreviations[level] ?? level} ${i}`,
				group: `G${grade} ${level} ${i}`
			});
		}
	}
	// Grade 7 runs one pre-elementary class and does not number it, so its group
	// carries no grade marker and no class number at all.
	if (grade === 7) {
		sheets.push({ sheet: PRE_ELEMENTARY_SHEET_G7, group: PRE_ELEMENTARY_GROUP_G7 });
	}
	return sheets;
}

/** Lays student rows out under `header`. */
function buildRows(
	header: string[],
	rows: { id: FixtureCell; group: string; index: number }[]
): FixtureCell[][] {
	return rows.map((row) =>
		studentRow(header, {
			id: row.id,
			group: row.group,
			index: row.index,
			classCode: fakeChineseClass(row.index),
			seat: String((row.index % 40) + 1).padStart(2, '0')
		})
	);
}

function buildLevelled(grade: 7 | 8 | 9, options: RosterFixtureOptions): RosterFixture {
	const header = LEVELLED_HEADER.slice();
	const prefix = ROC_PREFIX[grade];
	const classes = levelledClasses(grade);
	const sheets: RosterFixtureSheet[] = [];
	let index = 1;

	for (const { sheet, group } of classes) {
		const rows: { id: FixtureCell; group: string; index: number }[] = [];
		for (let s = 0; s < PER_CLASS; s++) {
			// Text, not a number: the levelled grades store IDs as text where G10
			// stores them as Excel numbers, and the importer has to read both.
			rows.push({ id: `${prefix}${1000 + index}`, group, index });
			index++;
		}

		// The misfiled row: this student's group names a different class, because
		// they changed level and the column was not updated. It is the only row in
		// the sheet that disagrees, which is what stops the sheet being trimmed.
		const misfiled =
			grade === 7 && sheet === MISFILED_SHEET_G7
				? MISFILED_GROUP_G7
				: grade === 8 && sheet === MISFILED_SHEET_G8
					? MISFILED_GROUP_G8
					: null;
		if (misfiled !== null) rows[0] = { ...rows[0], group: misfiled };

		// The malformed group: one missing space, which must still resolve to the
		// class the sheet holds, so the sheet is not split in two.
		if (grade === 9 && sheet === MALFORMED_SHEET_G9) {
			rows[0] = { ...rows[0], group: MALFORMED_GROUP_G9 };
		}

		// One student listed on two class sheets at once. The importer refuses to
		// apply a file where an ID appears twice, because it would enrol them in
		// one cohort and disable them in the other. See #141.
		if (grade === 7 && DUPLICATED_SHEETS_G7.includes(sheet)) {
			rows.push({ id: `${prefix}9999`, group, index: 9999 });
		}

		sheets.push({ name: sheet, grid: [header.slice(), ...buildRows(header, rows)] });
	}

	// Grade 7's first summary sheet leaves A1 blank, so it has no ID header at
	// all. A fixture that always carried a full header would never exercise the
	// importer's search for one.
	const summaryHeader = grade === 9 ? G9_SUMMARY_HEADER.slice() : header.slice();
	if (grade === 7) summaryHeader[0] = '';
	const firstSummaryName =
		grade === 9 ? 'G9 Chinese' : grade === 8 ? 'Chinese Class' : 'Chinese class ';
	const groups = classes.map((c) => c.group);
	const built: RosterFixtureSheet[] = [
		summarySheet(firstSummaryName, summaryHeader, groups, 9000),
		// The second summary sheet is named with a trailing space, as the school's is.
		summarySheet('ESL Class ', header.slice(), groups, 9500),
		...sheets
	];

	if (options.mergedYears) {
		if (grade !== 7) {
			throw new Error('mergedYears is defined for grade 7 only; see RosterFixtureOptions');
		}
		// One whole class sheet re-prefixed to the previous intake year, so the
		// file's own arithmetic names two years and no prompt can resolve them.
		const target = built[2];
		target.grid = target.grid.map((row, r) =>
			r === 0 ? row : [String(row[0]).replace(/^\d{3}/, '114'), ...row.slice(1)]
		);
	}

	return {
		fileName: `roster-g${grade}${options.mergedYears ? '-merged-years' : ''}.xlsx`,
		sheets: built
	};
}
function buildGrade10(): RosterFixture {
	const header = G10_HEADER.slice();
	const sheets: RosterFixtureSheet[] = [];
	const groups: string[] = [];
	let index = 1;

	for (let c = 1; c <= G10_CLASSES; c++) {
		const base = `H1${String(c).padStart(2, '0')}`;
		groups.push(base);
		const rows: { id: FixtureCell; group: string; index: number }[] = [];
		// Both sections, because one base class is taught twice and the importer
		// must read them as a single cohort sharing one roster.
		for (const section of ['A', 'B'] as const) {
			for (let s = 0; s < PER_CLASS; s++) {
				// A number, not a string: G10 stores its IDs as Excel numbers where
				// the levelled grades store text.
				rows.push({ id: Number(`5${100000 + index}`), group: `${base}${section}`, index });
				index++;
			}
		}
		sheets.push({ name: base, grid: [header.slice(), ...buildRows(header, rows)] });
	}

	// The summary sheet restates every base class, so no one of them has a
	// majority and it is set aside rather than imported as one enormous class.
	return {
		fileName: 'roster-g10.xlsx',
		sheets: [summarySheet('Chinese Class', header.slice(), groups, 9000), ...sheets]
	};
}

/** Builds a synthetic workbook for one grade. */
export function buildRosterFixture(
	grade: 7 | 8 | 9 | 10,
	options: RosterFixtureOptions = {}
): RosterFixture {
	return grade === 10 ? buildGrade10() : buildLevelled(grade, options);
}

/** The grade 7 student listed on two class sheets; see #141. */
export const DUPLICATED_SCHOOL_ID = '1159999';

/**
 * The student whose `ESL Group` disagrees with the sheet they sit in.
 *
 * Read out of the built workbook rather than hardcoded, so the id cannot drift
 * from the fixture when the generator's ordering changes. A test that pins the id
 * itself would fail for a reason that has nothing to do with what it is testing.
 */
export function misfiledSchoolStudentId(grade: 7 | 8): string {
	const sheetName = grade === 7 ? MISFILED_SHEET_G7 : MISFILED_SHEET_G8;
	const group = grade === 7 ? MISFILED_GROUP_G7 : MISFILED_GROUP_G8;
	const sheet = buildRosterFixture(grade).sheets.find((s) => s.name === sheetName);
	if (!sheet) throw new Error(`${sheetName} is not in the generated grade ${grade} workbook`);
	const groupCol = sheet.grid[0].findIndex((cell) => /group|組別/i.test(String(cell)));
	const row = sheet.grid.slice(1).find((r) => String(r[groupCol]) === group);
	if (!row) throw new Error(`${sheetName} holds no row whose group reads ${group}`);
	return String(row[0]);
}

/**
 * The workbook as an `.xlsx` buffer, the form a browser upload carries.
 *
 * Written to memory rather than to disk, so there is no committed fixture file to
 * hold real data and nothing to go stale between a test and a run.
 */
export function rosterWorkbookBuffer(
	grade: 7 | 8 | 9 | 10,
	options: RosterFixtureOptions = {}
): { fileName: string; buffer: Buffer } {
	const fixture = buildRosterFixture(grade, options);
	const workbook = XLSX.utils.book_new();
	for (const sheet of fixture.sheets) {
		XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.grid), sheet.name);
	}
	return {
		fileName: fixture.fileName,
		buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
	};
}
