import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockPagePath = { pathname: '/evaluations' };

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
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

vi.mock('$lib/auth-client', () => ({
	authClient: {
		signOut: vi.fn().mockResolvedValue({ error: null })
	}
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

const pendingUser = {
	role: 'teacher',
	status: 'pending',
	name: 'Test Pending'
} as const;

interface MockQueryResult<T> {
	data: T;
	isLoading: false;
	error: undefined;
	isStale: boolean;
}

import Layout from '$src/routes/+layout.svelte';

describe('access modal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPagePath.pathname = '/evaluations';
	});

	it('modal appears for pending users', async () => {
		const { useQuery } = await import('convex-svelte');
		const mockResult: MockQueryResult<typeof pendingUser> = {
			data: pendingUser,
			isLoading: false,
			error: undefined,
			isStale: false
		};
		vi.mocked(useQuery).mockReturnValue(mockResult);

		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});

	it('modal has correct message', async () => {
		const { useQuery } = await import('convex-svelte');
		const mockResult: MockQueryResult<typeof pendingUser> = {
			data: pendingUser,
			isLoading: false,
			error: undefined,
			isStale: false
		};
		vi.mocked(useQuery).mockReturnValue(mockResult);

		render(Layout);
		await expect
			.element(page.getByRole('heading', { name: 'Access Restricted' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('Your account access has been changed. Please sign in again.'))
			.toBeInTheDocument();
	});

	it('modal sign in again button is visible', async () => {
		const { useQuery } = await import('convex-svelte');
		const mockResult: MockQueryResult<typeof pendingUser> = {
			data: pendingUser,
			isLoading: false,
			error: undefined,
			isStale: false
		};
		vi.mocked(useQuery).mockReturnValue(mockResult);

		render(Layout);
		await expect.element(page.getByRole('button', { name: 'Sign In Again' })).toBeVisible();
	});
});
