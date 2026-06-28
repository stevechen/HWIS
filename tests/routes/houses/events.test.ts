import { page } from 'vitest/browser';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockEventsData = [
	{
		_id: 'evt1',
		title: 'Sports Day',
		startDate: Date.UTC(2024, 0, 1),
		endDate: Date.UTC(2024, 0, 15),
		housePoints: { Heracles: 10, Wukong: 5, Ixbalam: 8, Setna: 3 }
	}
];

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockEventsData,
		isLoading: false,
		isStale: false,
		error: undefined
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin', role: 'admin' } }
	}))
}));

import EventsPage from '$src/routes/houses/+page.svelte';

describe('House Events Page', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Structure', () => {
		it('renders page title', async () => {
			render(EventsPage);
			await expect.element(page.getByRole('heading', { name: 'House Events' })).toBeInTheDocument();
		});

		it('renders "New Event" button', async () => {
			render(EventsPage);
			await expect.element(page.getByRole('button', { name: 'New Event' })).toBeInTheDocument();
		});

		it('renders "Display House Scores" button', async () => {
			render(EventsPage);
			await expect
				.element(page.getByRole('button', { name: 'Display House Scores' }))
				.toBeInTheDocument();
		});

		it('renders event cards with title', async () => {
			render(EventsPage);
			await expect.element(page.getByText('Sports Day')).toBeInTheDocument();
		});

		it('renders event cards with date range', async () => {
			render(EventsPage);
			await expect.element(page.getByText(/jan 2024/i)).toBeInTheDocument();
		});

		it('renders event cards with points', async () => {
			render(EventsPage);
			await expect.element(page.getByText('Heracles')).toBeInTheDocument();
		});

		it('renders Edit button on event card', async () => {
			render(EventsPage);
			await expect.element(page.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
		});

		it('renders Delete button on event card', async () => {
			render(EventsPage);
			await expect.element(page.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		});

		it('renders create/edit dialog with form fields', async () => {
			render(EventsPage);
			const newEventBtn = page.getByRole('button', { name: 'New Event' });
			await newEventBtn.click();
			await expect.element(page.getByRole('dialog')).toBeInTheDocument();
			await expect.element(page.getByLabelText('Event Title')).toBeInTheDocument();
			await expect.element(page.getByLabelText('Start Date')).toBeInTheDocument();
			await expect.element(page.getByLabelText('End Date')).toBeInTheDocument();
		});

		it('renders delete confirmation dialog', async () => {
			render(EventsPage);
			const deleteBtn = page.getByRole('button', { name: 'Delete' });
			await deleteBtn.click();
			await expect.element(page.getByRole('dialog')).toBeInTheDocument();
			await expect.element(page.getByRole('heading', { name: 'Delete Event' })).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('renders empty state when no events', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: [],
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(EventsPage);
			await expect.element(page.getByText('No Events Yet')).toBeInTheDocument();
		});
	});
});
