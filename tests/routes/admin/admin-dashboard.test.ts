import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => {
	return {
		useQuery: vi.fn(() => ({
			data: { role: 'admin' },
			isLoading: false,
			error: null
		})),
		useConvexClient: vi.fn(() => ({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		}))
	};
});

import AdminDashboard from '$src/routes/admin/+page.svelte';

describe('Admin Dashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders navigation links', async () => {
		render(AdminDashboard);
		await expect.element(page.getByRole('link', { name: 'Students' })).toBeInTheDocument();
	});
});
