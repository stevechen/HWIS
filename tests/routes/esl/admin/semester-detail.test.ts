import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { useQuery } from 'convex-svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	beforeNavigate: vi.fn()
}));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

// Mutable route params — set per test before render (vi.hoisted so the
// mocked $app/state factory can close over it despite hoisting).
const routeParams = vi.hoisted(() => ({}) as { slug?: string });
vi.mock('$app/state', () => ({
	get page() {
		return { params: routeParams };
	}
}));

import { getFunctionName } from 'convex/server';
import EditPage from '$src/routes/esl/admin/semesters/[slug]/+page.svelte';

const SEMESTER = {
	_id: 'sem_s1',
	year: '2026-2027',
	term: 'S1',
	startDate: '2026-08-31',
	eslRoomLimit: 'E',
	eslCustomRooms: ['Library'],
	derivedEnd: '2027-01-20'
};

/** The saved rows a wizard-built semester carries; `loadWizardState` folds
 * these back into the wizard state the shell mounts from. */
const EVENTS = [
	{
		_id: 'evt_start',
		semesterId: 'sem_s1',
		type: 'start_school',
		title: 'Start of school',
		target: 'all',
		date: '2026-08-31',
		note: '',
		unverified: false
	},
	{
		_id: 'evt_off',
		semesterId: 'sem_s1',
		type: 'no_school',
		title: 'Mid-Autumn Festival',
		target: 'all',
		date: '2026-09-25',
		note: 'Mid-Autumn Festival',
		unverified: false
	},
	{
		_id: 'evt_exam1',
		semesterId: 'sem_s1',
		type: 'exam',
		title: 'Exam 1',
		target: 'all',
		date: '2026-11-02',
		note: '',
		examGroup: 'Exam 1',
		unverified: false
	},
	{
		_id: 'evt_stray',
		semesterId: 'sem_s1',
		type: 'reminder',
		reminderKind: 'task',
		title: 'Stray note',
		target: 'all',
		date: '2026-12-04',
		note: '',
		unverified: false
	}
];

/** Dispatch the queries the edit page makes. `api` is a Proxy
 * (`anyApi`) that mints a fresh reference object per access, so identity
 * comparison can never match — the stable function name can. */
function mockQueries() {
	vi.mocked(useQuery).mockImplementation(((query: unknown) => {
		const name = getFunctionName(query as never);
		if (name === 'esl/semesters:list') {
			return { data: [SEMESTER], isLoading: false, error: null };
		}
		if (name === 'esl/events:listBySemester') {
			return { data: EVENTS, isLoading: false, error: null };
		}
		if (name === 'esl/checklist:status') {
			return { data: CHECKLIST_STATUS, isLoading: false, error: null };
		}
		return { data: null, isLoading: false, error: null };
	}) as never);
}

const CHECKLIST_STATUS = {
	window: { start: '2026-08-31', end: '2027-01-20' },
	off: {
		expected: ['2026-09-25'],
		present: ['2026-09-25'],
		missing: [],
		ok: true
	},
	quiz: { expected: 6, present: 2 },
	units: { expected: 6, present: 6 },
	passport: { expected: 3, present: 3 },
	recording: { expected: 3, present: 3 },
	g9mock: { expectedStarts: 2, expectedRows: 4, presentRows: 4 }
};

