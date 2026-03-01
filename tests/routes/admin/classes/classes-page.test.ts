import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		isLoading: false,
		error: null
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

import ClassesPage from '$src/routes/admin/classes/+page.svelte';

describe('Classes Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Structure', () => {
		it('renders grade filter checkboxes', async () => {
			render(ClassesPage);

			for (const grade of [7, 8, 9, 10, 11, 12]) {
				await expect
					.element(page.getByRole('checkbox', { name: String(grade) }))
					.toBeInTheDocument();
			}
		});

		it('renders add class buttons for each grade', async () => {
			render(ClassesPage);

			// Check that add class buttons exist
			const addButtons = page.getByRole('button', { name: /add class/i });
			await expect.element(addButtons.first()).toBeInTheDocument();
		});

		it('renders IB toggle buttons for grades', async () => {
			render(ClassesPage);

			// IB toggle buttons should exist (using img alt text as proxy)
			await expect.element(page.getByAltText('IB').first()).toBeInTheDocument();
		});
	});
});
