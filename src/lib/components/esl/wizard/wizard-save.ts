import type {
	WizardCustomEvent,
	WizardEventEdit,
	WizardState,
	WizardStep4State
} from './wizard-state';
import { collectClassDays, EXAM_SLOT_CLASS_DAYS } from './wizard-dates';
import type { EslEventTarget, EslReminderKind } from '$convex/shared/esl';

/**
 * Step 5 save + preview mapping (ticket #223, spec #215 stories 27–30).
 *
 * ONE module owns both directions so preview and save can never disagree:
 * - `buildPreviewRows` feeds the Step 5 calendar + event list (display).
 * - `buildSavePayload` feeds `esl.wizards.saveSemester` (DB writes).
 * Both read the same row descriptors below; the backend mirrors the
 * title/target mapping (see `src/convex/esl/wizards.ts`) and re-validates
 * every row at insert time.
 *
 * Inline-edit semantics (documented, ticket #223):
 * - Single-date rows (start, off days, school singles, single customs):
 *   date/note apply directly.
 * - Multi-date rows (mock pairs, reminder ranges): a date edit SHIFTS the
 *   whole array by (newDate − oldFirst), preserving shape; an explicit end
 *   date replaces the shifted last day. Custom banners take both endpoints
 *   directly.
 * - Exam rows (one row per label): a date edit re-anchors the whole range
 *   (re-fanned locally for preview and from the anchor at save — Step 3
 *   stays the home of exam moves with gates).
 */

export type SaveRowSource = 'step1' | 'step2' | 'step3' | 'step4' | 'step5';

export interface PreviewRow {
	key: string;
	type: 'start_school' | 'reminder' | 'no_school' | 'no_class' | 'partial' | 'exam' | 'g9_mock';
	reminderKind?: EslReminderKind;
	isBanner?: boolean;
	title: string;
	date: string;
	endDate?: string;
	note?: string;
	target: EslEventTarget;
	source: SaveRowSource;
	editable: boolean;
	examGroup?: string;
	customId?: string;
}

export interface SaveExamRange {
	label: 'Exam 1' | 'Exam 2' | 'Final';
	dates: string[];
}

export interface SavePayload {
	year: string;
	term: 'S1' | 'S2';
	startDate: string;
	offDays: { date: string; name: string }[];
	exams: SaveExamRange[];
	singles: {
		anniv: string | null;
		makeup: string | null;
		sports: string | null;
		grad: string | null;
		bbq: string | null;
	};
	sportsOn: boolean;
	// Named extra no-school days (folded from the seed #229): spring-break
	// ranges, ad-hoc days off, and explicit lunar fallbacks when the gov
	// import has no row. Expanded per calendar day at save.
	extras: { name: string; startDate: string; endDate?: string }[];
	pairs: {
		mock1: string[] | null;
		mock2: string[] | null;
		mock3: string[] | null;
	};
	ranges: Record<
		| 'q1'
		| 'q2'
		| 'q3'
		| 'q4'
		| 'q5'
		| 'q6'
		| 'pd1'
		| 'pd2'
		| 'pd3'
		| 'rd1'
		| 'rd2'
		| 'rd3'
		| 'pcheck'
		| 'wcheck',
		string[] | null
	>;
	customs: WizardCustomEvent[];
	e2eTag?: string;
}

interface RowDescriptor {
	key: string;
	type: PreviewRow['type'];
	reminderKind?: EslReminderKind;
	title: string;
	dates: string[];
	note?: string;
	target: EslEventTarget;
	source: SaveRowSource;
	editable: boolean;
	examGroup?: string;
	customId?: string;
}

function dayDiffDays(from: string, to: string): number {
	const day = (value: string) => new Date(`${value}T12:00:00`).getTime();
	return Math.round((day(to) - day(from)) / 86400000);
}

/**
 * Find an exam day inside a ranged-reminder window: `events.create` lets a
 * reminder step over a no-school day (a quiz week that loses its Friday to a
 * holiday reaches into the next week), but never over an exam. Weekends are
 * fine; mock pairs occupy single dates and exams re-fan around skips, so only
 * reminder windows qualify.
 */
