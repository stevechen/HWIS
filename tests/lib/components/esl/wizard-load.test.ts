import { describe, it, expect } from 'vite-plus/test';
import { buildSavePayload, type SavePayload } from '$lib/components/esl/wizard/wizard-save';
import {
	loadWizardState,
	type WizardEventSource,
	type WizardInferredEntry,
	type WizardInferredKind,
	type WizardSemesterSource
} from '$lib/components/esl/wizard/wizard-load';
import type { WizardState } from '$lib/components/esl/wizard/wizard-state';
import { addDays, type Term } from '$lib/components/esl/wizard/wizard-dates';
import {
	ESL_EVENT_TITLES,
	ESL_REMINDER_TITLES,
	EXAM_SEED_WEEKDAYS,
	expandExamDays,
	type EslReminderKind
} from '$convex/shared/esl';

/**
 * Reverse mapping of a saved semester into WizardState (ticket #254).
 *
 * The DB side of every round-trip is a hand-rolled mirror of
 * `esl.wizards.saveSemester` + `events.create` — same write order, same
 * fan-outs, hand-worked titles from `shared/esl`, never recomputed through
 * the loader.
 */

export function semesterSource(term: Term = 'S1'): WizardSemesterSource {
	return { id: 'sem-254', year: '2026-2027', term, startDate: '2026-08-31' };
}

function row(
	input: Partial<WizardEventSource> & Pick<WizardEventSource, 'type' | 'title' | 'date'>
): WizardEventSource {
	return { id: `evt-${input.date ?? ''}-${input.title ?? ''}`, target: 'all', ...input };
}

/** Mirror of the backend save: write order + row shapes from `wizards.ts`/`events.ts`. */
export function simulateSave(payload: SavePayload): WizardEventSource[] {
	const rows: WizardEventSource[] = [];
	// First-day window P1–P2 (start_period fields are irrelevant to the loader).
	rows.push({ type: 'start_school', title: 'Start at P3', target: 'all', date: payload.startDate });
	for (const day of payload.offDays) {
		rows.push({
			type: 'no_school',
			title: ESL_EVENT_TITLES.no_school,
			target: 'all',
			date: day.date,
			note: day.name
		});
	}
	for (const exam of payload.exams) {
		const title = exam.label === 'Final' ? 'Final Exam' : exam.label;
		const anchor = exam.dates[0];
		if (anchor === undefined) continue;
		// Off days precede exams, so the fan sees only the rows written so far.
		const off = new Set(rows.filter((r) => r.type === 'no_school').map((r) => r.date));
		for (const date of expandExamDays({
			startDate: anchor,
			dayCount: EXAM_SEED_WEEKDAYS[title] ?? 2,
			offDates: off
		})) {
			rows.push({ type: 'exam', title, target: 'all', date, examGroup: title });
		}
	}
	if (payload.singles.anniv !== null) {
		rows.push({
			type: 'no_class',
			title: ESL_EVENT_TITLES.no_class,
			target: 'all',
			date: payload.singles.anniv,
			note: 'Anniversary'
		});
	}
	if (payload.singles.makeup !== null) {
		rows.push({
			type: 'no_school',
			title: ESL_EVENT_TITLES.no_school,
			target: 'all',
			date: payload.singles.makeup,
			note: 'Anniversary makeup'
		});
	}
	if (payload.sportsOn && payload.singles.sports !== null) {
		rows.push({
			type: 'no_class',
			title: ESL_EVENT_TITLES.no_class,
			target: 'all',
			date: payload.singles.sports,
			note: 'Sports Day'
		});
	}
	if (payload.singles.grad !== null) {
		rows.push({
			type: 'no_class',
			title: ESL_EVENT_TITLES.no_class,
			target: 'G9',
			date: payload.singles.grad,
			note: 'Graduation'
		});
	}
	if (payload.singles.bbq !== null) {
		rows.push({
			type: 'partial',
			title: ESL_EVENT_TITLES.partial,
			target: 'all',
			date: payload.singles.bbq,
			note: 'BBQ from 12:00'
		});
	}
	for (const extra of payload.extras) {
		const end = extra.endDate ?? extra.startDate;
		for (let date = extra.startDate; date <= end; date = addDays(date, 1)) {
			rows.push({
				type: 'no_school',
				title: ESL_EVENT_TITLES.no_school,
				target: 'all',
				date,
				note: extra.name
			});
		}
	}
	for (const pair of [payload.pairs.mock1, payload.pairs.mock2, payload.pairs.mock3]) {
		const start = pair?.[0];
		if (start === undefined) continue;
		for (const date of [start, addDays(start, 1)]) {
			rows.push({ type: 'g9_mock', title: 'G9 Mock Exam', target: 'G9', date });
		}
	}
	const ranged = (
		kind: EslReminderKind,
		target: WizardEventSource['target'],
		title: string,
		dates: string[] | null
	): void => {
		if (dates === null || dates.length === 0) return;
		const first = dates[0];
		const last = dates[dates.length - 1];
		if (first === undefined || last === undefined) return;
		rows.push({
			type: 'reminder',
			reminderKind: kind,
			target,
			title,
			date: first,
			...(last === first ? {} : { endDate: last })
		});
	};
	(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const).forEach((id, i) => {
		ranged('quiz', 'CLIL', `Quiz ${i + 1}`, payload.ranges[id]);
	});
	(['pd1', 'pd2', 'pd3'] as const).forEach((id) => {
		ranged('passport', 'Comm', ESL_REMINDER_TITLES.passport, payload.ranges[id]);
	});
	(['rd1', 'rd2', 'rd3'] as const).forEach((id) => {
		ranged('recording', 'Comm', ESL_REMINDER_TITLES.recording, payload.ranges[id]);
	});
	ranged('passport_check', 'Comm', ESL_REMINDER_TITLES.passport_check, payload.ranges.pcheck);
	ranged('workbook_check', 'CLIL', ESL_REMINDER_TITLES.workbook_check, payload.ranges.wcheck);
	for (const custom of payload.customs) {
		const text = (custom.note ?? custom.bannerText ?? '').trim();
		if (custom.type === 'banner') {
			rows.push({
				type: 'reminder',
				reminderKind: 'task',
				target: custom.target ?? 'all',
				title: text,
				date: custom.startDate ?? '',
				...(custom.endDate === undefined ? {} : { endDate: custom.endDate }),
				note: text
			});
			continue;
		}
		if (custom.subType === 'task') {
			rows.push({
				type: 'reminder',
				reminderKind: 'task',
				target: custom.target ?? 'all',
				title: text,
				date: custom.date ?? '',
				note: text
			});
			continue;
		}
		rows.push({
			type: custom.subType ?? 'no_class',
			title: ESL_EVENT_TITLES.no_class,
			target: custom.target ?? 'all',
			date: custom.date ?? '',
			note: text
		});
	}
	return rows;
}

