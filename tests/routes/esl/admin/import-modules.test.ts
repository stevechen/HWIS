import { describe, it, expect, beforeEach } from 'vitest';
import { splitSheet, readRosterWorkbook } from '$src/routes/esl/admin/import/workbook';
import { isGrade10Group, parseRosterGroup, parseRosterWorkbook } from '$convex/shared/esl_import';
import { ESL_LEVELS } from '$convex/shared/esl';
import {
	clearEntry,
	draftKey,
	readYearDraft,
	schoolYearOf,
	writeEntry,
	type StagedGrade
} from '$src/routes/esl/admin/import/staging';

const HEADER = ['Student ID', 'Chinese Name', 'English Name', 'ESL Group'];

function draft(over: Partial<StagedGrade> = {}): StagedGrade {
	return {
		grade: 9,
		fileName: 'g9.xlsx',
		stagedAt: 0,
		students: [],
		skipped: [],
		rejected: [],
		derivedYear: { kind: 'current', year: '2026-2027', entryYear: 113 },
		...over
	};
}

describe('splitSheet', () => {
	it('finds the header below a title block, and keeps the Excel line numbers', () => {
		// The workbooks open with a title and a blank line, so the header is rarely
		// on row 1 — and a rejected row must point at the line Excel shows.
		const split = splitSheet('G9 Adv 1', [
			['2026-2027 Grade 9 ESL Roster'],
			[],
			HEADER,
			['1130001', '王芃頵', 'Yoyo Lin', 'G9 Advanced 1'],
			['', 'broken row', '', 'G9 Advanced 1']
		]);

		expect(split.headerRow).toEqual(HEADER);
		expect(split.rows).toHaveLength(2);
		// Header on Excel row 3, so the first data row is row 4.
		expect(split.rowOffset).toBe(4);
	});

	it('reads a header on the first row', () => {
		const split = splitSheet('G9 Adv 1', [HEADER, ['1130001', '王芃頵', 'Yoyo', 'G9 Advanced 1']]);

		expect(split.rowOffset).toBe(2);
		expect(split.rows).toHaveLength(1);
	});

	it('keeps blank rows, so row numbers do not drift', () => {
		const split = splitSheet('G9 Adv 1', [
			HEADER,
			['1130001', 'a', 'b', 'G9 Advanced 1'],
			[],
			['x']
		]);

		// Dropping the blank would move the last row from Excel line 4 to line 3.
		expect(split.rows).toHaveLength(3);
	});

	it('writes a numeric cell as its plain value, not a formatted string', () => {
		// `1130501.0` is the same student as `1130501`; a thousands separator would
		// arrive as `1,130,501` and read as no ID at all.
		const split = splitSheet('G9 Adv 1', [HEADER, [1130501, '王芃頵', 'Yoyo', 'G9 Advanced 1']]);

		expect(split.rows[0][0]).toBe('1130501');
	});

	it('stops at two blank rows in a row, rather than reading a sheet to 1000', () => {
		// Measured on the real G10 file: every sheet declares a 1000-row range and
		// holds fewer than 50 students, so the tail is padding. Reading it handed
		// ~950 blank rows per sheet to the parser as rows it could not read.
		const padded = [
			HEADER,
			['1130001', '王芃頵', 'Yoyo Lin', 'G9 Advanced 1'],
			['1130002', '李大文', 'Jeremy Wu', 'G9 Advanced 1'],
			['', '', '', ''],
			['', '', '', ''],
			...Array.from({ length: 50 }, () => ['', '', '', ''])
		];

		expect(splitSheet('G9 Adv 1', padded).rows).toHaveLength(2);
	});

	it('keeps reading past a single blank row inside a class', () => {
		// Two blanks, not one: a class list may carry a spacer row, and stopping at
		// one would silently truncate a real class.
		const spaced = [
			HEADER,
			['1130001', '王芃頵', 'Yoyo Lin', 'G9 Advanced 1'],
			['', '', '', ''],
			['1130002', '李大文', 'Jeremy Wu', 'G9 Advanced 1'],
			['', '', '', ''],
			['', '', '', ''],
			...Array.from({ length: 20 }, () => ['', '', '', ''])
		];

		const split = splitSheet('G9 Adv 1', spaced);

		// Both students survive, and so does the single spacer between them: it is
		// kept precisely so the second student's Excel line is unchanged. Only the
		// run of two is trimmed.
		expect(split.rows).toHaveLength(3);
		expect(split.rows[2]).toEqual(['1130002', '李大文', 'Jeremy Wu', 'G9 Advanced 1']);
		expect(split.rowOffset).toBe(2);
	});

	it('hands a headerless sheet to the classifier with its first row as the header', () => {
		// The classifier explains why a sheet is unreadable; this must not invent a
		// reason of its own.
		const split = splitSheet('Notes', [['a note'], ['another']]);

		expect(split.headerRow).toEqual(['a note']);
		expect(split.rowOffset).toBe(2);
	});

	it('carries the offset through to the rejected row the admin is shown', () => {
		// The point of the offset: `splitSheet` and `parseRosterWorkbook` are separate
		// steps, and only a test that joins them catches an offset that stops being
		// passed on. A rejected row reported at the wrong Excel line sends the admin
		// to fix a row that was never broken.
		const grid = [
			['2026-2027 Grade 9 ESL Roster'],
			[],
			HEADER,
			['1130001', '王芃頵', 'Yoyo', 'G9 Advanced 1'],
			['', 'no id here', '', 'G9 Advanced 1']
		];
		const split = splitSheet('G9 Adv 1', grid);

		const parsed = parseRosterWorkbook(9, [
			{
				name: split.name,
				headerRow: split.headerRow,
				rows: split.rows,
				rowOffset: split.rowOffset
			}
		]);

		// The bad row is the 5th line of the sheet, not the 2nd row of `rows`.
		expect(parsed.rejected).toHaveLength(1);
		expect(parsed.rejected[0].rowNumber).toBe(5);
	});
});