function straddlesBlocked(first: string, last: string, blocked: Set<string>): string | null {
	let cursor = addDaysLocal(first, 1);
	while (cursor < last) {
		if (blocked.has(cursor)) return cursor;
		cursor = addDaysLocal(cursor, 1);
	}
	return null;
}

function addDaysLocal(date: string, n: number): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + n, 12)).toISOString().slice(0, 10);
}

/** Shift a date array so its first day lands on `newFirst`, preserving shape. */
function shiftDates(dates: string[], newFirst: string): string[] {
	const first = dates[0];
	if (first === undefined || first === newFirst) return [...dates];
	const delta = dayDiffDays(first, newFirst);
	return dates.map((date) => addDaysLocal(date, delta));
}

function singleDescriptors(state: WizardState): RowDescriptor[] {
	const rows: RowDescriptor[] = [];
	const startDate = state.step1.startDate;
	if (startDate !== null) {
		rows.push({
			key: 'step1:startDate',
			type: 'start_school',
			title: 'Start of school',
			dates: [startDate],
			note: 'Periods 1–2 have no class',
			target: 'all',
			source: 'step1',
			editable: true
		});
	}
	state.step2.offDays.forEach((day, index) => {
		rows.push({
			key: `step2:offDays:${index}`,
			type: 'no_school',
			title: 'Off',
			dates: [day.date],
			note: day.name,
			target: 'all',
			source: 'step2',
			editable: true
		});
	});
	return rows;
}

function examDescriptors(state: WizardState): RowDescriptor[] {
	const rows: RowDescriptor[] = [];
	for (const exam of state.step3.exams) {
		// One row per exam label (not per date): a date edit re-anchors the
		// whole range (see applyEdits), so there is exactly one editable
		// row per exam and no per-date edit can be silently dropped.
		rows.push({
			key: `step3:exams:${exam.label}`,
			type: 'exam',
			title: exam.label,
			dates: [...exam.dates],
			target: 'all',
			source: 'step3',
			editable: true,
			examGroup: exam.label
		});
	}
	return rows;
}

function schoolDescriptors(state: WizardState): RowDescriptor[] {
	const rows: RowDescriptor[] = [];
	const s4 = state.step4;
	const single = (
		id: keyof WizardStep4State['singles'],
		label: string,
		type: 'no_class' | 'no_school' | 'partial',
		target: EslEventTarget
	) => {
		const date = s4.singles[id];
		if (date === null) return;
		rows.push({
			key: `step4:singles:${id}`,
			type,
			title: label,
			dates: [date],
			note: label,
			target,
			source: 'step4',
			editable: true
		});
	};
	single('anniv', 'Anniversary', 'no_class', 'all');
	single('makeup', 'Anniversary makeup', 'no_school', 'all');
	if (s4.sportsOn) single('sports', 'Sports Day', 'no_class', 'all');
	// BBQ: partial afternoon (S1 starter, folded from the seed #229).
	if (s4.singles.bbq !== null) {
		single('bbq', 'BBQ', 'partial', 'all');
	}
	single('grad', 'Graduation', 'no_class', 'G9');
	const pairIds: ReadonlyArray<keyof WizardStep4State['pairs']> = ['mock1', 'mock2', 'mock3'];
	pairIds.forEach((id, i) => {
		const dates = s4.pairs[id];
		if (dates === null || dates.length === 0) return;
		rows.push({
			key: `step4:pairs:${id}`,
			type: 'g9_mock',
			title: `G9 Mock ${i + 1}`,
			dates: [...dates],
			target: 'G9',
			source: 'step4',
			editable: true
		});
	});
	return rows;
}

function extraDescriptors(state: WizardState): RowDescriptor[] {
	const rows: RowDescriptor[] = [];
	const extras = state.step4.extras;
	for (const extra of extras) {
		if (!extra.start) continue;
		rows.push({
			key: `step4:extra:${extra.id}`,
			type: 'no_school',
			title: 'Off',
			dates: extra.end ? [extra.start, extra.end] : [extra.start],
			note: extra.name,
			target: 'all',
			source: 'step4',
			editable: true
		});
	}
	return rows;
}

