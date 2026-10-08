import { browser } from '$app/environment';
import type { DerivedSchoolYear, RosterStudent } from '$convex/shared/esl_import';

/**
 * One grade's file, parsed and waiting. Nothing is written to the database while
 * a file is in this state.
 */
export type StagedGrade = {
	grade: number;
	fileName: string;
	stagedAt: number;
	students: RosterStudent[];
	/** A sheet set aside, and why — the summary sheets the workbooks carry. */
	skipped: { sheetName: string; kind: string; reason: string }[];
	/** A row that could not be read, with the Excel line it came from. */
	rejected: { sheetName: string; rowNumber: number; reason: string }[];
	/** What the file's own IDs say about the school year. */
	derivedYear: DerivedSchoolYear;
};

/** A grade whose file has been applied, kept so the year view has a timestamp. */
export type ImportedGrade = {
	grade: number;
	fileName: string;
	appliedAt: number;
	added: number;
	moved: number;
	renamed: number;
	/** Students whose Chinese class changed, which the import applied unreviewed. */
	rehomed: number;
	disabled: number;
	/** Renames the admin did not approve, so the summary can say what was kept. */
	declinedRenames: string[];
};

export type GradeEntry =
	| { status: 'staged'; draft: StagedGrade }
	| { status: 'imported'; result: ImportedGrade };

/**
 * Everything held for one school year.
 *
 * `localStorage` rather than a Convex table (ADR-0022): a table would mean writing
 * ~2,000 parsed students to hold a draft that is applied moments later or thrown
 * away. The parsed rows are kept; the file's bytes are not — an `.xlsx` is large
 * and worthless once read.
 */
export type YearDraft = { year: string; grades: Record<string, GradeEntry> };

/** Drafts are namespaced by school year so last year's draft is not this year's. */
export function draftKey(year: string): string {
	return `esl-import:${year}`;
}

function emptyDraft(year: string): YearDraft {
	return { year, grades: {} };
}

/**
 * The stored draft for a year, or an empty one.
 *
 * Every access is guarded because `localStorage` throws rather than returning null
 * in a private window, and a full quota should cost the admin their draft, not the
 * page.
 */
export function readYearDraft(year: string): YearDraft {
	if (!browser) return emptyDraft(year);
	try {
		const raw = window.localStorage.getItem(draftKey(year));
		if (raw === null) return emptyDraft(year);
		const parsed: unknown = JSON.parse(raw);
		return isYearDraft(parsed, year) ? parsed : emptyDraft(year);
	} catch {
		return emptyDraft(year);
	}
}

/** Reads back only what is known to be usable, so a hand-edited value cannot crash the page. */
function isYearDraft(value: unknown, year: string): value is YearDraft {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<YearDraft>;
	return (
		candidate.year === year && typeof candidate.grades === 'object' && candidate.grades !== null
	);
}

/** Replaces one grade's entry, leaving the other grades of the year alone. */
export function writeEntry(year: string, grade: number, entry: GradeEntry): void {
	const draft = readYearDraft(year);
	draft.grades[String(grade)] = entry;
	persist(year, draft);
}

/** Drops one grade — used when a file is replaced, or a draft is abandoned. */
export function clearEntry(year: string, grade: number): void {
	const draft = readYearDraft(year);
	delete draft.grades[String(grade)];
	persist(year, draft);
}

function persist(year: string, draft: YearDraft): void {
	if (!browser) return;
	try {
		if (Object.keys(draft.grades).length === 0) {
			window.localStorage.removeItem(draftKey(year));
			return;
		}
		window.localStorage.setItem(draftKey(year), JSON.stringify(draft));
	} catch {
		// A draft that will not persist is still usable for this session; the admin
		// simply cannot come back to it, which the page does not claim otherwise.
	}
}

/** The four grades an import covers, for the year-status view. */
export const IMPORT_GRADES = [7, 8, 9, 10] as const;

/**
 * The school year a date falls in.
 *
 * The year changes in September, when the intake arrives, so anything from August
 * onwards belongs to the year that has just begun. The convention is the one the
 * school's IDs use: `115xxxx` is a 2026-27 grade 7.
 */
export function schoolYearOf(date: Date): string {
	const year = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
	return `${year}-${year + 1}`;
}