describe('the group text the card sends', () => {
	it('round-trips every official level back to the same group', () => {
		// The card rebuilds `G9 Advanced 1` from the parsed parts rather than keeping
		// the original cell, so the server re-parses text the browser composed. This
		// is the test that says the composition is lossless: if a level could not
		// survive the trip, the server would reject a row the admin saw as fine.
		for (const level of ESL_LEVELS) {
			for (const classNumber of ['1', '2']) {
				const original = { grade: 9, level, classNumber } as const;
				const text = `G${original.grade} ${original.level} ${original.classNumber}`;

				expect(parseRosterGroup(text)).toEqual(original);
			}
		}
	});

	it('round-trips the abbreviations the workbooks use', () => {
		// The workbooks abbreviate; the card normalizes to the official name. The
		// server must land on the same cohort either way, or a preview and an apply
		// would disagree about the class.
		for (const [short, official] of [
			['Ele', 'Elementary'],
			['Int', 'Intermediate'],
			['Adv', 'Advanced'],
			['Pre-Ele', 'Pre-Elementary']
		] as const) {
			const parsed = parseRosterGroup(`G9 ${short} 1`);

			// Narrowed the way the import narrows it: a grade 10 section has no level,
			// so reading one here would be reading a property the type does not have.
			expect(parsed).not.toBeNull();
			if (parsed === null || isGrade10Group(parsed)) {
				throw new Error(`expected "${short}" to parse as a levelled group`);
			}
			const text = `G${parsed.grade} ${parsed.level} ${parsed.classNumber}`;
			expect(parseRosterGroup(text)).toEqual(parsed);
			expect(parsed.level).toBe(official);
		}
	});
});

