import {
	detectColumns,
	isReadableRosterSheet,
	parseRosterWorkbook,
	type ParsedRosterWorkbook
	// Relative rather than `$convex`: Convex's own typecheck of the function graph
	// does not have SvelteKit's alias, so `$convex/...` resolves in the app and
	// fails in `convex dev`. This module is imported by the browser reader, so it
	// has to resolve under both.
} from '../../../../convex/shared/esl_import';

/** How far into a sheet the header line may sit before the sheet is given up on. */
const HEADER_SEARCH_DEPTH = 10;

/**
 * A sheet split into its header line and the data rows beneath it.
 *
 * `rowOffset` is the 1-based Excel row the first data row sits on, so a rejected
 * row points at the line the admin sees when they open the file.
 */
export type SplitSheet = {
	name: string;
	headerRow: string[];
	rows: string[][];
	rowOffset: number;
};

/**
 * One cell as the roster parser should see it.
 *
 * Numbers are written as their plain decimal rather than through Excel's display
 * formatting, because a cell formatted with a thousands separator would arrive as
 * `1,130,501` and read as no ID at all. `511024.0` arrives as the number it
 * actually is, so the float artifact the school hit is resolved by the value
 * rather than by guessing at the format.
 */
function cellText(value: unknown): string {
	if (value === null || value === undefined) return '';
	return typeof value === 'string' ? value : String(value);
}

/**
 * How many wholly empty rows in a row end a sheet's data.
 *
 * Every sheet in the school's workbooks declares a 1000-row range but holds fewer
 * than 50 students, so the tail is empty. Reading it anyway meant ~950 blank rows
 * per sheet reached the parser as rows it could not read — 10,485 of them for the
 * grade 10 file, reported to the admin as failures in a perfectly clean file.
 *
 * Two, not one: a class list may carry a single spacer row, and stopping at one
 * would silently truncate a real class. Two consecutive blanks cannot occur inside
 * a roster the department produces, so the rule ends the padding without having to
 * guess a maximum class size.
 */
const BLANK_ROWS_END_A_SHEET = 2;

/** The leading rows of a sheet, stopping before its run of empty padding. */
function rowsUpToPadding(rows: readonly string[][]): string[][] {
	let blankRun = 0;
	for (let index = 0; index < rows.length; index++) {
		const row = rows[index] ?? [];
		blankRun = row.every((value) => value.trim() === '') ? blankRun + 1 : 0;
		if (blankRun >= BLANK_ROWS_END_A_SHEET) {
			// Trimmed back over the run, so the padding itself is not handed on.
			return rows.slice(0, index - (blankRun - 1));
		}
	}
	return rows.slice();
}

/**
 * Finds the header line and the rows under it.
 *
 * The workbooks carry a title and blank lines above the real header, so the header
 * is the first line the shared column detector can read. A sheet with no such line
 * is handed over with its first row as the header anyway, so the classifier reports
 * why the sheet was unreadable instead of this function inventing a reason.
 */
export function splitSheet(name: string, grid: unknown[][]): SplitSheet {
	const rows = grid.map((row) => (Array.isArray(row) ? row.map(cellText) : []));
	const searchDepth = Math.min(rows.length, HEADER_SEARCH_DEPTH);
	const headerIndex = rows
		.slice(0, searchDepth)
		.findIndex((row) => isReadableRosterSheet(detectColumns(row)));

	if (headerIndex === -1) {
		return { name, headerRow: rows[0] ?? [], rows: rowsUpToPadding(rows.slice(1)), rowOffset: 2 };
	}
	return {
		name,
		headerRow: rows[headerIndex],
		// The padding is trimmed, but rowOffset is unchanged: the rows kept are the
		// leading ones, so each still sits on the Excel line it started on.
		rows: rowsUpToPadding(rows.slice(headerIndex + 1)),
		// The header is on Excel row `headerIndex + 1`, so the data starts after it.
		rowOffset: headerIndex + 2
	};
}

/**
 * Reads a grade's workbook in the browser and returns it parsed.
 *
 * The bytes never reach the server: a workbook is uploaded a few times a year, so
 * parsing it in Convex would be bandwidth and execution time billed against a
 * free-tier quota for work the browser does for nothing (ADR-0021). The apply
 * mutation re-reads the staged rows with the same functions, so the preview and the
 * apply cannot disagree about what the file said.
 *
 * SheetJS is imported dynamically so it is fetched only when a file is actually
 * chosen, and never bundled into a server-side module.
 */
export async function readRosterWorkbook(file: File, grade: number): Promise<ParsedRosterWorkbook> {
	const XLSX = await import('xlsx');
	const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });

	const sheets = workbook.SheetNames.map((name) => {
		const sheet = workbook.Sheets[name];
		if (sheet === undefined) return { name, headerRow: [], rows: [], rowOffset: 1 };
		const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
			header: 1,
			// Blank lines are kept, not dropped: dropping them would shift every
			// rejected row's number away from the line Excel shows the admin.
			blankrows: true,
			defval: ''
		});
		return splitSheet(name, grid);
	});

	return parseRosterWorkbook(
		grade,
		sheets.map(({ name, headerRow, rows, rowOffset }) => ({ name, headerRow, rows, rowOffset }))
	);
}