function reminderDescriptors(state: WizardState): RowDescriptor[] {
	const rows: RowDescriptor[] = [];
	const ranged = (
		key: string,
		label: string,
		reminderKind: EslReminderKind,
		target: EslEventTarget,
		dates: string[] | null
	) => {
		if (dates === null || dates.length === 0) return;
		rows.push({
			key: `step4:ranges:${key}`,
			type: 'reminder',
			reminderKind,
			title: label,
			dates: [...dates],
			target,
			source: 'step4',
			editable: true
		});
	};
	const ranges = state.step4.ranges;
	const quizIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
	quizIds.forEach((id, i) => ranged(id, `Quiz ${i + 1}`, 'quiz', 'CLIL', ranges[id]));
	const dueKinds = [
		['pd1', 'pd2', 'pd3', 'passport', 'Passport Due'],
		['rd1', 'rd2', 'rd3', 'recording', 'Recording Due']
	] as const;
	for (const [d1, d2, d3, kind, label] of dueKinds) {
		([d1, d2, d3] as const).forEach((id, i) => {
			ranged(id, `${label} ${i + 1}`, kind, 'Comm', ranges[id]);
		});
	}
	ranged('pcheck', 'Passport Check', 'passport_check', 'Comm', ranges.pcheck);
	ranged('wcheck', 'Workbook Check', 'workbook_check', 'CLIL', ranges.wcheck);
	return rows;
}

function customDescriptors(customs: WizardCustomEvent[]): RowDescriptor[] {
	return customs.map((custom) => {
		if (custom.type === 'banner') {
			return {
				key: `custom:${custom.id}`,
				type: 'reminder' as const,
				reminderKind: 'task' as const,
				title: custom.bannerText ?? 'Banner',
				dates:
					custom.startDate !== undefined && custom.endDate !== undefined
						? [custom.startDate, custom.endDate]
						: [],
				note: custom.bannerText,
				target: custom.target ?? 'all',
				source: 'step5' as const,
				editable: true,
				customId: custom.id
			};
		}
		if (custom.subType === 'task') {
			return {
				key: `custom:${custom.id}`,
				type: 'reminder' as const,
				reminderKind: 'task' as const,
				title: custom.note ?? 'Task',
				dates: custom.date !== undefined ? [custom.date] : [],
				note: custom.note,
				target: custom.target ?? 'all',
				source: 'step5' as const,
				editable: true,
				customId: custom.id
			};
		}
		return {
			key: `custom:${custom.id}`,
			type: (custom.subType ?? 'no_class') as 'partial' | 'no_class',
			title: custom.subType === 'partial' ? 'Partial day' : 'No class',
			dates: custom.date !== undefined ? [custom.date] : [],
			note: custom.note,
			target: custom.target ?? 'all',
			source: 'step5' as const,
			editable: true,
			customId: custom.id
		};
	});
}

function applyEdits(
	rows: RowDescriptor[],
	edits: WizardEventEdit[],
	refanExam: (label: string, start: string) => string[]
): RowDescriptor[] {
	const byKey = new Map(edits.map((edit) => [edit.eventKey, edit]));
	return rows.map((row) => {
		const edit = byKey.get(row.key);
		if (edit === undefined) return row;
		if (edit.date === undefined && edit.endDate === undefined && edit.note === undefined) {
			return row;
		}
		let dates = row.dates;
		if (row.type === 'exam' && row.examGroup !== undefined) {
			// Exam date edits re-anchor the whole range (Step 3 stays the
			// home of exam moves with gates); the range re-fans locally so
			// the preview matches what the save recomputes.
			if (edit.date !== undefined) dates = refanExam(row.examGroup, edit.date);
		} else if (row.customId !== undefined || row.dates.length <= 1) {
			// Singles + custom events: endpoints apply directly.
			if (edit.date !== undefined || edit.endDate !== undefined) {
				const first = edit.date ?? row.dates[0] ?? '';
				const rest = edit.endDate !== undefined ? [edit.endDate] : row.dates.slice(1);
				dates = first === '' ? [...rest] : [first, ...rest];
			}
		} else if (row.dates.length > 0) {
			// Multi-date rows shift as a whole, preserving shape; an
			// explicit end date replaces the shifted last day.
			const shifted = edit.date !== undefined ? shiftDates(row.dates, edit.date) : [...row.dates];
			dates = edit.endDate !== undefined ? [...shifted.slice(0, -1), edit.endDate] : shifted;
		}
		return {
			...row,
			dates,
			note: edit.note ?? row.note
		};
	});
}

