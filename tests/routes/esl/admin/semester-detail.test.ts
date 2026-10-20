import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import { useQuery } from 'convex-svelte';

const mockMutation = vi.fn().mockResolvedValue(undefined);

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
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
import DetailPage from '$src/routes/esl/admin/semesters/[slug]/+page.svelte';

const SEMESTER = {
	_id: 'sem_s1',
	year: '2026-2027',
	term: 'S1',
	startDate: '2026-08-31',
	derivedEnd: '2027-01-20'
};

const EVENTS = [
	{
		_id: 'evt_exam1',
		semesterId: 'sem_s1',
		type: 'exam',
		title: 'Exam 1',
		target: 'all',
		date: '2026-11-02',
		note: '',
		unverified: false
	}
];

/** Dispatch the three queries the detail page makes. `api` is a Proxy
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
		return { data: null, isLoading: false, error: null };
	}) as never);
}

describe('ESL admin semester detail page (friendly slug)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		mockQueries();
		delete routeParams.slug;
	});

	it('resolves a friendly slug to the semester and renders its calendar', async () => {
		routeParams.slug = '2026-2027-S1';
		await render(DetailPage);
		// Header shows the term; the wizard-built calendar preview renders.
		await expect.element(page.getByText('2026-2027')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('esl-admin-semester-detail.calendar'))
			.toBeInTheDocument();
		// The exam event row lists below the calendar.
		await expect
			.element(page.getByTestId('esl-admin-semester-detail.events').getByText('Exam 1'))
			.toBeInTheDocument();
	});

	it('still resolves a legacy Convex id (old bookmarks, e2e links)', async () => {
		routeParams.slug = 'sem_s1';
		await render(DetailPage);
		await expect.element(page.getByText('2026-2027')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('esl-admin-semester-detail.calendar'))
			.toBeInTheDocument();
	});

	it('reports a missing semester for an unknown slug', async () => {
		routeParams.slug = '1999-2000-S9';
		await render(DetailPage);
		await expect.element(page.getByTestId('esl-admin-semester-detail.missing')).toBeInTheDocument();
	});
});