describe('readRosterWorkbook', () => {
	it('reads a real workbook, and reports rejections on the Excel line', async () => {
		// The one test that goes through SheetJS, so the offset is proven against a
		// file rather than against the array shape the split produced.
		const XLSX = await import('xlsx');
		const sheet = XLSX.utils.aoa_to_sheet([
			['2026-2027 Grade 9 ESL Roster'],
			[],
			HEADER,
			['1130001', '王芃頵', 'Yoyo', 'G9 Advanced 1'],
			['', 'no id here', '', 'G9 Advanced 1']
		]);
		const book = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(book, sheet, 'G9 Adv 1');
		const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

		const parsed = await readRosterWorkbook(new File([bytes], 'g9.xlsx'), 9);

		expect(parsed.students).toHaveLength(1);
		expect(parsed.students[0].schoolStudentId).toBe('1130001');
		expect(parsed.rejected).toHaveLength(1);
		// Title, blank, header, good row, bad row.
		expect(parsed.rejected[0].rowNumber).toBe(5);
	});
});

describe('staging', () => {
	beforeEach(() => window.localStorage.clear());

	it('namespaces drafts by school year', () => {
		expect(draftKey('2026-2027')).toBe('esl-import:2026-2027');
	});

	it('keeps each grade of a year, and leaves the others alone', () => {
		writeEntry('2026-2027', 9, { status: 'staged', draft: draft() });
		writeEntry('2026-2027', 8, { status: 'staged', draft: draft({ grade: 8 }) });

		const stored = readYearDraft('2026-2027');
		expect(Object.keys(stored.grades).sort()).toEqual(['8', '9']);
		const entry = stored.grades['8'];
		expect(entry.status).toBe('staged');
		if (entry.status !== 'staged') throw new Error('expected a staged entry');
		expect(entry.draft.fileName).toBe('g9.xlsx');
	});

	it('does not carry a draft into another year', () => {
		writeEntry('2026-2027', 9, { status: 'staged', draft: draft() });

		expect(readYearDraft('2027-2028').grades).toEqual({});
	});

	it('drops the year entirely once its last grade is gone', () => {
		writeEntry('2026-2027', 9, { status: 'staged', draft: draft() });
		clearEntry('2026-2027', 9);

		// A stale draft is neither clutter nor a small privacy exposure on a shared
		// machine, so an empty year leaves nothing behind.
		expect(window.localStorage.getItem(draftKey('2026-2027'))).toBeNull();
	});

	it('ignores a draft it cannot read', () => {
		window.localStorage.setItem(draftKey('2026-2027'), 'not json');

		expect(readYearDraft('2026-2027')).toEqual({ year: '2026-2027', grades: {} });
	});

	it('ignores a draft stored under a different year', () => {
		window.localStorage.setItem(
			draftKey('2026-2027'),
			JSON.stringify({ year: '1999-2000', grades: { '9': { status: 'staged', draft: draft() } } })
		);

		expect(readYearDraft('2026-2027').grades).toEqual({});
	});

	it('reads a year back after a reload of the page', () => {
		writeEntry('2026-2027', 9, { status: 'staged', draft: draft({ fileName: 'kept.xlsx' }) });

		// What a second visit sees: the file is still staged, so it need not be
		// uploaded twice.
		const entry = readYearDraft('2026-2027').grades['9'];
		expect(entry.status).toBe('staged');
		if (entry.status !== 'staged') throw new Error('expected a staged entry');
		expect(entry.draft.fileName).toBe('kept.xlsx');
	});
});

describe('schoolYearOf', () => {
	it('counts September onwards as the new school year', () => {
		// The intake arrives in September, which is when the year turns.
		expect(schoolYearOf(new Date(2026, 8, 1))).toBe('2026-2027');
	});

	it('counts the months before it as the year in progress', () => {
		expect(schoolYearOf(new Date(2026, 0, 15))).toBe('2025-2026');
		expect(schoolYearOf(new Date(2026, 6, 31))).toBe('2025-2026');
	});
});
