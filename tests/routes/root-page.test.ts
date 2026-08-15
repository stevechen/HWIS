import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

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

import RootPage from '$src/routes/+page.svelte';

function mockProfileQueryResult(overrides: Partial<{ user: unknown; isLoading: boolean }>) {
	return {
		data: {
			user: overrides.user ?? null,
			actor: { kind: 'anonymous' },
			capabilities: {}
		},
		isLoading: overrides.isLoading ?? false,
		error: undefined,
		isStale: false
	} as unknown as {
		data: { user: unknown; actor: unknown; capabilities: unknown };
		isLoading: boolean;
		error: Error | undefined;
		isStale: boolean;
	};
}

function renderRootPage() {
	return render(RootPage, { props: { data: {} } });
}

function mockAuthenticatedAuth() {
	return {
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test User' } }
	};
}

describe('Root Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows sign-in card when logged out', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue({
			isLoading: false,
			isAuthenticated: false,
			data: null
		} as never);

		renderRootPage();
		await expect.element(page.getByText('Please sign in to continue')).toBeInTheDocument();
	});

	it('shows loading state while the profile query is loading', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue(mockAuthenticatedAuth() as never);
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(mockProfileQueryResult({ isLoading: true }) as never);

		renderRootPage();
		await expect.element(page.getByText('Loading...')).toBeInTheDocument();
	});

	it('shows pending approval state for an unapproved profile', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue(mockAuthenticatedAuth() as never);
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(
			mockProfileQueryResult({
				user: { role: 'teacher', status: 'pending', name: 'Test User' }
			}) as never
		);

		renderRootPage();
		await expect.element(page.getByText('Account Pending Approval')).toBeInTheDocument();
	});
});
