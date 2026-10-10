import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';

const mockMutation = vi.fn().mockResolvedValue(undefined);

vi.mock('$app/state', () => ({
	page: {
		params: { semesterId: 'sem_s1' },
		url: new URL('http://localhost/esl/admin/semesters/sem_s1')
	}
}));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn().mockResolvedValue({})
	}))
}));

import { api } from '$convex/_generated/api';
import SemesterDetailPage from '$src/routes/esl/admin/semesters/[semesterId]/+page.svelte';

const S1 = {
	_id: 'sem_s1',
	year: '2025-2026',
	term: 'S1',
	startDate: '2025-09-01',
	derivedEnd: '2026-01-20'
};

const S2 = {
	_id: 'sem_s2',
	year: '2025-2026',
	term: 'S2',
	startDate: '2026-02-09',
	derivedEnd: null
};

const FINAL_EXAM = {
	_id: 'event_final',
	semesterId: 'sem_s1',
	type: 'exam',
	label: 'Final exam',
	target: 'all',
	date: '2026-01-20'
};

const PASSPORT_DUE = {
	_id: 'event_passport',
	semesterId: 'sem_s1',
	type: 'task_due',
	label: 'Passport check',
	target: 'Comm',
	date: '2025-10-06',
	endDate: '2025-10-10',
	note: 'Collect at the gate'
};

/** Routes each `useQuery` call to canned data by its Convex function name. */
function mockQueries(events: unknown[], semesters: unknown[] = [S1, S2]) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const name = getFunctionName(reference as never);
		if (name === 'esl/semesters:list') return { data: semesters, isLoading: false, error: null };
		return { data: events, isLoading: false, error: null };
	}) as never);
}

describe('ESL admin semester detail page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		mockQueries([FINAL_EXAM, PASSPORT_DUE]);
	});

	it('heads the screen with the term and its derived end plus source', async () => {
		render(SemesterDetailPage);
		await expect.element(page.getByRole('heading', { name: '2025-2026 S1' })).toBeInTheDocument();
		await expect.element(page.getByText('Ends 2026-01-20, from Final exam')).toBeInTheDocument();
	});

	it('lists events with their targets and notes', async () => {
		render(SemesterDetailPage);
		const list = page.getByTestId('esl-admin-semester-detail.events');
		await expect.element(list.getByText('Passport check')).toBeInTheDocument();
		await expect.element(list.getByText('Comm')).toBeInTheDocument();
		await expect.element(list.getByText('Collect at the gate')).toBeInTheDocument();
	});

	it('marks exams protected: editable, never deletable', async () => {
		render(SemesterDetailPage);
		await expect.element(page.getByText('Protected')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Delete Final exam' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Delete Passport check' }))
			.toBeInTheDocument();
	});

	it('adds an event through the one type-driven form', async () => {
		render(SemesterDetailPage);
		await page.getByRole('textbox', { name: 'Label' }).fill('Sport makeup');
		await page.getByRole('textbox', { name: 'Date' }).fill('2025-10-06');
		await page.getByRole('button', { name: 'Add event' }).click();
		await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
		expect(mockMutation).toHaveBeenCalledWith(
			api.esl.events.create,
			expect.objectContaining({
				label: 'Sport makeup',
				date: '2025-10-06'
			})
		);
	});

	it('refuses collisions with the backend message, keeping the form', async () => {
		mockMutation.mockRejectedValueOnce(
			new Error(
				'[CONVEX M(esl/events:create)] Uncaught Error: 2026-01-20 already holds an exam (Final exam). Called by client'
			)
		);
		render(SemesterDetailPage);
		await page.getByRole('textbox', { name: 'Label' }).fill('Clash');
		await page.getByRole('textbox', { name: 'Date' }).fill('2026-01-20');
		await page.getByRole('button', { name: 'Add event' }).click();
		await expect
			.element(page.getByText('2026-01-20 already holds an exam (Final exam).'))
			.toBeInTheDocument();
	});

	it('warns without refusing when an S1 exam crosses into S2', async () => {
		render(SemesterDetailPage);
		await page.getByRole('textbox', { name: 'Date' }).fill('2026-02-10');
		await expect.element(page.getByTestId('event-form.warning')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add event' })).toBeEnabled();
	});

	it('seeds drafts while the semester is still empty', async () => {
		mockQueries([], [{ ...S1, derivedEnd: null }, S2]);
		render(SemesterDetailPage);
		await expect.element(page.getByText(/Final exams TBD/)).toBeInTheDocument();
		await page.getByRole('textbox', { name: 'Exam 1 starts' }).fill('2025-11-24');
		await page.getByRole('button', { name: 'Seed drafts' }).click();
		await expect.poll(() => mockMutation.mock.calls.length).toBe(1);
		expect(mockMutation).toHaveBeenCalledWith(
			api.esl.seed.seed,
			expect.objectContaining({
				examStarts: { exam1: '2025-11-24' }
			})
		);
	});
});
