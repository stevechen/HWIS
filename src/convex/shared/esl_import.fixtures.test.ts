/**
 * The importer against workbooks shaped like the school's.
 *
 * These are built by `src/lib/esl-roster-fixtures.ts`, whose shapes were measured
 * against the September 2026 workbooks — the column order per grade, G10's
 * `Std ID#` / `Name` headers and numeric IDs, the summary sheets, the bare
 * `Pre-Ele` group, the malformed `G9 Elementary1`, and the two misfiled rows. Every
 * one is a case a hand-written fixture would have passed while the import lost
 * data.
 *
 * The data is synthetic. Nothing here is a real student, and nothing can become
 * one: the shapes are the only thing carried over from the real files.
 *
 * The counts are asserted exactly, so a change that quietly drops or duplicates a
 * student fails here rather than in September.
 */
import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
// Relative rather than through the `$src` alias: this runs in the unit config,
// which resolves paths from the file rather than from SvelteKit's aliases.
import { splitSheet } from '../../routes/esl/admin/import/workbook';
import { rosterWorkbookBuffer } from '../../lib/esl-roster-fixtures';
import { parseRosterWorkbook, cohortOfGroup } from './esl_import';
import type { ParsedRosterWorkbook } from './esl_import';

/**
 * Builds a workbook and parses it exactly as the page does, round-tripping
 * through real `.xlsx` first so cell types and number formatting are exercised.
 */
function readFixture(
	grade: 7 | 8 | 9 | 10,
	options: { mergedYears?: boolean } = {}
): ParsedRosterWorkbook {
	const { buffer } = rosterWorkbookBuffer(grade, options);
	const workbook = XLSX.read(buffer, { type: 'buffer' });
	const sheets = workbook.SheetNames.map((name) =>
		splitSheet(
			name,
			XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: true, defval: '' })
		)
	);
	return parseRosterWorkbook(grade, sheets);
}

describe('the roster workbooks', () => {
	it('reads grade 7 whole, keeping the sheet a single misfiled row would lose', () => {
		const parsed = readFixture(7);

		// 20 class sheets and 2 summaries. `G7 Basic 5` holds one student whose
		// `ESL Group` reads `G7 Elementary 4`, which is a level change whose column
		// was not updated; before the majority rule that one row made the sheet look
		// like a summary and 19 students were discarded.
		expect(parsed.classes).toHaveLength(20);
		// The first summary's name is missing its ID header, and the second carries a
		// trailing space, exactly as the school's do.
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['Chinese class ', 'ESL Class ']);
		expect(parsed.rejected).toEqual([]);
		// 20 per class, plus the student listed on two of them (see #141).
		expect(parsed.students).toHaveLength(20 * 20 + 2);
	});

	it('reads grade 8 whole, keeping the sheet one typo would lose', () => {
		const parsed = readFixture(8);

		expect(parsed.classes).toHaveLength(20);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['Chinese Class', 'ESL Class ']);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(20 * 20);
	});

	it('reads grade 9 whole, and its malformed group does not split the sheet', () => {
		const parsed = readFixture(9);

		expect(parsed.classes).toHaveLength(20);
		// The first summary is headed entirely in Chinese, so the importer has to
		// find its columns without the English header names.
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['G9 Chinese', 'ESL Class ']);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(20 * 20);
	});

	it('reads grade 10 whole, one cohort per base class with both sections', () => {
		const parsed = readFixture(10);

		// The `Chinese Class` sheet restates the whole grade across 11 base classes,
		// so no class has a majority and it is set aside.
		expect(parsed.classes).toHaveLength(11);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['Chinese Class']);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(11 * 2 * 20);

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

	it('derives each levelled file year from its own IDs, and cannot for grade 10', () => {
		// The IDs keep their ROC prefix, so the year arithmetic runs for real.
		expect(readFixture(7).derivedYear).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 115
		});
		expect(readFixture(8).derivedYear).toMatchObject({ kind: 'current', entryYear: 114 });
		expect(readFixture(9).derivedYear).toMatchObject({ kind: 'current', entryYear: 113 });
		// Grade 10's ID space names no year, so the admin confirms it.
		expect(readFixture(10).derivedYear.kind).toBe('unsupported');
	});

	it('names both years when one workbook has two of them merged in', () => {
		// One whole class sheet re-prefixed to the previous intake year, which is
		// what saving last September's sheet into this year's file produces. Every
		// row is still readable and every sheet is still one class, so nothing else
		// in the parse changes — only the year arithmetic, which is what has to
		// catch it.
		const parsed = readFixture(7, { mergedYears: true });

		expect(parsed.derivedYear).toEqual({ kind: 'conflict', years: ['2025-2026', '2026-2027'] });
		// Still a full read, so the refusal is about the year and nothing else.
		expect(parsed.classes).toHaveLength(20);
		expect(parsed.rejected).toEqual([]);
	});

	it('files a misfiled student under the class their column names, not their sheet', () => {
		const parsed = readFixture(7);
		const flagged = parsed.classes.filter((sheet) => sheet.reason?.includes('class of record'));

		// The level change the workbook really contains, in G7 and G8 alike.
		expect(flagged.map((s) => s.sheetName)).toEqual(['G7 Basic 5']);
		expect(
			readFixture(8).classes.filter((s) => s.reason?.includes('class of record'))
		).toHaveLength(1);
		// And the flagged sheet is imported in full, not trimmed.
		const basic5 = flagged.find((s) => s.sheetName === 'G7 Basic 5')!;
		expect(basic5.parsed.students.length).toBeGreaterThan(1);
	});

	it('reads the bare Pre-Ele group as grade 7 pre-elementary class 1', () => {
		// The department runs one pre-elementary class and does not number it, so
		// the column holds `Pre-Ele` with no grade and no class number.
		const parsed = readFixture(7);
		const preEle = parsed.students.filter(
			(s) => !('baseClass' in s.group) && s.group.level === 'Pre-Elementary'
		);

		expect(preEle.length).toBeGreaterThan(0);
		for (const student of preEle) {
			expect(student.group).toEqual({ grade: 7, level: 'Pre-Elementary', classNumber: '1' });
		}
	});

	it('lists one grade 7 student on two class sheets, so the file cannot be applied', () => {
		// The real defect tracked in #141: one student appears on both
		// `G7 Elementary 2` and `G7 Pre-Elementary`. The plan blocks on it, because
		// applying would enrol them in one cohort and disable them in the other.
		const parsed = readFixture(7);
		const counts = new Map<string, number>();
		for (const student of parsed.students) {
			counts.set(student.schoolStudentId, (counts.get(student.schoolStudentId) ?? 0) + 1);
		}
		const duplicated = [...counts].filter(([, n]) => n > 1);

		expect(duplicated).toHaveLength(1);
	});
});
