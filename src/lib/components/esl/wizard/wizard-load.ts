import {
	ESL_LOCKED_NOTES,
	ESL_REMINDER_TITLES,
	EXAM_SEED_WEEKDAYS,
	expandExamDays,
	isChecklistDraftEvent,
	type EslEventType,
	type EslReminderKind
} from '$convex/shared/esl';
import { addDays, CLIL_CLASS_WEEKDAYS, isWeekend, weekdayOf, type Term } from './wizard-dates';
import type {
	WizardCustomEvent,
	WizardEventEdit,
	WizardExamRange,
	WizardExtraOff,
	WizardOffDay,
	WizardState
} from './wizard-state';

/**
 * Saved semester → WizardState reverse mapping (ticket #254, spec #252).
 *
 * The edit wizard opens on what already exists, so everything a semester
 * row plus its `events.listBySemester` rows can say about the wizard has to
 * fold back into one `WizardState`. The mapping is asymmetric by design —
 * `wizard-save` chose what to keep — and this module never guesses silently:
 * every recovery that leans on a convention instead of stored data lands in
 * an `inferred` entry the edit shell can tag inline (no blocking modal).
 *
 * Exact recovery (the save kept the fields):
 * - exams — grouped by `examGroup` (title fallback for pre-field rows),
 *   anchor = min date, fan re-derived with `expandExamDays` over the
 *   semester's no-school and other-exam days, exactly what the save wrote;
 * - singles — by the locked note strings `'Anniversary'`,
 *   `'Anniversary makeup'`, `'Sports Day'`, `'Graduation'` (target `G9`),
 *   `'BBQ from 12:00'`;
 * - start window — the semester row's `startDate` (start-of-school rows
 *   that disagree are left for the unmatched report);
 * - `pcheck` / `wcheck` — one window each, by reminder kind.
 *
 * Inferred recovery (shape lost at save, re-derived by convention):
 * - quiz / due windows — ordinals by first-date order (`q1..q6`,
 *   `pd1..pd3`, `rd1..rd3`); a quiz row whose saved title deviates from
 *   `Quiz N` is reported separately, because re-saving regenerates the
 *   conventional title. Window interiors are not stored — they re-derive as
 *   the skip-filtered days between the stored endpoints (CLIL days for
 *   quizzes, school days for dues and checks);
 * - checklist drafts never load: `Unit N` task drafts and
 *   `Unit N Quiz Due` quiz drafts are shapes only `checklist.createMissing`
 *   writes, so the loader consumes them silently (no inferred tag) and the
 *   reconcile leaves them untouched. Named off-day drafts load like wizard
 *   off days; a caption-less draft stays a nameless Step 2 off day rather
 *   than a named multi-day extra (which the save would refuse);
 * - mock pairs — two row-adjacent rows per slot (`g9_mock` writes no
 *   grouping marker);
 * - extras — no-school rows that share a note and stay calendar-contiguous
 *   become one `start..end` extra; single-day runs are indistinguishable
 *   from wizard-typed off days and land in step 2 (identical writes);
 * - customs — banners (ranged task reminders) and meetings (task, partial
 *   and no-class rows) reverse-mapped best effort; rows carry no custom id,
 *   so `custom-N` ids regenerate in date order.
 *
 * Sports Day semantics (documented choice): `sportsOn` is true only when a
 * row with the locked note `'Sports Day'` exists — a save with
 * `sportsOn: true` always writes that row (the Step 4 gate requires it), so
 * its absence means sports was turned off. A renamed Sports Day row cannot
 * be told apart from a custom no-class meeting; it reverse-maps to one.
 *
 * Never throws: rows that fit no slot (beyond six quizzes, unknown exam
 * titles, nameless leftovers, stray duplicates) surface as
 * `unmatched-event` entries. `step2.endDate` is derived the way the read
 * side does (max exam day — saves never store it) and `holidaysImported`
 * is always `false` (not stored); `eventEdits` stays empty because a save
 * folds edits into the rows themselves.
 */

