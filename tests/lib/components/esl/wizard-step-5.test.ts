import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';

const actionMock = vi.fn();
const mutationMock = vi.fn();
const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		loading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mutationMock,
		query: vi.fn().mockResolvedValue({}),
		action: actionMock
	}))
}));

import Step5Panel from '$lib/components/esl/wizard/Step5Panel.svelte';

const mockState = {
	currentStep: 5 as const,
	semesterId: null,
	step1: {
		term: 'S1' as const,
		schoolYear: '2026-2027',
		startDate: '2026-08-31'
	},
	step2: {
		endDate: '2027-01-20',
		offDays: [
			{ date: '2026-10-09', name: 'National Day' },
			{ date: '2026-10-10', name: 'Double Ten Day' }
		],
		holidaysImported: true
	},
	step3: {
		exams: [
			{ label: 'Exam 1' as const, dates: ['2026-10-05', '2026-10-06'] },
			{ label: 'Exam 2' as const, dates: ['2026-11-02', '2026-11-03'] },
			{ label: 'Final' as const, dates: ['2027-01-18', '2027-01-19', '2027-01-20'] }
		]
	},
	step4: {
		singles: { anniv: null, makeup: null, sports: '2026-10-07', grad: null, bbq: null },
		pairs: { mock1: ['2026-10-12', '2026-10-13'], mock2: null, mock3: null },
		ranges: {
			q1: ['2026-10-19', '2026-10-20', '2026-10-21'],
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
		sportsOn: true,
		extras: []
	},
	step5: {
		customEvents: [],
		eventEdits: []
	}
};

const mockUpdate = vi.fn((mutate) => mutate(mockState));

describe('Step 5 Panel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders the panel wrapper with correct test id', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });
		await expect.element(page.getByTestId('wizard.step-5-panel')).toBeInTheDocument();
	});

	it('shows calendar preview and event list side by side', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		// Calendar preview should be present
		await expect.element(page.getByTestId('wizard.step-5-calendar')).toBeInTheDocument();

		// Event list should be present
		await expect.element(page.getByTestId('wizard.step-5-event-list')).toBeInTheDocument();
	});

	it('shows events from all previous steps in the list', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		// Start of school event (short date, weekday dropped: "8/31")
		await expect.element(page.getByText('Start of school')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-5-event-list')).toMatchTextContent('8/31');

		// Off days and exams, scoped to the event list (the calendar
		// shows the same names on its day chips). Notes are no longer
		// printed on the row — only the title and its date.
		const list = page.getByTestId('wizard.step-5-event-list');
		await expect.element(list).toMatchTextContent('10/9');
		await expect.element(list).toMatchTextContent('10/10');
		await expect.element(list).toMatchTextContent('Exam 1');
		await expect.element(list).toMatchTextContent('Exam 2');
		await expect.element(list).toMatchTextContent('Final');
	});

	it('orders the list by block and date and drops weekday text', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		const list = page.getByTestId('wizard.step-5-event-list');
		const text = list.element().textContent ?? '';
		const order = ['Block 1', 'Exam 1', 'Block 2', 'Exam 2', 'Block 3', 'Final'];
		const positions = order.map((label) => text.indexOf(label));
		expect(positions.every((position) => position >= 0)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);

		// Weekday text is gone from the list (the calendar keeps its headers).
		expect(text).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri)\b/);
	});

	it('shows Save and Cancel buttons', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		await expect.element(page.getByRole('button', { name: 'Save semester' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('shows Add Custom Event button', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		await expect
			.element(page.getByRole('button', { name: 'Add custom event' }))
			.toBeInTheDocument();
	});

	it('opens custom event modal when Add Custom Event is clicked', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		await page.getByRole('button', { name: 'Add custom event' }).click();

		await expect.element(page.getByTestId('wizard.step-5-custom-modal')).toBeInTheDocument();
		await expect.element(page.getByText('Meeting-specific')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Banner' })).toBeInTheDocument();
	});

	it('shows inline edit popover when event in list is clicked', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		// Click on an event row in the list (rows expose an Edit label)
		await page.getByRole('button', { name: /^Edit Exam 1/ }).click();

		// Popover should appear
		await expect.element(page.getByTestId('wizard.step-5-edit-popover')).toBeInTheDocument();
	});

	it('saves through the saveSemester action and links the semester', async () => {
		actionMock.mockResolvedValue({ semesterId: 'sem123', eventIds: ['e1', 'e2'] });
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		await page.getByRole('button', { name: 'Save semester' }).click();

		await expect.element(page.getByTestId('wizard.step-5-save-success')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('wizard.step-5-semester-link'))
			.toHaveAttribute('href', '/esl/admin/semesters/2026-2027-S1');

		expect(actionMock).toHaveBeenCalledTimes(1);
		const payload = actionMock.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(payload).toMatchObject({
			year: '2026-2027',
			term: 'S1',
			startDate: '2026-08-31'
		});
		expect(payload.exams).toHaveLength(3);
	});

	it('opens the edit popover from a calendar date', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		// Exam 1 covers Mon 2026-10-05 on the preview calendar.
		await page.getByTestId('wizard.step-5-calendar.date-2026-10-05').click();

		await expect.element(page.getByTestId('wizard.step-5-edit-popover')).toBeInTheDocument();
	});

	it('offers the ticket target list with a required text on custom events', async () => {
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		await page.getByRole('button', { name: 'Add custom event' }).click();
		// Both modes carry the ticket target list (meeting shown by default).
		for (const testId of [
			'wizard.step-5-custom-target-meeting',
			'wizard.step-5-custom-target-banner'
		] as const) {
			if (testId.endsWith('-banner')) {
				await page.getByRole('button', { name: 'Banner' }).click();
			}
			const target = page.getByTestId(testId);
			await expect.element(target).toBeInTheDocument();
			// Native options are not in the accessibility tree until opened —
			// read them off the DOM node (the ticket's target list, nothing more).
			const select = (await target.element()) as HTMLSelectElement;
			expect(Array.from(select.options).map((option) => option.value)).toEqual([
				'all',
				'CLIL',
				'Comm',
				'G9',
				'H1'
			]);
		}
		await page.getByRole('button', { name: 'Meeting-specific' }).click();

		// Meeting with a date but no text keeps Add disabled (text is required).
		await expect.element(page.getByRole('button', { name: 'Add event' })).toBeDisabled();
	});

	it('shows an inline error when saving fails', async () => {
		actionMock.mockRejectedValueOnce(new Error('Semester explode'));
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		await page.getByRole('button', { name: 'Save semester' }).click();

		await expect.element(page.getByText(/Semester explode/)).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-5-save-success')).not.toBeInTheDocument();
	});
});

