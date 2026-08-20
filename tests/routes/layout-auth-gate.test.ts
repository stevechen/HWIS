import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildViewerSession, type ViewerSessionConfig } from '../mocks/route-mocks';

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
	createSvelteAuthClient: vi.fn()
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

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import Layout from '$src/routes/+layout.svelte';

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

describe('root layout auth gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPageUrl.pathname = '/admin';
		mockPageUrl.search = '';
	});

	it('redirects an unauthenticated user to /login with a callbackUrl', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isAuthenticated: false } }));

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/login?callbackUrl=%2Fadmin');
		});
	});

	it('does not redirect while auth is still loading', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isLoading: true } }));

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('does not redirect an authenticated user', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher', status: 'active' }));

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('does not redirect on the login page', async () => {
		mockPageUrl.pathname = '/login';
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isAuthenticated: false } }));

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('includes search params in the callbackUrl', async () => {
		mockPageUrl.pathname = '/evaluations';
		mockPageUrl.search = '?status=pending';
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isAuthenticated: false } }));

		render(Layout);

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/login?callbackUrl=%2Fevaluations%3Fstatus%3Dpending');
		});
	});
});
