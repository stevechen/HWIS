import { describe, it, expect } from 'vitest';
import { buildPreviewRows, buildSavePayload } from '$lib/components/esl/wizard/wizard-save';
import type { WizardState } from '$lib/components/esl/wizard/wizard-state';

/**
 * Save/preview mapping for Step 5 (ticket #223). Every expectation is a
 * hand-worked literal — titles, targets and kinds come from the backend
 * validators (`shared/esl`), never recomputed through the builder.
 */
function s1State(): WizardState {
	return {
		currentStep: 5,
		semesterId: null,
		step1: { term: 'S1', schoolYear: '2026-2027', startDate: '2026-08-31' },
		step2: {
			endDate: '2027-01-20',
			offDays: [{ date: '2026-11-10', name: 'National Day' }],
			holidaysImported: true,
			lastExamDay: false
		},
		step3: {
			exams: [
				{ label: 'Exam 1', dates: ['2026-11-02', '2026-11-03'] },
				{ label: 'Exam 2', dates: ['2026-12-07', '2026-12-08'] },
				{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
			]
		},
		step4: {
			singles: { anniv: null, makeup: null, sports: '2026-10-07', grad: null },
			pairs: { mock1: ['2026-10-12', '2026-10-13'], mock2: null, mock3: null },
			ranges: {
				q1: ['2026-10-05', '2026-10-06', '2026-10-07'],
				q2: null,
				q3: null,
				q4: null,
				q5: null,
				q6: null,
				pd1: ['2026-10-05', '2026-10-06', '2026-10-07'],
				pd2: null,
				pd3: null,
				rd1: null,
				rd2: null,
				rd3: null,
				pcheck: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'],
				wcheck: null
			},
			sportsOn: true
		},
		step5: { customEvents: [], eventEdits: [] }
	};
}

describe('buildPreviewRows', () => {
	it('shows start, off days and one row per exam label', () => {
		const rows = buildPreviewRows(s1State());
		const byKey = new Map(rows.map((row) => [row.key, row]));

		expect(byKey.get('step1:startDate')).toMatchObject({
			type: 'start_school',
			title: 'Start of school',
			date: '2026-08-31',
			target: 'all'
		});
		expect(byKey.get('step2:offDays:0')).toMatchObject({
			type: 'no_school',
			title: 'Off',
			date: '2026-11-10',
			note: 'National Day'
		});
		expect(byKey.get('step3:exams:Exam 1')).toMatchObject({
			type: 'exam',
			title: 'Exam 1',
			date: '2026-11-02',
			endDate: '2026-11-03'
		});
		expect(byKey.get('step3:exams:Final')).toMatchObject({
			title: 'Final',
			date: '2027-01-18',
			endDate: '2027-01-20'
		});
	});

	it('maps school rows to canonical titles and targets', () => {
		const rows = buildPreviewRows(s1State());
		const byKey = new Map(rows.map((row) => [row.key, row]));

		expect(byKey.get('step4:singles:sports')).toMatchObject({
			type: 'no_class',
			title: 'Sports Day',
			target: 'all',
			date: '2026-10-07'
		});
		expect(byKey.get('step4:pairs:mock1')).toMatchObject({
			type: 'g9_mock',
			title: 'G9 Mock 1',
			target: 'G9',
			date: '2026-10-12',
			endDate: '2026-10-13'
		});
		// S1 has no Anniversary pair and no Graduation.
		expect(byKey.has('step4:singles:anniv')).toBe(false);
		expect(byKey.has('step4:singles:grad')).toBe(false);
		// Unset rows never render.
		expect(byKey.has('step4:ranges:q2')).toBe(false);
	});

	it('maps reminder rows to locked kinds, targets and display titles', () => {
		const rows = buildPreviewRows(s1State());
		const byKey = new Map(rows.map((row) => [row.key, row]));

		expect(byKey.get('step4:ranges:q1')).toMatchObject({
			type: 'reminder',
			reminderKind: 'quiz',
			target: 'CLIL',
			title: 'Quiz 1'
		});
		expect(byKey.get('step4:ranges:pd1')).toMatchObject({
			reminderKind: 'passport',
			target: 'Comm',
			title: 'Passport Due 1'
		});
		expect(byKey.get('step4:ranges:pcheck')).toMatchObject({
			reminderKind: 'passport_check',
			target: 'Comm',
			title: 'Passport Check',
			date: '2027-01-04',
			endDate: '2027-01-08'
		});
	});

	it('applies a single-date edit directly', () => {
		const state = s1State();
		state.step5.eventEdits = [{ eventKey: 'step4:singles:sports', date: '2026-10-14' }];
		const rows = buildPreviewRows(state);
		expect(rows.find((row) => row.key === 'step4:singles:sports')).toMatchObject({
			date: '2026-10-14'
		});
	});

	it('shifts a range edit preserving shape', () => {
		const state = s1State();
		state.step5.eventEdits = [{ eventKey: 'step4:ranges:q1', date: '2026-10-12' }];
		const rows = buildPreviewRows(state);
		const quiz = rows.find((row) => row.key === 'step4:ranges:q1');
		expect(quiz).toMatchObject({ date: '2026-10-12', endDate: '2026-10-14' });
	});

	it('re-anchors an exam date edit by re-fanning', () => {
		const state = s1State();
		state.step5.eventEdits = [{ eventKey: 'step3:exams:Exam 1', date: '2026-10-05' }];
		const rows = buildPreviewRows(state);
		const exam = rows.find((row) => row.key === 'step3:exams:Exam 1');
		// 2 class days from Mon Oct 5, skipping nothing in range.
		expect(exam).toMatchObject({ date: '2026-10-05', endDate: '2026-10-06' });
	});
});

describe('buildSavePayload', () => {
	it('passes semester fields, slices and customs through with edits applied', () => {
		const state = s1State();
		state.step5.customEvents = [
			{
				id: 'custom-1',
				type: 'banner',
				startDate: '2026-09-14',
				endDate: '2026-09-18',
				bannerText: 'Club week'
			}
		];
		const payload = buildSavePayload(state, 'tag-1');

		expect(payload).toMatchObject({
			year: '2026-2027',
			term: 'S1',
			startDate: '2026-08-31',
			e2eTag: 'tag-1'
		});
		// Exam labels pass through unmapped (the backend maps Final).
		expect(payload.exams).toEqual([
			{ label: 'Exam 1', dates: ['2026-11-02', '2026-11-03'] },
			{ label: 'Exam 2', dates: ['2026-12-07', '2026-12-08'] },
			{ label: 'Final', dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
		]);
		expect(payload.singles.sports).toBe('2026-10-07');
		expect(payload.pairs.mock1).toEqual(['2026-10-12', '2026-10-13']);
		expect(payload.ranges.q1).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
		expect(payload.customs).toHaveLength(1);
	});

	it('omits e2eTag when not given and honours a start-date edit', () => {
		const state = s1State();
		state.step5.eventEdits = [{ eventKey: 'step1:startDate', date: '2026-09-01' }];
		const payload = buildSavePayload(state);

		expect(payload.e2eTag).toBeUndefined();
		expect(payload.startDate).toBe('2026-09-01');
	});

	it('re-anchors an edited exam at save time', () => {
		const state = s1State();
		state.step5.eventEdits = [{ eventKey: 'step3:exams:Exam 1', date: '2026-10-05' }];
		const payload = buildSavePayload(state);

		expect(payload.exams[0]).toEqual({
			label: 'Exam 1',
			dates: ['2026-10-05', '2026-10-06']
		});
	});

	it('refuses a reminder window straddling an off day', () => {
		const state = s1State();
		// Spans Tue Nov 10 (National Day off).
		state.step4.ranges.q1 = ['2026-11-09', '2026-11-10', '2026-11-11'];
		expect(() => buildSavePayload(state)).toThrow(/Quiz 1 window crosses 2026-11-10/);
	});

	it('accepts windows clear of off days', () => {
		const state = s1State();
		state.step4.ranges.q1 = ['2026-11-04', '2026-11-05', '2026-11-06'];
		const payload = buildSavePayload(state);
		expect(payload.ranges.q1).toEqual(['2026-11-04', '2026-11-05', '2026-11-06']);
	});
});
