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

import { api } from '$convex/_generated/api';
import SemestersPage from '$src/routes/esl/admin/semesters/+page.svelte';
import { schoolYearForTerm, startPickerMondays } from '$lib/components/esl/wizard/wizard-dates';

// The component uses a string key for today context
const TODAY_KEY = 'esl-admin.today';

/**
 * Dates pinned far from any real today so the status chips are deterministic:
 * a finished 2000 term (closed), a 2999 term (upcoming), and an exam-less
 * 2000 term that stays current (finals TBD).
 */
const SEMESTERS = [
	{
		_id: 'sem_past',
		year: '2000-2001',
		term: 'S1',
		startDate: '2000-09-01',
		derivedEnd: '2001-01-20'
	},
	{
		_id: 'sem_future',
		year: '2999-3000',
		term: 'S1',
		startDate: '2999-09-01',
		derivedEnd: '3000-01-20'
	},
	{
		_id: 'sem_tbd',
		year: '2000-2001',
		term: 'S2',
		startDate: '2000-02-09',
		derivedEnd: null
	}
];

/** The list page makes one query — canned semesters, never loading. */
function mockQueries() {
	vi.mocked(useQuery).mockImplementation((() => ({
		data: SEMESTERS,
		isLoading: false,
		error: null
	})) as never);
}

function renderWithToday(today: string) {
	return render(SemestersPage, {
		context: new Map([[TODAY_KEY, today]])
	});
}

describe('ESL admin semesters page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		mockQueries();
	});

	it('titles the Semesters section', async () => {
		renderWithToday('2000-10-15');
		await expect.element(page.getByRole('heading', { name: 'Semesters' })).toBeInTheDocument();
	});

	it('chips every semester upcoming, current, or closed from its dates', async () => {
		renderWithToday('2000-10-15');
		// With today=2000-10-15: sem_past (2000-09-01 to 2001-01-20) -> current
		// sem_future (2999-09-01) -> upcoming
		// sem_tbd (2000-02-09, no end) -> current
		const chips = page.getByTestId('semester-status');
		await expect.element(chips.first()).toBeInTheDocument();
		await expect.element(chips.nth(1)).toBeInTheDocument();
		await expect.element(chips.nth(2)).toBeInTheDocument();
		// Check text content via toHaveTextContent
		await expect.element(chips.first()).toMatchTextContent('Current');
		await expect.element(chips.nth(1)).toMatchTextContent('Upcoming');
		await expect.element(chips.nth(2)).toMatchTextContent('Current');
	});

	it('shows the derived end, or finals TBD while exam-less', async () => {
		renderWithToday('2000-10-15');
		await expect.element(page.getByText(/Ends 2001-01-20/)).toBeInTheDocument();
		await expect.element(page.getByText('Finals TBD')).toBeInTheDocument();
	});

	it('links each semester to its detail screen', async () => {
		renderWithToday('2000-10-15');
		const link = page.getByRole('link', { name: '2000-2001 S1' });
		await expect.element(link).toBeInTheDocument();
		expect(link.element().getAttribute('href')).toBe('/esl/admin/semesters/2000-2001-S1');
	});

	it('creates a semester from the form — S2 any time, no gate', async () => {
		renderWithToday('2000-10-15');
		await page.getByTestId('esl-admin-semesters.term-S2').click();
		// The picker rows derive from the pinned today via the same helpers
		// the component uses, so the first Monday is exact, not guessed.
		const firstMonday = startPickerMondays('S2', schoolYearForTerm('S2', '2000-10-15'))[0] ?? '';
		await page.getByTestId(`esl-admin-semesters.picker.date-${firstMonday}`).click();
		await page.getByTestId('esl-admin-semesters.create-btn').click();
		await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
		expect(mockMutation).toHaveBeenCalledWith(api.esl.semesters.create, {
			year: '2000-2001',
			term: 'S2',
			startDate: firstMonday
		});
	});

	it('shows the refusal when the term already exists', async () => {
		mockMutation.mockRejectedValueOnce(new Error('2000-2001 S1 already exists.'));
		renderWithToday('2000-10-15');
		await page.getByTestId('esl-admin-semesters.term-S2').click();
		const firstMonday = startPickerMondays('S2', schoolYearForTerm('S2', '2000-10-15'))[0] ?? '';
		await page.getByTestId(`esl-admin-semesters.picker.date-${firstMonday}`).click();
		await page.getByTestId('esl-admin-semesters.create-btn').click();
		await expect.element(page.getByText('2000-2001 S1 already exists.')).toBeInTheDocument();
	});
});
