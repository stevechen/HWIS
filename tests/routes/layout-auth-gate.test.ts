import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockPageUrl = { pathname: '/admin', search: '' };

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
		isAuthenticated: true
	}))
}));

vi.mock('$lib/auth-client', () => ({
	authClient: {
		useSession: vi.fn(() => ({
			subscribe(run: (value: { isPending: boolean; data: unknown }) => void) {
				run({ isPending: false, data: null });
				return () => {};
			}
		})),
		signOut: vi.fn().mockResolvedValue(undefined)
	}
}));

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

vi.mock('$app/stores', async () => {
	const actual = await vi.importActual('$app/stores');
	return {
		...actual,
		page: {
			subscribe: vi.fn(
				(callback: (value: { url: { pathname: string; search: string } }) => void) => {
					callback({ url: mockPageUrl });
					return () => {};
				}
			)
		}
	};
});

import Layout from '$src/routes/+layout.svelte';
import { useQuery } from 'convex-svelte';
import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

function mockProfileQueryResult(user: unknown) {
	return {
		data: { user, actor: { kind: 'staff' }, capabilities: {} },
		isLoading: false,
		error: undefined,
		isStale: false
	} as unknown as ReturnType<typeof useQuery>;
}

function mockAuth(auth: { isLoading: boolean; isAuthenticated: boolean }) {
	vi.mocked(useAuth).mockReturnValue({
		...auth,
		fetchAccessToken: vi.fn()
	});
}

describe('root layout auth gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPageUrl.pathname = '/admin';
		mockPageUrl.search = '';
		vi.mocked(useQuery).mockReturnValue(mockProfileQueryResult(null));
		mockAuth({ isLoading: false, isAuthenticated: true });
	});

	it('redirects an unauthenticated user to /login with a callbackUrl', async () => {
		mockAuth({ isLoading: false, isAuthenticated: false });

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/login?callbackUrl=%2Fadmin');
		});
	});

	it('does not redirect while auth is still loading', async () => {
		mockAuth({ isLoading: true, isAuthenticated: false });

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('does not redirect an authenticated user', async () => {
		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('does not redirect on the login page', async () => {
		mockPageUrl.pathname = '/login';
		mockAuth({ isLoading: false, isAuthenticated: false });

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('includes search params in the callbackUrl', async () => {
		mockPageUrl.pathname = '/evaluations';
		mockPageUrl.search = '?status=pending';
		mockAuth({ isLoading: false, isAuthenticated: false });

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/login?callbackUrl=%2Fevaluations%3Fstatus%3Dpending');
		});
	});
});
