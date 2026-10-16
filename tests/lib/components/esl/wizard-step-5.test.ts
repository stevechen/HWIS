import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

const actionMock = vi.fn();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		loading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
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
		holidaysImported: true,
		lastExamDay: true
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

		// Start of school event (dates render formatted: "Mon, Aug 31")
		await expect.element(page.getByText('Start of school')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-5-event-list')).toMatchTextContent('Aug 31');

		// Off days and exams, scoped to the event list (the calendar
		// shows the same names on its day chips; exam titles repeat in
		// their group badges, so assert on container text)
		const list = page.getByTestId('wizard.step-5-event-list');
		await expect.element(list).toMatchTextContent('National Day');
		await expect.element(list).toMatchTextContent('Double Ten Day');
		await expect.element(list).toMatchTextContent('Exam 1');
		await expect.element(list).toMatchTextContent('Exam 2');
		await expect.element(list).toMatchTextContent('Final');
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