export type WizardInferredKind =
	| 'reminder-ordinal'
	| 'renamed-quiz-title'
	| 'mock-adjacency'
	| 'extra-grouping'
	| 'custom-event'
	| 'unmatched-event';

export interface WizardInferredEntry {
	kind: WizardInferredKind;
	/** The wizard edit key the affected state feeds, e.g. `step4:ranges:q2`. */
	eventKey?: string;
	/** The source row id, when the caller supplied one. */
	id?: string;
	/** Human sentence for the inline tag and the change summary. */
	detail: string;
}

export interface InferredReport {
	entries: WizardInferredEntry[];
}

/** The semester fields the reverse mapping reads. */
export interface WizardSemesterSource {
	/** School year `YYYY-YYYY`. */
	year: string;
	term: Term;
	startDate: string;
	/** The real `_id`, echoed into `state.semesterId` when present. */
	id?: string;
}

/**
 * The event fields the reverse mapping reads — a structural slice of an
 * `esl_events` row, so callers can pass query results straight through.
 */
export interface WizardEventSource {
	id?: string;
	type: EslEventType;
	title: string;
	target: string;
	date: string;
	endDate?: string;
	note?: string;
	reminderKind?: EslReminderKind;
	examGroup?: string;
}

export interface WizardLoadResult {
	state: WizardState;
	inferred: InferredReport;
}

const QUIZ_SLOTS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
const PASSPORT_SLOTS = ['pd1', 'pd2', 'pd3'] as const;
const RECORDING_SLOTS = ['rd1', 'rd2', 'rd3'] as const;
const MOCK_SLOTS = ['mock1', 'mock2', 'mock3'] as const;

type RangeKey =
	| (typeof QUIZ_SLOTS)[number]
	| (typeof PASSPORT_SLOTS)[number]
	| (typeof RECORDING_SLOTS)[number]
	| 'pcheck'
	| 'wcheck';
type MockSlot = (typeof MOCK_SLOTS)[number];

/** Backend exam title → Step 3 slot label (`Final Exam` loads as `Final`). */
const EXAM_LABELS: Record<string, 'Exam 1' | 'Exam 2' | 'Final'> = {
	'Exam 1': 'Exam 1',
	'Exam 2': 'Exam 2',
	'Final Exam': 'Final'
};

/** The note strings singles recover from (locked at save, see module docs). */
const LOCKED_SINGLE_NOTES = new Set<string>(Object.values(ESL_LOCKED_NOTES));

const TARGET_VALUES = ['all', 'CLIL', 'Comm', 'G7', 'G8', 'G9', 'H1'] as const;
type LoaderTarget = Exclude<(typeof TARGET_VALUES)[number], never>;

function isLoaderTarget(value: string): value is LoaderTarget {
	return (TARGET_VALUES as readonly string[]).includes(value);
}

/** First matching row plus every same-shaped row beyond the one slot. */
interface SingleHit {
	first: WizardEventSource | undefined;
	dupes: WizardEventSource[];
}

function firstHit(
	pool: readonly WizardEventSource[],
	match: (row: WizardEventSource) => boolean
): SingleHit {
	const hits = pool.filter(match);
	return { first: hits[0], dupes: hits.slice(1) };
}

function describeRow(row: WizardEventSource): string {
	const kind = row.type === 'reminder' ? (row.reminderKind ?? 'reminder') : row.type;
	return `${kind} row "${row.title}"`;
}

function unmatchedDetail(row: WizardEventSource): string {
	const span = row.endDate === undefined ? row.date : `${row.date}–${row.endDate}`;
	return `${describeRow(row)} on ${span} fits no wizard slot — saving leaves it in place (only wizard-owned rows are reconciled).`;
}

/**
 * Why a leftover row cannot become a custom banner / meeting: custom events
 * need text for their banner, and a locked notes single-shape leftover is
 * a mangled singles slot, not something the admin typed.
 */