describe('ESL admin semester edit wizard ([slug] route)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockQueries();
		sessionStorage.clear();
		delete routeParams.slug;
	});

	it('resolves a friendly slug and lands the edit wizard on the summary', async () => {
		routeParams.slug = '2026-2027-S1';
		await render(EditPage);

		await expect.element(page.getByTestId('wizard.root')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.title')).toMatchTextContent('Edit semester');
		// The loader pins the loaded state to the Step 5 summary.
		await expect.element(page.getByTestId('wizard.progress')).toMatchTextContent('Step 5 of 5');
		await expect
			.element(page.getByTestId('wizard.step-5-tab'))
			.toHaveAttribute('aria-current', 'step');
		await expect.element(page.getByTestId('wizard.edit-mode')).toBeInTheDocument();
	});

	it('renders the loaded semester data on the Step 5 summary', async () => {
		routeParams.slug = '2026-2027-S1';
		await render(EditPage);

		// The loader recovered the saved rows: start-of-school and the
		// off day surface in the preview list (the stray task row that
		// fits no slot lives only in the inferred report below). Rows are
		// title + short date now; the off-day name lives in the popover.
		const list = page.getByTestId('wizard.step-5-event-list');
		await expect.element(list).toMatchTextContent('Start of school');
		await expect.element(list).toMatchTextContent('Off');
		await expect.element(list).toMatchTextContent('9/25');
	});

	it('surfaces the inferred report inline on the summary, never as a modal', async () => {
		routeParams.slug = '2026-2027-S1';
		await render(EditPage);

		// The stray task row has no note, so the loader reports it
		// instead of silently mapping it.
		await expect.element(page.getByTestId('wizard.inferred')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.inferred')).toMatchTextContent('Stray note');
	});

	it('shows the advisory checklist on the summary after load', async () => {
		routeParams.slug = '2026-2027-S1';
		await render(EditPage);

		await expect.element(page.getByTestId('checklist-panel')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('checklist-panel.group-unit-quiz'))
			.toMatchTextContent('2/6');
	});

	it('free-navigates to earlier steps with the loader data intact', async () => {
		routeParams.slug = '2026-2027-S1';
		await render(EditPage);

		await page.getByTestId('wizard.step-1-tab').click();
		await expect.element(page.getByTestId('wizard.step-1')).toBeInTheDocument();
		await expect.element(page.getByTestId('wizard.step-1-room-limit')).toHaveValue('E');
		await expect
			.element(page.getByTestId('wizard.step-1-room-settings'))
			.toMatchTextContent('Library');
		// Steps 2–5 stay reachable from there (free navigation in edit mode).
		await expect.element(page.getByTestId('wizard.step-2-tab')).toBeEnabled();
		await expect.element(page.getByTestId('wizard.step-5-tab')).toBeEnabled();
	});

	it('warns when the semester is currently running', async () => {
		// Real today is inside 2026-08-31 → 2027-01-20.
		routeParams.slug = '2026-2027-S1';
		await render(EditPage);

		const warning = page.getByTestId('esl-admin-semester-detail.status-warning');
		await expect.element(warning).toBeInTheDocument();
		await expect.element(warning).toMatchTextContent(/currently running/);
	});

	it('warns when the semester is already closed', async () => {
		routeParams.slug = '2000-2001-S1';
		vi.mocked(useQuery).mockImplementation(((query: unknown) => {
			const name = getFunctionName(query as never);
			if (name === 'esl/semesters:list') {
				return {
					data: [{ ...SEMESTER, year: '2000-2001', derivedEnd: '2001-01-20' }],
					isLoading: false,
					error: null
				};
			}
			if (name === 'esl/events:listBySemester') {
				return { data: EVENTS, isLoading: false, error: null };
			}
			return { data: null, isLoading: false, error: null };
		}) as never);
		await render(EditPage);

		const warning = page.getByTestId('esl-admin-semester-detail.status-warning');
		await expect.element(warning).toBeInTheDocument();
		await expect.element(warning).toMatchTextContent(/already closed/);
	});

	it('shows no warn banner for an upcoming semester', async () => {
		routeParams.slug = '2999-3000-S1';
		vi.mocked(useQuery).mockImplementation(((query: unknown) => {
			const name = getFunctionName(query as never);
			if (name === 'esl/semesters:list') {
				return {
					data: [{ ...SEMESTER, year: '2999-3000', startDate: '2999-09-01' }],
					isLoading: false,
					error: null
				};
			}
			if (name === 'esl/events:listBySemester') {
				return { data: EVENTS, isLoading: false, error: null };
			}
			return { data: null, isLoading: false, error: null };
		}) as never);
		await render(EditPage);

		await expect
			.element(page.getByTestId('esl-admin-semester-detail.status-warning'))
			.not.toBeInTheDocument();
	});

	it('still resolves a legacy Convex id (old bookmarks, e2e links)', async () => {
		routeParams.slug = 'sem_s1';
		await render(EditPage);
		await expect.element(page.getByTestId('wizard.root')).toBeInTheDocument();
	});

	it('reports a missing semester for an unknown slug', async () => {
		routeParams.slug = '1999-2000-S9';
		await render(EditPage);
		await expect.element(page.getByTestId('esl-admin-semester-detail.missing')).toBeInTheDocument();
	});
});