/** A full S1 semester fixture in the wizard-save.test.ts style. */
export function s1State(): WizardState {
	return {
		currentStep: 5,
		semesterId: null,
		step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
		step2: {
			endDate: '2027-01-20',
			offDays: [{ date: '2026-10-09', name: 'Peace Memorial Day (observed)' }],
			holidaysImported: true
		},
		step3: {
			exams: [
				{ label: 'Exam 1', dates: ['2026-11-02', '2026-11-03'] },
				{ label: 'Exam 2', dates: ['2026-12-07', '2026-12-08'] },
				{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
			]
		},
		step4: {
			singles: {
				anniv: '2026-09-25',
				makeup: null,
				sports: '2026-10-07',
				grad: null,
				bbq: '2026-10-30'
			},
			pairs: {
				mock1: ['2026-10-12', '2026-10-13'],
				mock2: ['2026-11-16', '2026-11-17'],
				mock3: null
			},
			ranges: {
				q1: ['2026-09-28', '2026-09-30', '2026-10-02'],
				q2: ['2026-10-19', '2026-10-21', '2026-10-23'],
				q3: ['2026-11-09', '2026-11-11', '2026-11-13'],
				q4: null,
				q5: null,
				q6: null,
				pd1: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
				pd2: ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'],
				pd3: null,
				rd1: ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'],
				rd2: null,
				rd3: null,
				pcheck: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'],
				wcheck: null
			},
			sportsOn: true,
			extras: [{ id: 'extra-1', name: 'Winter break', start: '2026-12-24', end: '2026-12-25' }]
		},
		step5: {
			customEvents: [
				{
					id: 'custom-1',
					type: 'banner',
					startDate: '2026-09-14',
					endDate: '2026-09-18',
					bannerText: 'Club week'
				},
				{
					id: 'custom-2',
					type: 'meeting',
					date: '2026-10-16',
					target: 'CLIL',
					subType: 'task',
					note: 'Collect permission slips'
				},
				{
					id: 'custom-3',
					type: 'meeting',
					date: '2026-11-27',
					target: 'G8',
					subType: 'partial',
					note: 'Sports awards'
				},
				{ id: 'custom-4', type: 'meeting', date: '2026-12-14', target: 'G9', note: 'Photo day' }
			],
			eventEdits: []
		}
	};
}

function kind(entries: WizardInferredEntry[], kind: WizardInferredKind): WizardInferredEntry[] {
	return entries.filter((entry) => entry.kind === kind);
}

describe('loadWizardState — round trip', () => {
	it('survives buildSavePayload(load(simulateSave(payload))) field for field', () => {
		const state = s1State();
		const payload = buildSavePayload(state, 'tag-1');
		const loaded = loadWizardState({ ...semesterSource(), id: 'sem-254' }, simulateSave(payload));
		const repayload = buildSavePayload(loaded.state, 'tag-1');
		expect(repayload).toEqual(payload);
	});

	it('survives a no-op save', () => {
		const payload = buildSavePayload(s1State());
		const loaded = loadWizardState(semesterSource(), simulateSave(payload));
		expect(loaded.state.currentStep).toBe(5);
	});

	it('recovers every exact field of the state', () => {
		const state = s1State();
		const payload = buildSavePayload(state, 'tag-1');
		const loaded = loadWizardState(semesterSource(), simulateSave(payload));

		expect(loaded.state.currentStep).toBe(5);
		expect(loaded.state.semesterId).toBe('sem-254');
		expect(loaded.state.step1).toEqual({
			term: 'S1',
			schoolYear: '2026-2027',
			startDate: '2026-08-31'
		});
		// Exact: exams re-fanned from the examGroup anchor.
		expect(loaded.state.step3.exams).toEqual(state.step3.exams);
		// Exact: singles by locked note strings.
		expect(loaded.state.step4.singles).toEqual({
			anniv: '2026-09-25',
			makeup: null,
			sports: '2026-10-07',
			grad: null,
			bbq: '2026-10-30'
		});
		expect(loaded.state.step4.sportsOn).toBe(true);
		// Exact: one pcheck and one wcheck, with their full window interiors.
		const originalRanges = state.step4.ranges;
		expect(loaded.state.step4.ranges.pcheck).toEqual(originalRanges.pcheck);
		expect(loaded.state.step4.ranges).toMatchObject({
			q1: originalRanges.q1,
			q2: originalRanges.q2,
			q3: originalRanges.q3,
			pd1: originalRanges.pd1,
			pd2: originalRanges.pd2,
			rd1: originalRanges.rd1
		});
		// Off days as single no_school rows; multi-day extras keep their range.
		expect(loaded.state.step2.offDays).toEqual([
			{ date: '2026-10-09', name: 'Peace Memorial Day (observed)' }
		]);
		expect(loaded.state.step4.extras).toEqual([
			{ id: 'extra-1', name: 'Winter break', start: '2026-12-24', end: '2026-12-25' }
		]);
		expect(loaded.state.step4.pairs).toEqual({
			mock1: ['2026-10-12', '2026-10-13'],
			mock2: ['2026-11-16', '2026-11-17'],
			mock3: null
		});
		// Customs best-effort reverse-mapped, ids regenerated in date order.
		expect(loaded.state.step5.customEvents).toEqual(state.step5.customEvents);
		expect(loaded.state.step5.eventEdits).toEqual([]);
	});

	it('reports every inferred mapping for a fully-populated semester', () => {
		const payload = buildSavePayload(s1State());
		const loaded = loadWizardState(semesterSource(), simulateSave(payload));
		const kinds = loaded.inferred.entries.map((entry) => entry.kind);
		// Ordinals, mocks, extras and customs are always inferred on reload…
		expect(kinds).toContain('reminder-ordinal');
		expect(kinds).toContain('mock-adjacency');
		expect(kinds).toContain('extra-grouping');
		expect(kinds).toContain('custom-event');
		// …but a canonical save carries no renamed titles and no leftovers.
		expect(kinds).not.toContain('renamed-quiz-title');
		expect(kinds).not.toContain('unmatched-event');
		// Ordinals point at the wizard keys the UI can tag inline.
		const ordinals = kind(loaded.inferred.entries, 'reminder-ordinal');
		expect(ordinals.map((entry) => entry.eventKey)).toEqual([
			'step4:ranges:q1',
			'step4:ranges:q2',
			'step4:ranges:q3',
			'step4:ranges:pd1',
			'step4:ranges:pd2',
			'step4:ranges:rd1'
		]);
	});

	it('round-trips an empty save without throwing and infers nothing', () => {
		const state: WizardState = {
			currentStep: 5,
			semesterId: null,
			step1: { term: 'S2', schoolYear: '2026-2027', startDate: '2027-02-11' },
			step2: { endDate: '2027-06-30', offDays: [], holidaysImported: false },
			step3: { exams: [] },
			step4: {
				singles: { anniv: null, makeup: null, sports: null, grad: null, bbq: null },
				pairs: { mock1: null, mock2: null, mock3: null },
				ranges: {
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
				},
				sportsOn: false,
				extras: []
			},
			step5: { customEvents: [], eventEdits: [] }
		};
		const payload = buildSavePayload(state);
		const loaded = loadWizardState(
			{ year: '2026-2027', term: 'S2', startDate: '2027-02-11' },
			simulateSave(payload)
		);
		expect(buildSavePayload(loaded.state)).toEqual(payload);
		expect(loaded.state.step4).toMatchObject({
			singles: { anniv: null, makeup: null, sports: null, grad: null, bbq: null },
			sportsOn: false
		});
		expect(loaded.state.step1.term).toBe('S2');
		expect(loaded.inferred.entries).toEqual([]);
	});

	it('round-trips sportsOn=false (no sports row written)', () => {
		const state = s1State();
		state.step4.sportsOn = false;
		state.step4.singles.sports = null;
		const payload = buildSavePayload(state);
		const loaded = loadWizardState(semesterSource(), simulateSave(payload));
		expect(loaded.state.step4.sportsOn).toBe(false);
		expect(loaded.state.step4.singles.sports).toBeNull();
		expect(buildSavePayload(loaded.state)).toEqual(payload);
	});

	it('round-trips a multi-day extra spanning a weekend', () => {
		const state = s1State();
		state.step4.extras = [
			{ id: 'extra-1', name: 'New year week', start: '2027-01-01', end: '2027-01-03' }
		];
		const payload = buildSavePayload(state);
		const loaded = loadWizardState(semesterSource(), simulateSave(payload));
		// Jan 1 Fri, Jan 2 Sat, Jan 3 Sun — every calendar day is a row.
		expect(loaded.state.step4.extras).toEqual([
			{ id: 'extra-1', name: 'New year week', start: '2027-01-01', end: '2027-01-03' }
		]);
		expect(loaded.state.step2.offDays).toEqual([
			{ date: '2026-10-09', name: 'Peace Memorial Day (observed)' }
		]);
		expect(buildSavePayload(loaded.state)).toEqual(payload);
	});
});

describe('loadWizardState — inferred cases', () => {
	it('tags a renamed quiz title and still slots the window', () => {
		const payload = buildSavePayload(s1State());
		const rows = simulateSave(payload);
		const quiz = rows.find(
			(r) => r.type === 'reminder' && r.reminderKind === 'quiz' && r.date === '2026-09-28'
		);
		expect(quiz).toBeDefined();
		if (quiz === undefined) throw new Error('quiz row missing');
		quiz.title = 'Unit 3 Vocab Quiz';
		const loaded = loadWizardState(semesterSource(), rows);
		expect(loaded.state.step4.ranges.q1).toEqual(['2026-09-28', '2026-09-30', '2026-10-02']);
		const renamed = kind(loaded.inferred.entries, 'renamed-quiz-title');
		expect(renamed).toHaveLength(1);
		expect(renamed[0]).toMatchObject({ eventKey: 'step4:ranges:q1' });
		expect(renamed[0].detail).toContain('Unit 3 Vocab Quiz');
	});

	it('re-derives ordinals by date order for out-of-order windows', () => {
		const payload = buildSavePayload(s1State());
		const rows = simulateSave(payload).filter(
			(r) => !(r.type === 'reminder' && r.reminderKind === 'quiz')
		);
		// Two quiz rows whose saved titles contradict their date order: the
		// row titled Quiz 2 is the EARLIER window. Loader numbers by dates.
		rows.push(
			{
				id: 'evt-1',
				type: 'reminder',
				reminderKind: 'quiz',
				title: 'Quiz 2',
				target: 'CLIL',
				date: '2026-09-28',
				endDate: '2026-10-02'
			},
			{
				id: 'evt-2',
				type: 'reminder',
				reminderKind: 'quiz',
				title: 'Quiz 1',
				target: 'CLIL',
				date: '2026-10-19',
				endDate: '2026-10-23'
			}
		);
		const loaded = loadWizardState(semesterSource(), rows);
		expect(loaded.state.step4.ranges.q1).toEqual(['2026-09-28', '2026-09-30', '2026-10-02']);
		expect(loaded.state.step4.ranges.q2).toEqual(['2026-10-19', '2026-10-21', '2026-10-23']);
		const renamed = kind(loaded.inferred.entries, 'renamed-quiz-title');
		expect(renamed).toHaveLength(2);
		expect(renamed.map((entry) => entry.eventKey)).toEqual(['step4:ranges:q1', 'step4:ranges:q2']);
	});

	it('pairs adjacent mock rows two at a time, back to back', () => {
		const rows = [
			row({ type: 'start_school', title: 'Start at P3', date: '2026-08-31' }),
			// Four consecutive days: two adjacent mock pairs, no grouping marker.
			row({
				id: 'evt-m0',
				type: 'g9_mock',
				title: 'G9 Mock Exam',
				target: 'G9',
				date: '2026-10-12'
			}),
			row({
				id: 'evt-m0b',
				type: 'g9_mock',
				title: 'G9 Mock Exam',
				target: 'G9',
				date: '2026-10-13'
			}),
			row({
				id: 'evt-m1',
				type: 'g9_mock',
				title: 'G9 Mock Exam',
				target: 'G9',
				date: '2026-10-14'
			}),
			row({
				id: 'evt-m1b',
				type: 'g9_mock',
				title: 'G9 Mock Exam',
				target: 'G9',
				date: '2026-10-15'
			})
		];
		const loaded = loadWizardState(semesterSource(), rows);
		expect(loaded.state.step4.pairs).toEqual({
			mock1: ['2026-10-12', '2026-10-13'],
			mock2: ['2026-10-14', '2026-10-15'],
			mock3: null
		});
		const mocks = kind(loaded.inferred.entries, 'mock-adjacency');
		expect(mocks).toHaveLength(2);
	});

	it('groups multi-day no_school runs by shared note and contiguity', () => {
		const rows = [
			row({ type: 'start_school', title: 'Start at P3', date: '2026-08-31' }),
			// Spring festival: Dec 21 Mon – Dec 27 Sun, one row per calendar day.
			...[
				'2026-12-21',
				'2026-12-22',
				'2026-12-23',
				'2026-12-24',
				'2026-12-25',
				'2026-12-26',
				'2026-12-27'
			].map((date) =>
				row({ id: `evt-${date}`, type: 'no_school', title: 'Off', date, note: 'Spring festival' })
			),
			// A second, separate break later — same note, non-contiguous.
			row({
				id: 'evt-2a',
				type: 'no_school',
				title: 'Off',
				date: '2027-01-11',
				note: 'Spring festival'
			}),
			row({
				id: 'evt-2b',
				type: 'no_school',
				title: 'Off',
				date: '2027-01-12',
				note: 'Spring festival'
			})
		];
		const loaded = loadWizardState(semesterSource(), rows);
		expect(loaded.state.step4.extras).toEqual([
			{ id: 'extra-1', name: 'Spring festival', start: '2026-12-21', end: '2026-12-27' },
			{ id: 'extra-2', name: 'Spring festival', start: '2027-01-11', end: '2027-01-12' }
		]);
		expect(loaded.state.step2.offDays).toEqual([]);
		const grouped = kind(loaded.inferred.entries, 'extra-grouping');
		expect(grouped).toHaveLength(2);
	});

	it('leaves rows that match no wizard slot as unmatched', () => {
		const rows = [
			row({ type: 'start_school', title: 'Start at P3', date: '2026-08-31' }),
			// A checklist-draft quiz beyond the six slots.
			...['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12'].map(
				(date, i) =>
					row({
						id: `evt-q${i}`,
						type: 'reminder',
						reminderKind: 'quiz',
						title: `Quiz ${i + 1}`,
						target: 'CLIL',
						date,
						endDate: date
					})
			),
			row({
				id: 'evt-x',
				type: 'reminder',
				reminderKind: 'quiz',
				title: 'Unit 7 Quiz Due',
				target: 'CLIL',
				date: '2026-11-02',
				endDate: '2026-11-06'
			}),
			// A sports row whose note was hand-edited: no longer the locked string.
			row({
				id: 'evt-s',
				type: 'no_class',
				title: 'No class',
				date: '2026-10-07',
				note: 'Sports Day (rain date)'
			})
		];
		const loaded = loadWizardState(semesterSource(), rows);
		const unmatched = kind(loaded.inferred.entries, 'unmatched-event');
		// The seventh quiz row (beyond the six slots) cannot load.
		expect(unmatched).toHaveLength(1);
		expect(unmatched[0].id).toBe('evt-x');
		// Slots q1..q6 took the six conventionally-titled rows.
		expect(loaded.state.step4.ranges.q6).toEqual(['2026-10-12']);
		// A renamed Sports Day cannot be told apart from a custom meeting — its
		// flat no_class row best-effort maps to a custom no_class meeting
		// (subType regenerates as the default, i.e. absent).
		expect(loaded.state.step4.sportsOn).toBe(false);
		const customs = loaded.state.step5.customEvents;
		expect(
			customs.some(
				(c) =>
					c.type === 'meeting' &&
					(c.subType ?? 'no_class') === 'no_class' &&
					c.note === 'Sports Day (rain date)'
			)
		).toBe(true);
	});

	it('pins down the sportsOn choice: true only with the locked Sports Day row', () => {
		const withRow = loadWizardState(semesterSource(), [
			row({ type: 'start_school', title: 'Start at P3', date: '2026-08-31' }),
			row({ type: 'no_class', title: 'No class', date: '2026-10-07', note: 'Sports Day' })
		]);
		expect(withRow.state.step4.sportsOn).toBe(true);
		expect(withRow.state.step4.singles.sports).toBe('2026-10-07');

		// No Sports Day row: sportsOn=false, and the slot stays empty.
		const withoutRow = loadWizardState(semesterSource(), [
			row({ type: 'start_school', title: 'Start at P3', date: '2026-08-31' })
		]);
		expect(withoutRow.state.step4.sportsOn).toBe(false);
		expect(withoutRow.state.step4.singles.sports).toBeNull();
	});
});

describe('loadWizardState — exact recovery edges', () => {
	it('recovers exams from examGroup, reading through the title when absent', () => {
		const rows = [
			row({ type: 'start_school', title: 'Start at P3', date: '2026-08-31' }),
			// Legacy exam rows without examGroup: the title carries the group.
			row({ id: 'evt-e1', type: 'exam', title: 'Exam 1', date: '2026-11-02' }),
			row({ id: 'evt-e1b', type: 'exam', title: 'Exam 1', date: '2026-11-03' }),
			row({ id: 'evt-f', type: 'exam', title: 'Final Exam', date: '2027-01-18' }),
			row({ id: 'evt-f2', type: 'exam', title: 'Final Exam', date: '2027-01-19' }),
			row({ id: 'evt-f3', type: 'exam', title: 'Final Exam', date: '2027-01-20' })
		];
		const loaded = loadWizardState(semesterSource(), rows);
		expect(loaded.state.step3.exams).toEqual([
			{ label: 'Exam 1', dates: ['2026-11-02', '2026-11-03'] },
			{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
		]);
	});

	it('re-fans an exam past off days exactly as the save wrote it', () => {
		// Exam 1 anchored so its span runs over the Oct 9 off day.
		const state = s1State();
		state.step3.exams[0] = { label: 'Exam 1', dates: ['2026-10-08', '2026-10-12'] };
		const payload2 = buildSavePayload(state);
		const loaded = loadWizardState(semesterSource(), simulateSave(payload2));
		expect(loaded.state.step3.exams[0]).toEqual({
			label: 'Exam 1',
			dates: ['2026-10-08', '2026-10-12']
		});
		expect(buildSavePayload(loaded.state)).toEqual(payload2);
	});
});
