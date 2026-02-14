import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: null,
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

import AcademicPage from '$src/routes/admin/academic/+page.svelte';

describe('Academic Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title', async () => {
		render(AcademicPage);
		await expect.element(page.getByText('Advance Academic Year')).toBeInTheDocument();
	});

	it('renders promote students description', async () => {
		render(AcademicPage);
		await expect.element(page.getByText('Promote all enrolled students')).toBeInTheDocument();
	});
});
