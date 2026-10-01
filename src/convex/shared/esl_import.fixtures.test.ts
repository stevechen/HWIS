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
	/**
	 * The class sheets a file yields once its own disagreements are set aside.
	 *
	 * A grade 7 or 8 workbook contains exactly one sheet whose rows disagree with
	 * each other, and that sheet is now refused rather than imported with a warning
	 * (ADR-0025) — so it is neither a class nor a plain skip, it is a `misfiled`.
	 */
	function classSheets(grade: 7 | 8 | 9 | 10) {
		const parsed = readFixture(grade);
		return {
			parsed,
			classes: parsed.classes,
			misfiled: parsed.skipped.filter((sheet) => sheet.kind === 'misfiled')
		};
	}

	it('reads grade 7, setting aside the one sheet whose rows disagree', () => {
		const { parsed, misfiled } = classSheets(7);

		// 20 class sheets, less `G7 Basic 5`, which holds one student whose `ESL
		// Group` reads `G7 Elementary 4` — a level change whose column was not
		// updated. Before the majority rule that one row made the sheet look like a
		// summary and 19 students were discarded; now it is refused, because a wrong
		// ability band is silent and the department will fix the cell.
		expect(parsed.classes).toHaveLength(19);
		expect(misfiled.map((s) => s.sheetName)).toEqual(['G7 Basic 5']);
		// The three sheets set aside, and for three different reasons: the first has
		// no ID header at all, the second is a summary whose name carries a trailing
		// space, and the third disagrees with itself.
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual([
			'Chinese class ',
			'ESL Class ',
			'G7 Basic 5'
		]);
		// Rows are read the same either way; nothing here is a rejection.
		expect(parsed.rejected).toEqual([]);
	});

	it('reads grade 8, setting aside the one sheet whose rows disagree', () => {
		const { parsed, misfiled } = classSheets(8);

		expect(parsed.classes).toHaveLength(19);
		expect(misfiled.map((s) => s.sheetName)).toEqual(['G8 Inter 1']);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual([
			'Chinese Class',
			'ESL Class ',
			'G8 Inter 1'
		]);
		expect(parsed.rejected).toEqual([]);
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

	it('reads grade 10 whole, one cohort per base class and level', () => {
		const parsed = readFixture(10);

		// The `Chinese Class` sheet restates the whole grade across 11 base classes,
		// so no class has a majority and it is set aside.
		expect(parsed.classes).toHaveLength(11);
		expect(parsed.skipped.map((s) => s.sheetName)).toEqual(['Chinese Class']);
		expect(parsed.rejected).toEqual([]);
		expect(parsed.students).toHaveLength(11 * 2 * 20);

		// One cohort per (Chinese class, level): 11 base classes times A and B, each
		// holding one level's students. They were one cohort per base class when A
		// and B were read as sections, which put both ability bands into one roster
		// (ADR-0023).
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
		expect(cohorts.size).toBe(11 * 2);
		for (const [key, value] of cohorts) {
			// Each cohort is exactly one level, so exactly one section lands in it.
			expect(value.sections.size, `${key} should carry one level's section`).toBe(1);
			expect(value.count, `${key} should hold one level's students`).toBe(20);
			expect(key).not.toContain('undefined');
		}
	});

	it('derives every file year from its own IDs, grade 10 included', () => {
		// The levelled grades keep their ROC prefix, so the intake arithmetic runs
		// for real. Grade 10 names the school year itself, reversed, and lands on
		// the same answer from the other direction.
		expect(readFixture(7).derivedYear).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 115
		});
		expect(readFixture(8).derivedYear).toMatchObject({ kind: 'current', entryYear: 114 });
		expect(readFixture(9).derivedYear).toMatchObject({ kind: 'current', entryYear: 113 });
		// The fixture writes `511xxx`, which is ROC 115 reversed — 2026-2027, the
		// year these fixtures stand for. It used to be reported as `unsupported`,
		// which is what left the browser prompt as the only year check on a grade
		// 10 file.
		expect(readFixture(10).derivedYear).toEqual({
			kind: 'current',
			year: '2026-2027',
			entryYear: 115
		});
	});

	it('names both years when one workbook has two of them merged in', () => {
		// One whole class sheet re-prefixed to the previous intake year, which is
		// what saving last September's sheet into this year's file produces. Every
		// row is still readable and every sheet is still one class, so nothing else
		// in the parse changes — only the year arithmetic, which is what has to
		// catch it.
		const parsed = readFixture(7, { mergedYears: true });

		expect(parsed.derivedYear).toEqual({ kind: 'conflict', years: ['2025-2026', '2026-2027'] });
		// Still a full read, so the refusal is about the year and nothing else —
		// the same 19 sheets a clean grade 7 file yields, misfiled sheet aside.
		expect(parsed.classes).toHaveLength(19);
		expect(parsed.rejected).toEqual([]);
	});

	it('refuses the sheet whose rows disagree, naming the group to fix', () => {
		const { misfiled } = classSheets(7);

		// The level change the real workbooks contain, in G7 and G8 alike: one row
		// whose `ESL Group` names a class its sheet does not. It used to import,
		// filed by its own column, with a warning — but a wrong ability band is
		// silent, so the file is now refused until the cell is fixed (ADR-0025).
		expect(misfiled).toHaveLength(1);
		const sheet = misfiled[0];
		if (sheet.kind !== 'misfiled') throw new Error('expected a misfiled sheet');
		expect(sheet.sheetName).toBe('G7 Basic 5');
		// Both sides of the disagreement, so the admin can find the one cell: the
		// odd value and the class the rest of the sheet holds. Which one is the
		// odd one is decided by the majority, not asserted here.
		expect(sheet.reason).toContain('G7 Basic 5');
		expect(sheet.reason).toContain('G7 Elementary 4');
		expect(sheet.reason).toContain('ESL Group');
		// The rows are still read, so the admin can be told what the file held —
		// they are simply never applied.
		expect(sheet.parsed.students.length).toBeGreaterThan(1);

		expect(readFixture(8).skipped.filter((s) => s.kind === 'misfiled')).toHaveLength(1);
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
