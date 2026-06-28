import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockPagePath = { pathname: '/' };

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	createSvelteAuthClient: vi.fn(),
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test User' } }
	}))
}));

vi.mock('$app/stores', async () => {
	const actual = await vi.importActual('$app/stores');
	return {
		...actual,
		page: {
			subscribe: vi.fn((callback) => {
				callback({ url: mockPagePath });
				return () => {};
			})
		}
	};
});

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

const pendingUser = {
	role: 'teacher',
	status: 'pending',
	name: 'Test Pending'
};

import HomePage from '$src/routes/+page.svelte';

describe('home page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('pending user sees pending approval heading', async () => {
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue({
			data: pendingUser,
			isLoading: false,
			error: null
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		render(HomePage);
		await expect
			.element(page.getByRole('heading', { name: 'Account Pending Approval' }))
			.toBeInTheDocument();
	});
});
