import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const { mutationMock } = vi.hoisted(() => ({
	mutationMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
	useQuery: vi.fn(),
	useConvexClient: vi.fn(() => ({
		mutation: mutationMock,
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

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
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
	return render(RootPage);
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

	it('renders nothing while the profile query is loading (no intermediate screen)', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue(mockAuthenticatedAuth() as never);
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(mockProfileQueryResult({ isLoading: true }) as never);

		renderRootPage();
		await expect.element(page.getByText('HWIS')).not.toBeInTheDocument();
		await expect.element(page.getByText('Loading...')).not.toBeInTheDocument();
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

	it('renders nothing and redirects for an approved admin (no intermediate screen)', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue(mockAuthenticatedAuth() as never);
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(
			mockProfileQueryResult({
				user: { role: 'admin', status: 'active', name: 'Test Admin' }
			}) as never
		);

		renderRootPage();

		await expect.element(page.getByText('HWIS')).not.toBeInTheDocument();
		await expect.element(page.getByText('Loading...')).not.toBeInTheDocument();
		await expect.element(page.getByText('Account Pending Approval')).not.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/admin');
		});
	});

	it('does not ensure a user profile while the Convex token is stale (anonymous profile)', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue(mockAuthenticatedAuth() as never);
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(mockProfileQueryResult({ user: null }) as never);

		renderRootPage();

		expect(mutationMock).not.toHaveBeenCalled();
	});

	it('ensures a user profile once the Convex token is confirmed (new user, no profile yet)', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue(mockAuthenticatedAuth() as never);
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(
			mockProfileQueryResult({
				user: {
					name: 'New Teacher',
					role: undefined,
					status: undefined,
					profileExists: false
				}
			}) as never
		);

		renderRootPage();

		await vi.waitFor(() => {
			expect(mutationMock).toHaveBeenCalled();
		});
	});

	it('does not re-ensure a user profile for an existing user (profileExists true)', async () => {
		const { useAuth } = await import('@mmailaender/convex-better-auth-svelte/svelte');
		vi.mocked(useAuth).mockReturnValue(mockAuthenticatedAuth() as never);
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(
			mockProfileQueryResult({
				user: { role: 'teacher', status: 'active', name: 'Existing Teacher', profileExists: true }
			}) as never
		);

		renderRootPage();

		expect(mutationMock).not.toHaveBeenCalled();
	});
});