function leftoverRefusal(row: WizardEventSource): string | null {
	if ((row.note ?? row.title).trim() === '') {
		return `${describeRow(row)} on ${row.date} has no note — a custom event needs text for its title.`;
	}
	if (row.type !== 'reminder' && LOCKED_SINGLE_NOTES.has(row.note ?? '')) {
		return `${describeRow(row)} on ${row.date} carries the locked note "${row.note}" with an unexpected shape — singles slots recover by locked note strings.`;
	}
	return null;
}

/**
 * The interior dates of a saved reminder window: the skip-filtered days
 * between its stored endpoints. Endpoints always survive so a hand-shaped
 * window still re-saves at its stored dates.
 */
function windowDays(
	first: string,
	last: string,
	skip: ReadonlySet<string>,
	clilOnly: boolean
): string[] {
	if (last <= first) return [first];
	const days: string[] = [];
	for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
		if (isWeekend(cursor)) continue;
		if (skip.has(cursor)) continue;
		if (clilOnly && !CLIL_CLASS_WEEKDAYS.includes(weekdayOf(cursor))) continue;
		days.push(cursor);
	}
	if (days.length === 0) return [first, last];
	if (days[0] !== first) days.unshift(first);
	if (days[days.length - 1] !== last) days.push(last);
	return days;
}

/** Maximal calendar-contiguous runs of an ascending date list. */
function contiguousRuns(dates: readonly string[]): string[][] {
	const runs: string[][] = [];
	let run: string[] = [];
	for (const date of dates) {
		const prev = run[run.length - 1];
		if (prev === undefined || addDays(prev, 1) === date) {
			run.push(date);
		} else {
			runs.push(run);
			run = [date];
		}
	}
	if (run.length > 0) runs.push(run);
	return runs;
}

