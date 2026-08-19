import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

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
	useAuth: vi.fn()
}));

import AdminLayout from '$src/routes/admin/+layout.svelte';
import { useQuery } from 'convex-svelte';
import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

function mockProfile(user: unknown, isLoading = false) {
	vi.mocked(useQuery).mockReturnValue({
		data: { user, actor: { kind: 'anonymous' }, capabilities: {} },
		isLoading,
		error: undefined,
		isStale: false
	} as never);
}

function mockAuth({
	isLoading,
	isAuthenticated
}: {
	isLoading: boolean;
	isAuthenticated: boolean;
}) {
	vi.mocked(useAuth).mockReturnValue({
		isLoading,
		isAuthenticated,
		data: isAuthenticated ? { user: { name: 'Test' } } : null
	} as never);
}

const spinner = () => page.getByRole('status', { name: 'Loading' });

describe('admin layout auth gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows spinner, does not bounce, while auth has not settled even if profile resolved anonymous', async () => {
		// The pre-fix regression: profile resolves to anonymous (user: null)
		// before the Convex JWT is set, and the gate treated that as "not admin".
		mockAuth({ isLoading: false, isAuthenticated: false });
		mockProfile(null);

		render(AdminLayout, {
			props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
		});

		await expect.element(spinner()).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('shows spinner, does not bounce, while auth is still loading', async () => {
		mockAuth({ isLoading: true, isAuthenticated: false });
		mockProfile(null);

		render(AdminLayout, {
			props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
		});

		await expect.element(spinner()).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('shows spinner, does not bounce, while the profile query is loading', async () => {
		mockAuth({ isLoading: false, isAuthenticated: true });
		mockProfile(null, true);

		render(AdminLayout, {
			props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
		});

		await expect.element(spinner()).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('shows spinner, does not bounce, when profile still holds anonymous user after auth settled', async () => {
		// Microtask race: isConvexAuthenticated flips true before the profile
		// query re-fetches with the JWT. The gate must keep waiting.
		mockAuth({ isLoading: false, isAuthenticated: true });
		mockProfile(null);

		render(AdminLayout, {
			props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
		});

		await expect.element(spinner()).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('bounces to / once loaded and the user is not an admin', async () => {
		mockAuth({ isLoading: false, isAuthenticated: true });
		mockProfile({ role: 'teacher', status: 'active' });

		render(AdminLayout, {
			props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
		});

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/');
		});
	});

	it('renders children once loaded and the user is an admin', async () => {
		mockAuth({ isLoading: false, isAuthenticated: true });
		mockProfile({ role: 'admin', status: 'active' });

		render(AdminLayout, {
			props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
		});

		await expect.element(page.getByText('ADMIN CONTENT')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});
});
