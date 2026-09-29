/**
 * Builds the one fixture the real downloads cannot supply: a workbook that holds
 * two school years.
 *
 * The department has never sent one, which is exactly why the refusal is worth
 * asserting — a merged file is the mistake an admin makes in September, and the
 * only evidence it is handled is a file that contains one.
 *
 * It is built by copying the real grade 7 fixture and re-prefixing the IDs on one
 * of its class sheets to the previous intake year (`114` rather than `115`), which
 * is what saving last year's sheet into this year's workbook produces. Everything
 * else — sheet names, column order, header spellings, the misfiled row — is the
 * real file's, so nothing about the parser's other edges is disturbed.
 *
 * Run: `node scripts/build-esl-merged-fixture.mjs`
 * It reads the already-anonymised `e2e/fixtures/roster-g7.xlsx`, so unlike
 * `build-esl-fixtures.mjs` it never touches the September downloads.
 */
import XLSX from 'xlsx';
import { readFile, writeFile } from 'node:fs/promises';

const OUT_DIR = 'e2e/fixtures';

/**
 * The sheet whose rows are re-prefixed, and the two years involved.
 *
 * A single class sheet rather than a handful of scattered rows, because that is
 * how a merged workbook actually looks: last year's sheet appended whole. The
 * chosen sheet carries ~19 rows against the file's ~400, so both years are
 * represented in a proportion no majority rule could paper over.
 */
const MERGED_SHEET = 'G7 Elementary 1';
/** Grade 7 in 2026-2027 carries `115`; `114` is the intake year before it. */
const PREVIOUS_YEAR_PREFIX = '114';

async function main() {
	const bytes = await readFile(`${OUT_DIR}/roster-g7.xlsx`);
	const workbook = XLSX.read(bytes, { type: 'buffer' });
	const sheet = workbook.Sheets[MERGED_SHEET];
	if (!sheet) throw new Error(`${MERGED_SHEET} is not in the fixture`);

	const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: '' });
	const headerIndex = grid.findIndex(
		(row) =>
			row.some((c) => /std\s*id|student\s*id/i.test(String(c))) &&
			row.some((c) => /group/i.test(String(c)))
	);
	if (headerIndex === -1) throw new Error(`${MERGED_SHEET} has no header row`);
	const idCol = grid[headerIndex].findIndex((c) => /std\s*id|student\s*id/i.test(String(c)));
	const groupCol = grid[headerIndex].findIndex((c) => /group/i.test(String(c)));

	let repointed = 0;
	for (let r = headerIndex + 1; r < grid.length; r++) {
		const raw = String(grid[r][idCol] ?? '').trim();
		// The rest of the digits are untouched, so the ID is still well-formed and
		// still six digits — the parser sees a real student number, not a marker.
		if (!/^\d{3}\d+$/.test(raw)) continue;
		if (String(grid[r][groupCol] ?? '').trim() === '') continue;
		grid[r][idCol] = `${PREVIOUS_YEAR_PREFIX}${raw.slice(3)}`;
		repointed += 1;
	}

	workbook.Sheets[MERGED_SHEET] = XLSX.utils.aoa_to_sheet(grid);
	const out = `${OUT_DIR}/roster-g7-merged-years.xlsx`;
	await writeFile(out, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
	console.log(`${MERGED_SHEET}: ${repointed} rows moved to ROC ${PREVIOUS_YEAR_PREFIX} -> ${out}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
