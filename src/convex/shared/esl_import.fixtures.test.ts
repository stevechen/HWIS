/**
 * The importer against the workbooks the school actually ships.
 *
 * These read `e2e/fixtures/`, which `scripts/build-esl-fixtures.mjs` builds from
 * the September workbooks with only the students replaced. Every case here was
 * measured in a real file, and each is one a hand-written fixture would have passed
 * while the import lost data: the per-grade column order, G10's `Std ID#` / `Name`
 * headers and numeric IDs, the bare `Pre-Ele` group, the malformed `G9 Elementary1`,
 * the two misfiled rows, and the 1000-row padding every sheet is issued with.
 *
 * The counts are asserted exactly, so a change that quietly drops or duplicates a
 * student fails here rather than in September.
 */
import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import { readFile } from 'node:fs/promises';
// Relative rather than through the `$src` alias: this runs in the unit config,
// which resolves paths from the file rather than from SvelteKit's aliases.
import { splitSheet } from '../../routes/esl/admin/import/workbook';
import { parseRosterWorkbook, cohortOfGroup } from './esl_import';
import type { ParsedRosterWorkbook } from './esl_import';

/**
 * Reads a workbook out of `e2e/fixtures/`, split and parsed exactly as the page
 * does. `file` defaults to the grade's own workbook; the merged-year fixture has a
 * name of its own, so it is passed explicitly.
 */
async function readFixture(
	grade: number,
	file = `roster-g${grade}.xlsx`
): Promise<ParsedRosterWorkbook> {
	const bytes = await readFile(`e2e/fixtures/${file}`);
	const workbook = XLSX.read(bytes, { type: 'buffer' });
	const sheets = workbook.SheetNames.map((name) =>
		splitSheet(
			name,
			XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: true, defval: '' })
		)
	);
	return parseRosterWorkbook(grade, sheets);
}

describe('the real workbooks', () => {
	it('reads grade 7 whole, keeping the sheet a single misfiled row would lose', async () => {
		const parsed = await readFixture(7);

		// 20 class sheets and 2 summaries. `G7 Basic 5` holds one student whose
		// `ESL Group` reads `G7 Elementary 4`, which is a level change whose column
		// was not updated; before the majority rule that one row made the sheet look
		// like a summary and 18 students were discarded.
		expect(parsed.classes).toHaveLength(20);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['Chinese class', 'ESL class ']);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(410);
	});

	it('reads grade 8 whole, keeping the sheet one typo would lose', async () => {
		const parsed = await readFixture(8);

		expect(parsed.classes).toHaveLength(20);
		expect(parsed.skipped).toHaveLength(2);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(413);
	});

	it('reads grade 9 whole, and its malformed group does not split the sheet', async () => {
		const parsed = await readFixture(9);

		expect(parsed.classes).toHaveLength(20);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['G9 Chinese', 'ESL Class (2)']);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(420);
	});

	it('reads grade 10 whole, one cohort per base class with both sections', async () => {
		const parsed = await readFixture(10);

		// The `Chinese Class` sheet restates all 495 students across 11 base
		// classes, so no class has a majority and it is set aside.
		expect(parsed.classes).toHaveLength(11);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['Chinese Class']);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(495);

		// One cohort per base class, each carrying both of its sections — the
		// property that the single-group reading of a G10 sheet used to lose.
		const cohorts = new Map<string, { count: number; sections: Set<string> }>();
		for (const student of parsed.students) {
			const request = cohortOfGroup(student.group);
			const key = `${request.grade}:${request.level ?? ''}:${request.classNumber}`;
			const entry = cohorts.get(key) ?? { count: 0, sections: new Set<string>() };
			entry.count += 1;
			if ('section' in student.group && student.group.section) {
				entry.sections.add(student.group.section);
			}
			cohorts.set(key, entry);
		}
		expect(cohorts.size).toBe(11);
		for (const [key, value] of cohorts) {
			expect(value.sections, `${key} should carry both sections`).toEqual(new Set(['A', 'B']));
			// Grade 10 is not levelled, so no cohort carries a level.
			expect(key).not.toContain('undefined');
		}
	});

	it('derives each levelled file year from its own IDs, and cannot for grade 10', async () => {
		// The IDs keep their ROC prefix, so the year arithmetic runs for real.
		expect((await readFixture(7)).derivedYear).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 115
		});
		expect((await readFixture(8)).derivedYear).toMatchObject({ kind: 'current', entryYear: 114 });
		expect((await readFixture(9)).derivedYear).toMatchObject({ kind: 'current', entryYear: 113 });
		// Grade 10's ID space names no year, so the admin confirms it.
		expect((await readFixture(10)).derivedYear.kind).toBe('unsupported');
	});

	it('names both years when one workbook has two of them merged in', async () => {
		// `scripts/build-esl-merged-fixture.mjs` re-prefixes one class sheet of the
		// real grade 7 workbook to the previous intake year, which is what saving
		// last September's sheet into this year's file produces. Every row is still
		// readable and every sheet is still one class, so nothing else in the parse
		// changes — only the year arithmetic, which is what has to catch it.
		const parsed = await readFixture(7, 'roster-g7-merged-years.xlsx');

		expect(parsed.derivedYear).toEqual({ kind: 'conflict', years: ['2025-2026', '2026-2027'] });
		// Still a full read, so the refusal is about the year and nothing else.
		expect(parsed.classes).toHaveLength(20);
		expect(parsed.rejected).toEqual([]);
	});

	it('files a misfiled student under the class their column names, not their sheet', async () => {
		const parsed = await readFixture(7);
		const flagged = parsed.classes.filter((sheet) => sheet.reason?.includes('class of record'));

		// At least the level change the workbook really contains.
		expect(flagged.length).toBeGreaterThan(0);
		expect(flagged.map((s) => s.sheetName)).toContain('G7 Basic 5');
		// And the flagged sheet is imported in full, not trimmed.
		const basic5 = flagged.find((s) => s.sheetName === 'G7 Basic 5')!;
		expect(basic5.parsed.students.length).toBeGreaterThan(1);
	});

	it('reads the bare Pre-Ele group as grade 7 pre-elementary class 1', async () => {
		// The department runs one pre-elementary class and does not number it, so
		// the column holds `Pre-Ele` with no grade and no class number.
		const parsed = await readFixture(7);
		const preEle = parsed.students.filter(
			(s) => !('baseClass' in s.group) && s.group.level === 'Pre-Elementary'
		);

		expect(preEle.length).toBeGreaterThan(0);
		for (const student of preEle) {
			expect(student.group).toEqual({ grade: 7, level: 'Pre-Elementary', classNumber: '1' });
		}
	});
});