export function loadWizardState(
	semester: WizardSemesterSource,
	events: readonly WizardEventSource[]
): WizardLoadResult {
	const rows = [...events].sort((a, b) => a.date.localeCompare(b.date));
	const entries: WizardInferredEntry[] = [];
	const used = new Set<WizardEventSource>();
	const use = (row: WizardEventSource): void => {
		used.add(row);
	};
	/** Report + consume: an unexplained row is state the reload chose to name. */
	const unmatched = (row: WizardEventSource, detail?: string): void => {
		use(row);
		entries.push({
			kind: 'unmatched-event',
			id: row.id,
			detail: detail ?? unmatchedDetail(row)
		});
	};

	const examRows = rows.filter((row) => row.type === 'exam');
	const offRows = rows.filter((row) => row.type === 'no_school');
	const noClassRows = rows.filter((row) => row.type === 'no_class');
	const partialRows = rows.filter((row) => row.type === 'partial');
	// Checklist drafts are consumed first, silently: they are real rows the
	// wizard must preserve, and none of them fits a wizard-owned slot.
	for (const row of rows.filter(isChecklistDraftEvent)) use(row);
	const reminderRows = rows.filter((row) => row.type === 'reminder' && !used.has(row));
	const mockRows = rows.filter((row) => row.type === 'g9_mock');

	// ---- Start window: the semester row is the truth; a start-of-school
	// row on another date is what the change summary should flag.
	for (const row of rows.filter((row) => row.type === 'start_school')) {
		if (row.date !== semester.startDate) {
			unmatched(
				row,
				`Start-of-school row sits on ${row.date}, not the semester start ${semester.startDate}.`
			);
		} else {
			use(row);
		}
	}

	const offDates = new Set(offRows.map((row) => row.date));
	const examDates = new Set(examRows.map((row) => row.date));
	/** Window-interior skip set (weekends handled separately). */
	const skipSet = new Set([...offDates, ...examDates]);

	// ---- Step 3: exams grouped by `examGroup` (the title reads through on
	// pre-field rows), anchor = min date, fan re-derived exactly as the save
	// wrote it — `expandExamDays` skips no-school and other-exam days.
	const examKeyOf = (row: WizardEventSource): string => row.examGroup ?? row.title;
	const examGroups = new Map<string, WizardEventSource[]>();
	for (const row of examRows) {
		const key = examKeyOf(row);
		const group = examGroups.get(key) ?? [];
		group.push(row);
		examGroups.set(key, group);
	}
	const exams: WizardExamRange[] = [];
	for (const [groupTitle, group] of examGroups) {
		const label = EXAM_LABELS[groupTitle];
		const dayCount = EXAM_SEED_WEEKDAYS[groupTitle];
		if (label === undefined || dayCount === undefined) {
			for (const row of group) {
				unmatched(row, `Only Exam 1, Exam 2 and Final Exam load into the wizard.`);
			}
			continue;
		}
		const anchor = group[0].date;
		if (anchor === undefined) continue;
		const skip = new Set(offDates);
		for (const row of examRows) {
			if (examKeyOf(row) !== groupTitle) skip.add(row.date);
		}
		for (const row of group) use(row);
		exams.push({ label, dates: expandExamDays({ startDate: anchor, dayCount, offDates: skip }) });
	}

	// ---- Step 4 singles: locked note strings, first row wins.
	const singles: WizardState['step4']['singles'] = {
		anniv: null,
		makeup: null,
		sports: null,
		grad: null,
		bbq: null
	};
	const take = (hit: SingleHit, slot: keyof typeof singles, label: string): void => {
		if (hit.first === undefined) return;
		use(hit.first);
		singles[slot] = hit.first.date;
		for (const dupe of hit.dupes) {
			unmatched(dupe, `Second row for ${label} on ${dupe.date} — the slot holds exactly one date.`);
		}
	};
	take(
		firstHit(noClassRows, (r) => r.note === 'Anniversary'),
		'anniv',
		'Anniversary'
	);
	// Anniversary makeup is a no-school row — it closes school, not class.
	take(
		firstHit(offRows, (r) => r.note === 'Anniversary makeup'),
		'makeup',
		'Anniversary makeup'
	);
	take(
		firstHit(noClassRows, (r) => r.note === 'Sports Day'),
		'sports',
		'Sports Day'
	);
	take(
		firstHit(noClassRows, (r) => r.note === 'Graduation' && r.target === 'G9'),
		'grad',
		'Graduation'
	);
	take(
		firstHit(partialRows, (r) => r.note === 'BBQ from 12:00'),
		'bbq',
		'BBQ from 12:00'
	);
	// Documented choice: sports is on only while its locked row exists.
	const sportsOn = singles.sports !== null;

	// ---- Step 4 mocks: two row-adjacent rows per slot, pairing by
	// adjacency only — the save writes no grouping marker.
	const pairs: WizardState['step4']['pairs'] = { mock1: null, mock2: null, mock3: null };
	let mockIndex = 0;
	for (let i = 0; i < mockRows.length;) {
		const first = mockRows[i];
		const second = mockRows[i + 1];
		const adjacent = second !== undefined && addDays(first.date, 1) === second.date;
		const slot = MOCK_SLOTS[mockIndex] as MockSlot | undefined;
		if (adjacent && slot !== undefined && second !== undefined) {
			pairs[slot] = [first.date, second.date];
			use(first);
			use(second);
			entries.push({
				kind: 'mock-adjacency',
				eventKey: `step4:pairs:${slot}`,
				id: first.id,
				detail: `Paired ${first.date}–${second.date} by row adjacency — mock pairs have no stored group.`
			});
			mockIndex += 1;
			i += 2;
		} else if (adjacent && slot === undefined && second !== undefined) {
			unmatched(first, `A fourth mock pair would exceed the wizard's three slots.`);
			unmatched(second, `A fourth mock pair would exceed the wizard's three slots.`);
			i += 2;
		} else {
			unmatched(
				first,
				`G9 mock day ${first.date} has no adjacent partner — mock pairs are two consecutive single-date rows.`
			);
			i += 1;
		}
	}

	// ---- Step 4 ranges: pcheck/wcheck exactly (one each), quiz and due
	// ordinals by first-date order. The save keeps only the endpoints, so
	// interiors re-derive per kind between them.
	const ranges: Record<RangeKey, string[] | null> = {
		q1: null,
		q2: null,
		q3: null,
		q4: null,
		q5: null,
		q6: null,
		pd1: null,
		pd2: null,
		pd3: null,
		rd1: null,
		rd2: null,
		rd3: null,
		pcheck: null,
		wcheck: null
	};
	const loadCheck = (kind: EslReminderKind, slot: 'pcheck' | 'wcheck', title: string): void => {
		const hits = reminderRows.filter((row) => row.reminderKind === kind);
		if (hits[0] === undefined) return;
		use(hits[0]);
		ranges[slot] = windowDays(hits[0].date, hits[0].endDate ?? hits[0].date, skipSet, false);
		for (const dupe of hits.slice(1)) {
			used.add(dupe);
			unmatched(dupe, `Second ${title} row on ${dupe.date} — the slot holds exactly one window.`);
		}
	};
	loadCheck('passport_check', 'pcheck', ESL_REMINDER_TITLES.passport_check);
	loadCheck('workbook_check', 'wcheck', ESL_REMINDER_TITLES.workbook_check);

	const loadOrdinals = (
		slots: readonly string[],
		rows: WizardEventSource[],
		renamable: boolean,
		kindLabel: string
	): void => {
		rows.forEach((row, index) => {
			const slot = slots[index];
			use(row);
			if (slot === undefined) {
				unmatched(
					row,
					`More than ${slots.length} ${kindLabel} windows — the wizard holds ${slots.length} slots.`
				);
				return;
			}
			ranges[slot as RangeKey] = windowDays(
				row.date,
				row.endDate ?? row.date,
				skipSet,
				slot.startsWith('q')
			);
			entries.push({
				kind: 'reminder-ordinal',
				eventKey: `step4:ranges:${slot}`,
				id: row.id,
				detail: 'Window ordinals are not stored — numbered by first-date order on reload.'
			});
			const expected = slot.startsWith('q')
				? `Quiz ${index + 1}`
				: ESL_REMINDER_TITLES[slot.startsWith('pd') ? 'passport' : 'recording'];
			if (renamable && row.title !== expected) {
				entries.push({
					kind: 'renamed-quiz-title',
					eventKey: `step4:ranges:${slot}`,
					id: row.id,
					detail: `Saved title "${row.title}" does not match the wizard's "${expected}" — re-saving renames it back.`
				});
			}
		});
	};
	loadOrdinals(
		QUIZ_SLOTS,
		reminderRows.filter((r) => r.reminderKind === 'quiz'),
		true,
		'quiz'
	);
	loadOrdinals(
		PASSPORT_SLOTS,
		reminderRows.filter((r) => r.reminderKind === 'passport'),
		false,
		'passport due'
	);
	loadOrdinals(
		RECORDING_SLOTS,
		reminderRows.filter((r) => r.reminderKind === 'recording'),
		false,
		'recording due'
	);

	// ---- Step 2 off days + Step 4 extras: every no-school row left after
	// the makeup single. A contiguous run of ≥2 rows sharing one note is a
	// named extra range (the save expands one row per calendar day,
	// weekends included); a single-day run is indistinguishable from a
	// wizard-typed off day and lands in step 2 — identical writes either way.
	const leftoverOff = offRows.filter((row) => !used.has(row));
	const offByName = new Map<string, WizardEventSource[]>();
	for (const row of leftoverOff) {
		const key = row.note ?? '';
		const group = offByName.get(key) ?? [];
		group.push(row);
		offByName.set(key, group);
	}
	const extras: WizardExtraOff[] = [];
	const offDays: WizardOffDay[] = [];
	for (const [name, group] of offByName) {
		// A caption-less draft has no note to name an extra with; each row
		// stays a Step 2 off day so the save never throws on a blank name.
		if (name.trim() === '') {
			for (const row of group) {
				use(row);
				offDays.push({ date: row.date, name });
			}
			continue;
		}
		for (const run of contiguousRuns(group.map((row) => row.date))) {
			const start = run[0];
			const end = run[run.length - 1];
			if (start === undefined) continue;
			for (const row of group) {
				if (row.date >= start && row.date <= end) use(row);
			}
			if (run.length >= 2) {
				extras.push({ id: '', name, start, end: end === start ? null : end });
			} else {
				offDays.push({ date: start, name });
			}
		}
	}
	offDays.sort((a, b) => a.date.localeCompare(b.date));
	extras.sort((a, b) => a.start.localeCompare(b.start));
	extras.forEach((extra, index) => {
		extra.id = `extra-${index + 1}`;
		entries.push({
			kind: 'extra-grouping',
			eventKey: `step4:extra:${extra.id}`,
			detail: `Grouped ${extra.end === null ? 'one day' : `${extra.start}–${extra.end}`} of no-school rows named "${extra.name}" by shared note + contiguous dates — grouping is inferred, not stored.`
		});
	});

	// ---- Step 5 customs: banner/task reminders plus partial and no-class
	// leftovers, in date order, ids regenerated as custom-N.
	const eventEdits: WizardEventEdit[] = [];
	const customs: WizardCustomEvent[] = [];
	const customCandidates = [
		...reminderRows.filter((row) => row.reminderKind === 'task'),
		...noClassRows,
		...partialRows
	]
		.filter((row) => !used.has(row))
		.sort((a, b) => a.date.localeCompare(b.date));
	let customIndex = 0;
	for (const row of customCandidates) {
		const refusal = leftoverRefusal(row);
		if (refusal !== null) {
			used.add(row);
			unmatched(row, refusal);
			continue;
		}
		use(row);
		const id = `custom-${++customIndex}`;
		const target = isLoaderTarget(row.target) && row.target !== 'all' ? { target: row.target } : {};
		if (row.type === 'reminder') {
			if (row.endDate !== undefined) {
				customs.push({
					id,
					type: 'banner',
					startDate: row.date,
					endDate: row.endDate,
					bannerText: row.title,
					...(row.note !== undefined && row.note !== row.title ? { note: row.note } : {}),
					...target
				});
			} else {
				customs.push({
					id,
					type: 'meeting',
					date: row.date,
					subType: 'task',
					note: row.note ?? row.title,
					...target
				});
			}
		} else {
			customs.push({
				id,
				type: 'meeting',
				date: row.date,
				...(row.type === 'partial' ? { subType: 'partial' as const } : {}),
				note: row.note ?? row.title,
				...target
			});
		}
		entries.push({
			kind: 'custom-event',
			eventKey: `custom:${id}`,
			id: row.id,
			detail: `Best-effort reverse mapping from a ${describeRow(row)}; the custom id regenerates as ${id}.`
		});
	}

	// Anything still unaccounted for lands in the report rather than vanishing.
	for (const row of rows) {
		if (!used.has(row)) unmatched(row);
	}

	// ---- Step 2 end: derived the way the read side does (max exam day) —
	// saves never store an end date.
	const derivedEndDate = examRows.reduce<string | null>(
		(max, row) => (max === null || row.date > max ? row.date : max),
		null
	);

	const state: WizardState = {
		currentStep: 5,
		semesterId: semester.id ?? null,
		step1: {
			term: semester.term,
			schoolYear: semester.year,
			startDate: semester.startDate
		},
		step2: { endDate: derivedEndDate, offDays, holidaysImported: false },
		step3: { exams },
		step4: { singles, pairs, ranges, sportsOn, extras },
		step5: { customEvents: customs, eventEdits }
	};
	return { state, inferred: { entries } };
}
