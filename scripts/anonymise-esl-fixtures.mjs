/**
 * Replaces the names and email addresses in fixtures that were built before the
 * anonymiser worked, without rebuilding them from the source workbooks.
 *
 * This exists because `build-esl-fixtures.mjs` matched the Chinese-name header
 * with a case-sensitive `/name/`, which never matched the school's capitalised
 * `Chinese Name`. Every `chineseCol` came back -1, so no name was ever replaced
 * and ~8,900 real students' names sat in the fixtures destined for git. The
 * script still exited 0 and printed a reassuring "anonymised" count.
 *
 * The builder is now fixed and refuses to write a leaky fixture, but rebuilding
 * would take the current workbooks rather than the ones these fixtures were built
 * from — and those differ. This repairs what is already on disk instead, so the
 * structure, the IDs and the misfiled row all survive untouched.
 *
 * Only name and email cells are touched. IDs, groups, seat numbers, class codes,
 * cell types and row order are all left exactly as they are, because those are
 * what the importer is being tested against.
 *
 * Run: `node scripts/anonymise-esl-fixtures.mjs`
 */
import XLSX from 'xlsx';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'e2e/fixtures';

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
	return `${SURNAMES[index % SURNAMES.length]}${GIVEN[Math.floor(index / SURNAMES.length) % GIVEN.length]}`;
}

function syntheticEnglish(index) {
	return `${ENGLISH[index % ENGLISH.length]} Test`;
}

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function columnOf(header, pattern) {
	return header.findIndex((cell) => pattern.test(String(cell ?? '')));
}

/** The row a sheet's column labels sit on, by the same rule the builder uses. */
function headerIndexOf(grid) {
	return grid.findIndex(
		(row) =>
			columnOf(row, /group|組別/i) >= 0 &&
			(columnOf(row, /std\s*id|student\s*id|學號|学号/i) >= 0 || columnOf(row, /name|姓名/i) >= 0)
	);
}

async function anonymiseFile(file) {
	const bytes = await readFile(join(OUT_DIR, file));
	const workbook = XLSX.read(bytes, { type: 'buffer' });
	let names = 0;
	let emails = 0;

	for (const sheetName of workbook.SheetNames) {
		const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			blankrows: true,
			defval: ''
		});
		const headerIndex = headerIndexOf(grid);
		if (headerIndex === -1) continue;
		const header = grid[headerIndex];
		const chineseCol = header.findIndex((cell) => {
			const text = String(cell ?? '');
			return /name|姓名/i.test(text) && !/english/i.test(text);
		});
		const englishCol = header.findIndex((cell) => /english|英文/i.test(String(cell ?? '')));

		for (let r = headerIndex + 1; r < grid.length; r++) {
			const row = grid[r];
			// Keyed on the row so a name stays the same wherever the same student
			// is restated, without needing an id to key on.
			const index = r;
			if (chineseCol >= 0 && String(row[chineseCol] ?? '').trim() !== '') {
				row[chineseCol] = syntheticName(index);
				names += 1;
			}
			if (englishCol >= 0 && String(row[englishCol] ?? '').trim() !== '') {
				row[englishCol] = syntheticEnglish(index);
			}
			for (let c = 0; c < row.length; c++) {
				if (EMAIL_ADDRESS.test(String(row[c] ?? '').trim())) {
					row[c] = '';
					emails += 1;
				}
			}
		}
		workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(grid);
	}

	await writeFile(join(OUT_DIR, file), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
	console.log(`${file}: ${names} name(s) and ${emails} address(es) replaced`);
}

async function main() {
	const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.xlsx'));
	// The merged-years fixture is derived from roster-g7, so it is redone after
	// its source rather than alongside it.
	for (const file of files.filter((f) => !f.includes('merged'))) {
		await anonymiseFile(file);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