/**
 * Local exam fan-out for display + save payloads: N class days from the
 * anchor, skipping weekends, off days and the OTHER exams. Mirrors the
 * server fan-out in `events.create` (same off-day set once off days are
 * written first at save), so preview and saved rows agree.
 */
function examFan(state: WizardState, label: string, start: string): string[] {
	const offDays = new Set(state.step2.offDays.map((day) => day.date));
	for (const exam of state.step3.exams) {
		if (exam.label !== label) {
			for (const date of exam.dates) offDays.add(date);
		}
	}
	return collectClassDays(
		start,
		EXAM_SLOT_CLASS_DAYS[label as 'Exam 1' | 'Exam 2' | 'Final'],
		offDays
	);
}

/** Display rows for the Step 5 calendar + event list (edits applied). */
export function buildPreviewRows(state: WizardState): PreviewRow[] {
	const rows: RowDescriptor[] = [
		...singleDescriptors(state),
		...examDescriptors(state),
		...schoolDescriptors(state),
		...reminderDescriptors(state),
		...extraDescriptors(state),
		...customDescriptors(state.step5.customEvents)
	];
	const refanExam = (label: string, start: string): string[] => examFan(state, label, start);
	return applyEdits(rows, state.step5.eventEdits, refanExam).map((row) => ({
		key: row.key,
		type: row.type,
		...(row.reminderKind === undefined ? {} : { reminderKind: row.reminderKind }),
		title: row.title,
		date: row.dates[0] ?? '',
		...(row.dates.length > 1 ? { endDate: row.dates[row.dates.length - 1] } : {}),
		...(row.note === undefined ? {} : { note: row.note }),
		target: row.target,
		source: row.source,
		editable: row.editable,
		...(row.examGroup === undefined ? {} : { examGroup: row.examGroup }),
		...(row.customId === undefined ? {} : { customId: row.customId })
	}));
}

