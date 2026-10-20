import { addDays } from './wizard-dates';
import type { PreviewRow } from './wizard-save';

/**
 * Step 5 block axis (#Mod wizard Step 5).
 *
 * The "All events" list is ordered by ESL block and then by date. Blocks are
 * the same exam-anchored windows Step 4 uses (`blockOf` / `blockWindows`), but
 * here they are DERIVED FROM DATES rather than row ids, so every event — a
 * holiday, a school event, a custom banner — lands in the block its date falls
 * into instead of staying in a source group.
 *
 * Exams are part of the block they close: Exam 1 → Block 1, Exam 2 → Block 2,
 * Final → Block 3. They get no section of their own; the list is:
 *
 *   Block 1 → Block 2 → Block 3 → After Final
 *
 * Only the days after the Final (when the term runs on) need their own
 * section. Range events (a banner 10/20–11/30, a quiz window) group by START
 * date: one row, one home, the full range still displayed.
 *
 * Missing exam anchors (mid-configuration Step 3) collapse the axis to a flat
 * date-sorted list — Step 5 must stay usable before exams are set.
 */

export type PreviewSectionKind = 'block' | 'after' | 'other' | 'flat';

export interface PreviewSection {
	key: string;
	kind: PreviewSectionKind;
	label: string;
	start: string | null;
	end: string | null;
	events: PreviewRow[];
}

export interface PreviewSections {
	/** False when exam anchors are missing → flat date sort, no alignment. */
	aligned: boolean;
	sections: PreviewSection[];
}

interface ExamAnchors {
	label: string;
	dates: readonly string[];
}

interface SectionWindow {
	key: string;
	kind: PreviewSectionKind;
	label: string;
	start: string;
	end: string;
}

interface OrderedRow {
	row: PreviewRow;
	index: number;
}

function sortByDate(items: readonly OrderedRow[]): PreviewRow[] {
	return [...items]
		.sort((a, b) => {
			if (a.row.date === b.row.date) return a.index - b.index;
			return a.row.date < b.row.date ? -1 : 1;
		})
		.map((item) => item.row);
}

function examBounds(
	exams: readonly ExamAnchors[],
	label: string
): { first: string; last: string } | null {
	const dates = [...(exams.find((exam) => exam.label === label)?.dates ?? [])].sort();
	const first = dates[0];
	const last = dates[dates.length - 1];
	if (first === undefined || last === undefined) return null;
	return { first, last };
}

/** `10/20` — the list drops weekday text (and the year) to stay one line. */
export function formatShortDate(date: string): string {
	const [, month, day] = date.split('-');
	if (month === undefined || day === undefined) return '';
	return `${Number(month)}/${Number(day)}`;
}

/** `10/20–10/24`, or a single `10/20`. */
export function formatPreviewDateRange(start: string, end?: string): string {
	if (end === undefined || end === start) return formatShortDate(start);
	return `${formatShortDate(start)}–${formatShortDate(end)}`;
}

/** `10/20 – 11/14` (block header). */
export function formatSectionRange(section: Pick<PreviewSection, 'start' | 'end'>): string {
	if (section.start === null) return '';
	if (section.end === null) return formatShortDate(section.start);
	return `${formatShortDate(section.start)} – ${formatShortDate(section.end)}`;
}

export function buildPreviewSections(
	rows: readonly PreviewRow[],
	exams: readonly ExamAnchors[],
	startDate: string | null,
	endDate: string | null
): PreviewSections {
	const ordered = rows.map((row, index) => ({ row, index }));

	const e1 = examBounds(exams, 'Exam 1');
	const e2 = examBounds(exams, 'Exam 2');
	const fin = examBounds(exams, 'Final');

	if (startDate === null || e1 === null || e2 === null || fin === null) {
		return {
			aligned: false,
			sections: [
				{
					key: 'all',
					kind: 'flat',
					label: '',
					start: startDate,
					end: endDate,
					events: sortByDate(ordered)
				}
			]
		};
	}

	const windows: SectionWindow[] = [
		// Each block closes on its exam, so exam rows need no separate section.
		{ key: 'block-1', kind: 'block', label: 'Block 1', start: startDate, end: e1.last },
		{ key: 'block-2', kind: 'block', label: 'Block 2', start: addDays(e1.last, 1), end: e2.last },
		{ key: 'block-3', kind: 'block', label: 'Block 3', start: addDays(e2.last, 1), end: fin.last }
	];

	const afterStart = addDays(fin.last, 1);
	const afterEnd = endDate ?? fin.last;
	if (afterStart <= afterEnd) {
		windows.push({
			key: 'after-final',
			kind: 'after',
			label: 'After Final',
			start: afterStart,
			end: afterEnd
		});
	}

	// Guard against inverted windows from adjacent exam dates.
	const valid = windows.filter((window) => window.start <= window.end);

	const buckets = new Map<string, OrderedRow[]>();
	const unplaced: OrderedRow[] = [];
	for (const item of ordered) {
		const window = valid.find(
			(candidate) => item.row.date >= candidate.start && item.row.date <= candidate.end
		);
		if (window === undefined) {
			unplaced.push(item);
		} else {
			const bucket = buckets.get(window.key);
			if (bucket === undefined) buckets.set(window.key, [item]);
			else bucket.push(item);
		}
	}

	const sections: PreviewSection[] = [];
	for (const window of valid) {
		const items = buckets.get(window.key) ?? [];
		// Blocks always render (an empty block is useful information before
		// saving); the trailing tail only when it has rows.
		if (window.kind === 'after' && items.length === 0) continue;
		sections.push({
			key: window.key,
			kind: window.kind,
			label: window.label,
			start: window.start,
			end: window.end,
			events: sortByDate(items)
		});
	}

	if (unplaced.length > 0) {
		sections.push({
			key: 'other',
			kind: 'other',
			label: 'Other events',
			start: null,
			end: null,
			events: sortByDate(unplaced)
		});
	}

	return { aligned: true, sections };
}
