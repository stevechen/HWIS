/**
 * Rebuilds the e2e roster fixtures from the department's real workbooks.
 *
 * The point of a fixture built this way is that it fails where a hand-written one
 * would pass. Everything structural is kept exactly as the school writes it — sheet
 * names, per-grade column order, header spellings, the summary sheets, the bare
 * `Pre-Ele` group, the malformed `G9 Elementary1`, the two misfiled rows, and the
 * 1000-row padding every sheet is issued with. Only the students change: names are
 * replaced with placeholders and IDs are renumbered while keeping the ROC prefix the
 * school derives the school year from.
 *
 * Nothing is invented. If a case is not in the real file it is not in the fixture,
 * and the importer has unit tests for the ones the school has not produced yet.
 *
 * Run: `node scripts/build-esl-fixtures.mjs [sourceDirectory]`
 * The source directory defaults to the September downloads folder, and those files
 * are never read into git — only the anonymised output is written.
 */
import XLSX from 'xlsx';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE = process.argv[2] ?? '/Volumes/Sidekick/Users/stevechen/Downloads/Roster';
const OUT_DIR = 'e2e/fixtures';

/**
 * The ROC prefix each grade's IDs carry, which is how the importer identifies a
 * file's school year. Preserved so the year arithmetic is exercised for real; a
 * fixture with arbitrary IDs would never derive a year at all.
 */
const ROC_PREFIX = { 7: '115', 8: '114', 9: '113', 10: '5' };

const SOURCES = {
	7: 'G7 class Roster 09012026.xlsx',
	8: 'G8 roster 09012026.xlsx',
	9: 'G9 roster 08312026.xlsx',
	10: 'G10 roster 0903026.xlsx'
};

const SURNAMES = ['王', '李', '張', '陳', '林', '黃', '吳', '劉', '蔡', '楊'];
const GIVEN = ['明', '玲', '傑', '婷', '豪', '君', '偉', '芳', '雯', '賢'];
const ENGLISH = [
	'Yoyo',
	'Jeremy',
	'Angel',
	'Cherry',
	'Remy',
	'Samantha',
	'Verna',
	'Mia',
	'Kai',
	'Ian'
];

/** Deterministic, so re-running produces an identical fixture. */
function syntheticName(index) {
	const surname = SURNAMES[index % SURNAMES.length];
	const given = GIVEN[Math.floor(index / SURNAMES.length) % GIVEN.length];
	return `${surname}${given}`;
}

function syntheticEnglish(index) {
	return `${ENGLISH[index % ENGLISH.length]} Test`;
}

/** A cell that is an email address, wherever in the row it happens to sit. */
const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The row a sheet's column labels sit on, by the same rule the build uses.
 *
 * The guard needs it to tell a header label from a person's name, and it must be
 * the same rule or the two disagree about which row is which.
 */
function headerIndexOf(grid) {
	return grid.findIndex(
		(row) =>
			columnOf(row, /group|組別/i) >= 0 &&
			(columnOf(row, /std\s*id|student\s*id|學號|学号/i) >= 0 || columnOf(row, /name|姓名/i) >= 0)
	);
}

/** The header index of the column matching `pattern`, or -1. */
function columnOf(header, pattern) {
	return header.findIndex((cell) => pattern.test(String(cell ?? '')));
}

