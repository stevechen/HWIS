import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('ESL admin semesters page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		mockQueries();
	});

	it('titles the Semesters section', async () => {
		render(SemestersPage);
		await expect.element(page.getByRole('heading', { name: 'Semesters' })).toBeInTheDocument();
	});

	it('chips every semester upcoming, current, or closed from its dates', async () => {
		render(SemestersPage);
		await expect.element(page.getByText('Closed')).toBeInTheDocument();
		await expect.element(page.getByText('Upcoming')).toBeInTheDocument();
		await expect.element(page.getByText('Current')).toBeInTheDocument();
	});

	it('shows the derived end, or finals TBD while exam-less', async () => {
		render(SemestersPage);
		await expect.element(page.getByText(/Ends 2001-01-20/)).toBeInTheDocument();
		await expect.element(page.getByText('Finals TBD')).toBeInTheDocument();
	});

	it('links each semester to its detail screen', async () => {
		render(SemestersPage);
		const link = page.getByRole('link', { name: '2000-2001 S1' });
		await expect.element(link).toBeInTheDocument();
		expect(link.element().getAttribute('href')).toBe('/esl/admin/semesters/sem_past');
	});

	it('creates a semester from the form — S2 any time, no gate', async () => {
		render(SemestersPage);
		await page.getByRole('textbox', { name: 'School year' }).fill('2000-2001');
		await page.getByRole('textbox', { name: 'Start date' }).fill('2000-02-09');
		await page.getByRole('button', { name: 'Create semester' }).click();
		await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
		expect(mockMutation).toHaveBeenCalledWith(api.esl.semesters.create, {
			year: '2000-2001',
			term: 'S1',
			startDate: '2000-02-09'
		});
	});

	it('shows the refusal when the term already exists', async () => {
		mockMutation.mockRejectedValueOnce(new Error('2000-2001 S1 already exists.'));
		render(SemestersPage);
		await page.getByRole('textbox', { name: 'School year' }).fill('2000-2001');
		await page.getByRole('textbox', { name: 'Start date' }).fill('2000-09-01');
		await page.getByRole('button', { name: 'Create semester' }).click();
		await expect.element(page.getByText('2000-2001 S1 already exists.')).toBeInTheDocument();
	});
});