/**
 * Edit mode (ticket #255): "Save changes" runs a dry-run reconcile first,
 * shows the change summary, confirms when rows are removed, then writes.
 * Success clears the session wizard state and returns to the semesters list.
 */
describe('Step 5 Panel (edit mode)', () => {
	const SUMMARY_NO_REMOVAL = {
		added: 1,
		changed: 2,
		removed: 0,
		startDateChanged: false,
		dryRun: true,
		addedEvents: [{ type: 'reminder', title: 'Quiz 2', date: '2026-11-10' }],
		changedEvents: [
			{ eventId: 'e7', title: 'Quiz 1', date: '2026-10-19' },
			{ eventId: 'e9', title: 'Start of school', date: '2026-08-31' }
		],
		removedEvents: []
	};

	const SUMMARY_WITH_REMOVAL = {
		added: 0,
		changed: 1,
		removed: 2,
		startDateChanged: false,
		dryRun: true,
		addedEvents: [],
		changedEvents: [{ eventId: 'e7', title: 'Quiz 1', date: '2026-10-19' }],
		removedEvents: [
			{ eventId: 'e1', title: 'Quiz 2', date: '2026-11-10' },
			{ eventId: 'e2', title: 'Custom banner', date: '2026-12-01' }
		]
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function editState() {
		return { ...mockState, semesterId: 'sem_s1' };
	}

	const STATUS = {
		window: { start: '2026-08-31', end: '2027-01-20' },
		off: { expected: [], present: [], missing: [], ok: true },
		quiz: { expected: 6, present: 4 },
		units: { expected: 6, present: 6 },
		passport: { expected: 3, present: 3 },
		recording: { expected: 3, present: 3 },
		g9mock: { expectedStarts: 2, expectedRows: 4, presentRows: 4 }
	};

	function mockChecklistStatus() {
		vi.mocked(useQuery).mockImplementation(((query: unknown) => {
			if (getFunctionName(query as never) === 'esl/checklist:status') {
				return { data: STATUS, isLoading: false, error: null };
			}
			return { data: null, isLoading: false, error: null };
		}) as never);
	}

	it('shows the advisory checklist panel on the summary', async () => {
		mockChecklistStatus();
		await render(Step5Panel, { state: editState(), update: mockUpdate, mode: 'edit' });

		await expect.element(page.getByTestId('checklist-panel')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('checklist-panel.group-unit-quiz'))
			.toMatchTextContent('4/6');
	});

	it('keys the checklist status query to the loaded semester', async () => {
		mockChecklistStatus();
		await render(Step5Panel, { state: editState(), update: mockUpdate, mode: 'edit' });

		const call = vi
			.mocked(useQuery)
			.mock.calls.find(([query]) => getFunctionName(query as never) === 'esl/checklist:status');
		expect(call).toBeDefined();
		if (call === undefined) return;
		const args = (call[1] as () => Record<string, unknown>)();
		expect(args).toMatchObject({ semesterId: 'sem_s1' });
		expect(typeof args.today).toBe('string');
	});

	it('creates missing checklist drafts from the summary', async () => {
		mockChecklistStatus();
		mutationMock.mockResolvedValue({ created: ['Unit 5 Quiz Due'], skipped: [] });
		await render(Step5Panel, { state: editState(), update: mockUpdate, mode: 'edit' });

		await page.getByTestId('checklist-panel.create-quiz').click();

		await vi.waitFor(() => {
			expect(mutationMock).toHaveBeenCalledTimes(1);
		});
		const call = mutationMock.mock.calls[0];
		expect(call).toBeDefined();
		if (call === undefined) return;
		expect(getFunctionName(call[0] as never)).toBe('esl/checklist:createMissing');
		expect(call[1]).toMatchObject({ semesterId: 'sem_s1', group: 'quiz' });
		await expect.element(page.getByTestId('wizard.step-5-checklist-notice')).toBeInTheDocument();
	});

	it('does not render the checklist panel while creating a semester', async () => {
		mockChecklistStatus();
		await render(Step5Panel, { state: mockState, update: mockUpdate });

		await expect.element(page.getByTestId('checklist-panel')).not.toBeInTheDocument();
	});

	it('Save changes runs dry-run first and shows the change summary', async () => {
		actionMock.mockResolvedValue(SUMMARY_NO_REMOVAL);
		await render(Step5Panel, { state: editState(), update: mockUpdate, mode: 'edit' });

		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect.element(page.getByTestId('wizard.step-5-edit-summary')).toBeInTheDocument();
		expect(actionMock).toHaveBeenCalledTimes(1);
		const args = actionMock.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(args).toMatchObject({
			semesterId: 'sem_s1',
			dryRun: true,
			year: '2026-2027',
			term: 'S1',
			startDate: '2026-08-31'
		});
		await expect.element(page.getByTestId('wizard.step-5-summary-added')).toMatchTextContent('1');
		await expect.element(page.getByTestId('wizard.step-5-summary-changed')).toMatchTextContent('2');
		await expect.element(page.getByTestId('wizard.step-5-summary-removed')).toMatchTextContent('0');
		// Nothing removed — no removal confirm.
		await expect.element(page.getByTestId('wizard.step-5-confirm')).not.toBeInTheDocument();
	});

	it('applies the real save right from the summary when nothing is removed', async () => {
		actionMock
			.mockResolvedValueOnce(SUMMARY_NO_REMOVAL) // dry-run
			.mockResolvedValueOnce(SUMMARY_NO_REMOVAL); // real save
		sessionStorage.setItem('hwis:esl-wizard', '{"stale":"draft"}');
		const markSaved = vi.fn();
		await render(Step5Panel, {
			state: editState(),
			update: mockUpdate,
			mode: 'edit',
			markSaved
		});

		await page.getByRole('button', { name: 'Save changes' }).click();
		await page.getByTestId('wizard.step-5-apply').click();

		await expect.element(page.getByTestId('wizard.step-5-save-success')).toBeInTheDocument();
		expect(actionMock).toHaveBeenCalledTimes(2);
		const realArgs = actionMock.mock.calls[1]?.[1] as Record<string, unknown>;
		expect(realArgs).toMatchObject({ semesterId: 'sem_s1', dryRun: false });
		// Session wizard state is cleared and the route returns to the list.
		expect(sessionStorage.getItem('hwis:esl-wizard')).toBeNull();
		// The guard is disarmed before routing, or the redirect would be vetoed.
		expect(markSaved).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/esl/admin/semesters');
		});
	});

	it('confirms before saving when the dry-run reports removals', async () => {
		actionMock
			.mockResolvedValueOnce(SUMMARY_WITH_REMOVAL) // dry-run
			.mockResolvedValueOnce(SUMMARY_WITH_REMOVAL); // real save
		await render(Step5Panel, { state: editState(), update: mockUpdate, mode: 'edit' });

		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect.element(page.getByTestId('wizard.step-5-edit-summary')).toBeInTheDocument();

		const confirm = page.getByTestId('wizard.step-5-confirm');
		await expect.element(confirm).toBeInTheDocument();
		await expect.element(confirm).toMatchTextContent('Quiz 2');
		await expect.element(confirm).toMatchTextContent('Custom banner');
		await expect.element(page.getByTestId('wizard.step-5-summary-removed')).toMatchTextContent('2');

		// No real save happens before the confirm click.
		expect(actionMock).toHaveBeenCalledTimes(1);
		await page.getByTestId('wizard.step-5-apply').click();
		await expect.element(page.getByTestId('wizard.step-5-save-success')).toBeInTheDocument();
		expect(actionMock).toHaveBeenCalledTimes(2);
		const secondCall = actionMock.mock.calls[1];
		expect(secondCall).toBeDefined();
		if (secondCall === undefined) return;
		expect((secondCall[1] as Record<string, unknown>).dryRun).toBe(false);
		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/esl/admin/semesters');
		});
	});

	it('Keep editing abandons the review without touching the backend', async () => {
		actionMock.mockResolvedValue(SUMMARY_WITH_REMOVAL);
		await render(Step5Panel, { state: editState(), update: mockUpdate, mode: 'edit' });

		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect.element(page.getByTestId('wizard.step-5-edit-summary')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Keep editing' }).click();

		await expect.element(page.getByTestId('wizard.step-5-edit-summary')).not.toBeInTheDocument();
		expect(actionMock).toHaveBeenCalledTimes(1);
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('shows the backend refusal as the standard error region', async () => {
		actionMock.mockRejectedValueOnce(
			new Error('Exam rows cannot be removed — move the exam in Step 3 instead.')
		);
		await render(Step5Panel, { state: editState(), update: mockUpdate, mode: 'edit' });

		await page.getByRole('button', { name: 'Save changes' }).click();

		await expect.element(page.getByText(/Exam rows cannot be removed/)).toBeInTheDocument();
		expect(actionMock).toHaveBeenCalledTimes(1);
		await expect.element(page.getByTestId('wizard.step-5-save-success')).not.toBeInTheDocument();
		expect(gotoMock).not.toHaveBeenCalled();
	});
});