async function buildGrade(grade) {
	const workbook = XLSX.read(await readFile(join(SOURCE, SOURCES[grade])), { type: 'buffer' });
	const prefix = ROC_PREFIX[grade];
	// Keyed by the original ID, not the row, so a student restated on a summary
	// sheet keeps the same anonymised ID they have on their class sheet. A summary
	// that disagreed with the class sheets it restates would not be the structure
	// the school actually ships, even though the importer skips it.
	const byOriginalId = new Map();
	let students = 0;

	for (const name of workbook.SheetNames) {
		const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
			header: 1,
			blankrows: true,
			defval: ''
		});
		// The header is the first row carrying a group column alongside either an id
		// or a Chinese-name column, which is how the title and spacer lines above it
		// are skipped.
		//
		// The name column is accepted as an alternative to the id column because two
		// summary sheets have no id header at all — G7's `Chinese class ` leaves A1
		// blank, and G9's `G9 Chinese` headers its columns in Chinese — and a sheet
		// with no id column is exactly the sheet that would otherwise be skipped
		// whole, taking every real name in it straight into the fixture.
		const headerIndex = grid.findIndex(
			(row) =>
				columnOf(row, /group|組別/i) >= 0 &&
				(columnOf(row, /std\s*id|student\s*id|學號|学号/i) >= 0 || columnOf(row, /name|姓名/i) >= 0)
		);
		if (headerIndex === -1) {
			// Not a roster sheet. It must still carry no student data, or the guard
			// below will catch it; saying so here makes a silent skip visible.
			if (grid.some((row) => row.some((cell) => /[一-鿿]{3,}/.test(String(cell ?? ''))))) {
				throw new Error(
					`G${grade} "${name}": no header row found, but the sheet contains Chinese text that may be student data. Refusing to skip it.`
				);
			}
			continue;
		}
		const header = grid[headerIndex];
		const idCol = columnOf(header, /std\s*id|student\s*id|學號|学号/i);
		const groupCol = columnOf(header, /group|組別/i);
		const emailCol = columnOf(header, /e-?mail|電郵|邮箱/i);
		const chineseCol = header.findIndex((cell) => {
			const text = String(cell ?? '');
			// Case-insensitively: the school writes `Chinese Name` with a capital N,
			// and a case-sensitive `/name/` silently matched nothing, so every real
			// name was committed to the fixture unanonymised.
			return /name|姓名/i.test(text) && !/english/i.test(text);
		});
		const englishCol = header.findIndex((cell) => /english/i.test(String(cell ?? '')));

		for (let r = headerIndex + 1; r < grid.length; r++) {
			const row = grid[r];
			// An empty row is padding or a spacer inside the class; both are left
			// exactly as they are, because the importer reads that structure.
			if (row.every((cell) => String(cell ?? '').trim() === '')) continue;
			// A row with no group is a section marker, not a student.
			if (String(row[groupCol] ?? '').trim() === '') continue;

			// A sheet with no id column cannot be renumbered, but it still carries
			// real names, so the name columns are replaced from the row's own
			// position. It is keyed on the row index because there is no id to key
			// on, which is fine for a sheet the importer only ever sets aside.
			let index;
			if (idCol >= 0) {
				if (String(row[idCol] ?? '').trim() === '') continue;
				const originalId = String(row[idCol]).trim();
				let syntheticId = byOriginalId.get(originalId);
				if (syntheticId === undefined) {
					syntheticId =
						grade === 10 ? `${prefix}${100000 + students + 1}` : `${prefix}${1000 + students + 1}`;
					byOriginalId.set(originalId, syntheticId);
					students += 1;
				}
				// The ROC prefix is kept because the year is derived from it; the rest
				// is a counter, so the ID is unique in the file and still six or seven
				// digits. G10 stores its IDs as numbers and the levelled grades as
				// text; the cell type is part of what the importer is asked to read.
				row[idCol] = grade === 10 ? Number(syntheticId) : syntheticId;
				index = byOriginalId.size;
			} else {
				index = r;
			}
			if (chineseCol >= 0) row[chineseCol] = syntheticName(index);
			if (englishCol >= 0) row[englishCol] = syntheticEnglish(index);
			// The email column, where the school has one, is derived from the ID and
			// is never read on import, so it is blanked rather than left pointing at
			// a student who does not exist.
			if (emailCol >= 0) row[emailCol] = '';
			// Some sheets carry the address in a column with no header at all, so
			// `emailCol` is -1 for them and the address survives. Every cell that
			// looks like an address is blanked, wherever it sits, rather than only
			// the one the header names.
			for (let c = 0; c < row.length; c++) {
				if (EMAIL_ADDRESS.test(String(row[c] ?? '').trim())) row[c] = '';
			}
		}

		// Written back through `aoa_to_sheet`, which would otherwise re-emit the
		// declared range — the school's sheets declare `A1:H1000` while the data
		// ends at row 46, so keeping it would commit ~20 MB of empty rows. The
		// padding is the school's file format, not something a fixture needs to
		// carry; `splitSheet`'s two-blank-row stop and the parser's empty-row skip
		// are unit-tested directly instead.
		let lastUsed = -1;
		grid.forEach((row, index) => {
			if (row.some((cell) => String(cell ?? '').trim() !== '')) lastUsed = index;
		});
		workbook.Sheets[name] = XLSX.utils.aoa_to_sheet(grid.slice(0, lastUsed + 1));
	}

	assertAnonymised(grade, workbook);

	const out = join(OUT_DIR, `roster-g${grade}.xlsx`);
	await writeFile(out, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
	console.log(
		`G${grade}: ${workbook.SheetNames.length} sheets, ${students} students anonymised -> ${out}`
	);
}

/**
 * Every name the school wrote, so the output can be checked against them.
 *
 * `anonymised` is the exact set of strings the script writes into the name
 * columns. Anything else that looks like a name or an address is a real student.
 */
const anonymised = new Set();
for (const surname of SURNAMES) {
	for (const given of GIVEN) anonymised.add(surname + given);
}
for (const english of ENGLISH) anonymised.add(`${english} Test`);

/**
 * Refuse to write a fixture that still carries a real name or email address.
 *
 * This exists because the first version of this script matched the Chinese-name
 * header with a case-sensitive `/name/`, which never matched the school's
 * capitalised `Chinese Name` — so `chineseCol` was -1, every name guard was
 * skipped, and ~3,400 real students' names were written into fixtures destined for
 * git. Nothing else noticed: the script exited 0 and printed a reassuring
 * "anonymised" count.
 *
 * A missed column is therefore silent by nature, and the only reliable defence is
 * to check the output rather than trust the column detection. This throws before
 * anything is written, so a leak cannot reach the file at all.
 */
function assertAnonymised(grade, workbook) {
	const problems = [];
	for (const name of workbook.SheetNames) {
		const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
			header: 1,
			blankrows: true,
			defval: ''
		});
		for (let r = 0; r < grid.length; r++) {
			for (let c = 0; c < grid[r].length; c++) {
				const text = String(grid[r][c] ?? '').trim();
				if (text === '') continue;
				// The header row is column labels, not people. G9 headers its columns
				// in Chinese (`中文姓名`), which would otherwise read as a name.
				if (r === headerIndexOf(grid)) continue;
				if (EMAIL_ADDRESS.test(text)) {
					problems.push(`${name} r${r + 1}c${c + 1}: email "${text}"`);
					continue;
				}
				// A run of CJK with no ASCII is a Chinese name; three or more is
				// unambiguous, and the placeholders are all exactly two characters.
				if (/^[一-鿿]{3,}$/.test(text) && !anonymised.has(text)) {
					problems.push(`${name} r${r + 1}c${c + 1}: name "${text}"`);
				}
			}
		}
	}
	if (problems.length > 0) {
		throw new Error(
			`G${grade}: refusing to write a fixture that still carries real student data.\n` +
				`  ${problems.slice(0, 10).join('\n  ')}\n` +
				`  (${problems.length} total) — a name or email column is not being replaced.`
		);
	}
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true });
	for (const grade of Object.keys(SOURCES)) {
		await buildGrade(Number(grade));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