/** Action payload for `esl.wizards.saveSemester` (edits applied). */
export function buildSavePayload(
	state: WizardState,
	e2eTag?: string
): {
	year: string;
	term: 'S1' | 'S2';
	startDate: string;
	offDays: { date: string; name: string }[];
	exams: SaveExamRange[];
	singles: SavePayload['singles'];
	extras: SavePayload['extras'];
	sportsOn: boolean;
	pairs: SavePayload['pairs'];
	ranges: SavePayload['ranges'];
	customs: WizardCustomEvent[];
	e2eTag?: string;
} {
	const edited = (
		key: string,
		fallback: { date?: string; endDate?: string; note?: string }
	): { date?: string; endDate?: string; note?: string } => {
		const edit = state.step5.eventEdits.find((e) => e.eventKey === key);
		if (edit === undefined) return fallback;
		return {
			date: edit.date ?? fallback.date,
			endDate: edit.endDate ?? fallback.endDate,
			note: edit.note ?? fallback.note
		};
	};

	const startEdit = edited('step1:startDate', { date: state.step1.startDate ?? undefined });
	const offDays = state.step2.offDays.map((day, index) => {
		const override = edited(`step2:offDays:${index}`, { date: day.date, note: day.name });
		return { date: override.date ?? day.date, name: override.note ?? day.name };
	});
	const exams: SaveExamRange[] = state.step3.exams.map((exam) => {
		// A date edit on an exam re-anchors the whole range (labels stay);
		// the save re-fans from the anchor, matching the preview re-fan.
		const override = edited(`step3:exams:${exam.label}`, {});
		const anchor = override.date ?? exam.dates[0] ?? '';
		return { label: exam.label, dates: anchor === '' ? [] : examFan(state, exam.label, anchor) };
	});
	const single = (id: keyof WizardStep4State['singles']): string | null => {
		const current = state.step4.singles[id];
		if (current === null) return null;
		return (edited(`step4:singles:${id}`, { date: current }).date ?? current) as string;
	};
	const pair = (id: keyof WizardStep4State['pairs']): string[] | null => {
		const current = state.step4.pairs[id];
		if (current === null || current.length === 0) return current;
		const override = edited(`step4:pairs:${id}`, {});
		if (override.date === undefined) return [...current];
		return shiftDates(current, override.date);
	};
	const range = (id: keyof WizardStep4State['ranges']): string[] | null => {
		const current = state.step4.ranges[id];
		if (current === null || current.length === 0) return current;
		const override = edited(`step4:ranges:${id}`, {});
		if (override.date === undefined) return [...current];
		return shiftDates(current, override.date);
	};
	const rangeRecord = (
		ids: ReadonlyArray<keyof WizardStep4State['ranges']>
	): Record<string, string[] | null> => Object.fromEntries(ids.map((id) => [id, range(id)]));

	const rangeIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;
	const ranges: SavePayload['ranges'] = {
		...rangeRecord(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']),
		...rangeRecord(['pd1', 'pd2', 'pd3']),
		...rangeRecord(['rd1', 'rd2', 'rd3']),
		...rangeRecord(['pcheck', 'wcheck'])
	} as SavePayload['ranges'];

	// Ranged reminders must not straddle an exam (the save would refuse it
	// naming the date). Interior no-school days are fine: `events.create`
	// lets a reminder step over a holiday, and a quiz window reaches past one
	// for its third class. Endpoints must still land on a school day.
	const examDays = new Set(state.step3.exams.flatMap((exam) => exam.dates));
	const blockedEndpoints = new Set([...state.step2.offDays.map((day) => day.date), ...examDays]);
	for (const [id, label] of [
		...rangeIds.map((rangeId, i) => [rangeId, `Quiz ${i + 1}`] as const),
		...(['pd1', 'pd2', 'pd3'] as const).map(
			(rangeId, i) => [rangeId, `Passport Due ${i + 1}`] as const
		),
		...(['rd1', 'rd2', 'rd3'] as const).map(
			(rangeId, i) => [rangeId, `Recording Due ${i + 1}`] as const
		),
		['pcheck', 'Passport Check'],
		['wcheck', 'Workbook Check']
	] as const) {
		const dates = ranges[id];
		if (dates !== null && dates.length > 1) {
			const first = dates[0] as string;
			const last = dates[dates.length - 1] as string;
			const crossed = blockedEndpoints.has(first)
				? first
				: blockedEndpoints.has(last)
					? last
					: straddlesBlocked(first, last, examDays);
			if (crossed !== null) {
				throw new Error(`${label} window crosses ${crossed} — move it in Step 4.`);
			}
		}
	}

	const customs = state.step5.customEvents.map((custom) => {
		const override = edited(`custom:${custom.id}`, {});
		if (
			override.date === undefined &&
			override.endDate === undefined &&
			override.note === undefined
		) {
			return { ...custom };
		}
		const next = { ...custom };
		if (custom.type === 'banner') {
			if (override.date !== undefined) next.startDate = override.date;
			if (override.endDate !== undefined) next.endDate = override.endDate;
		} else if (override.date !== undefined) {
			next.date = override.date;
		}
		if (override.note !== undefined) {
			if (custom.type === 'banner') next.bannerText = override.note;
			else next.note = override.note;
		}
		return next;
	});

	const extras = state.step4.extras
		.filter((e) => e.start)
		.map((e) => ({ name: e.name, startDate: e.start, endDate: e.end ?? undefined }));

	return {
		year: state.step1.schoolYear ?? '',
		term: state.step1.term ?? 'S1',
		startDate: startEdit.date ?? state.step1.startDate ?? '',
		offDays,
		exams,
		singles: {
			anniv: single('anniv'),
			makeup: single('makeup'),
			sports: single('sports'),
			grad: single('grad'),
			bbq: single('bbq')
		},
		sportsOn: state.step4.sportsOn,
		pairs: { mock1: pair('mock1'), mock2: pair('mock2'), mock3: pair('mock3') },
		ranges,
		extras,
		customs,
		...(e2eTag === undefined ? {} : { e2eTag })
	};
}
