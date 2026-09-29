import { isValidSchoolStudentId } from '$convex/shared/esl';

/** One parsed spreadsheet row, keyed by the canonical ESL roster field. */
export type EslRosterRow = {
	englishName: string;
	chineseName: string;
	schoolStudentId: string;
};

/**
 * Maps a spreadsheet header to a roster field, or null when the column is not
 * part of an ESL roster. Matching is loose (`Student ID`, `student_id`,
 * `School Student ID` all land on the same field) because the file comes from
 * whatever spreadsheet the department already keeps its roster in.
 */
export function matchEslFieldName(header: string): keyof EslRosterRow | null {
	const s = header
		.trim()
		.toLowerCase()
		.replace(/^\ufeff/, '');

	if (/student|學號|学号|sid\b/.test(s)) return 'schoolStudentId';
	if (/english|英文/.test(s)) return 'englishName';
	if (/chinese|中文/.test(s)) return 'chineseName';

	return null;
}

/**
 * Splits delimited text into rows of cells, honouring quoted cells so a
 * pasted name containing the delimiter survives. Handles CRLF and a UTF-8 BOM,
 * both of which Excel produces.
 */
function splitRows(text: string, delimiter: string): string[][] {
	const normalized = text
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentCell = '';
	let inQuotes = false;

	for (let i = 0; i < normalized.length; i++) {
		const char = normalized[i];
		const nextChar = normalized[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				currentCell += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === delimiter && !inQuotes) {
			currentRow.push(currentCell);
			currentCell = '';
			continue;
		}

		if (char === '\n' && !inQuotes) {
			currentRow.push(currentCell);
			rows.push(currentRow);
			currentRow = [];
			currentCell = '';
			continue;
		}

		currentCell += char;
	}

	if (currentCell.length > 0 || currentRow.length > 0) {
		currentRow.push(currentCell);
		rows.push(currentRow);
	}

	return rows;
}

/**
 * Picks the delimiter from the header line: whichever of tab or comma appears
 * first outside quotes. A file pasted from Excel is tab-separated; one exported
 * as CSV is comma-separated, and the two must not be guessed from the body.
 */
export function detectDelimiter(text: string): string {
	const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
	let inQuotes = false;
	for (const char of firstLine) {
		if (char === '"') {
			inQuotes = !inQuotes;
			continue;
		}
		if (inQuotes) continue;
		if (char === '\t') return '\t';
		if (char === ',') return ',';
	}
	return '\t';
}

export type ParsedRoster = {
	/** Rows ready to hand to the bulk import mutation. */
	students: EslRosterRow[];
	/** Rows the backend would reject, kept so the admin can fix and re-paste. */
	rejected: { rowNumber: number; reason: string; raw: string[] }[];
	/** Headers present in the file that are not roster fields. */
	ignoredHeaders: string[];
};

/**
 * Parses a pasted or uploaded CSV/TSV roster.
 *
 * The first line is treated as the header. Rows are validated here with the
 * same rules the backend uses, so an obviously bad row is reported before the
 * mutation round-trips — but the backend remains the authority and its own
 * per-row rejections are surfaced verbatim by the caller.
 */
export function parseEslRoster(text: string): ParsedRoster {
	const delimiter = detectDelimiter(text);
	const rows = splitRows(text, delimiter);
	if (rows.length === 0) {
		return { students: [], rejected: [], ignoredHeaders: [] };
	}

	const headerFields = rows[0].map(matchEslFieldName);
	const ignoredHeaders = rows[0].filter((_, index) => headerFields[index] === null);
	const students: EslRosterRow[] = [];
	const rejected: ParsedRoster['rejected'] = [];

	for (let i = 1; i < rows.length; i++) {
		const values = rows[i];
		// Skip the blank trailing line a spreadsheet export leaves behind.
		if (values.every((value) => value.trim() === '')) continue;

		const row: EslRosterRow = { englishName: '', chineseName: '', schoolStudentId: '' };
		for (let j = 0; j < headerFields.length; j++) {
			const field = headerFields[j];
			if (field) row[field] = (values[j] ?? '').trim();
		}

		const problem = validateRosterRow(row);
		if (problem) {
			rejected.push({ rowNumber: i + 1, reason: problem, raw: values });
			continue;
		}
		students.push(row);
	}

	return { students, rejected, ignoredHeaders };
}

/** Why a roster row cannot be imported, or null when it is valid. */
export function validateRosterRow(row: EslRosterRow): string | null {
	if (!row.englishName.trim()) return 'English name is required';
	if (!row.chineseName.trim()) return 'Chinese name is required';
	if (!isValidSchoolStudentId(row.schoolStudentId)) {
		return 'School student ID must be a 6- or 7-digit number';
	}
	return null;
}
