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

const activeAdminUser = {
	role: 'admin',
	status: 'active',
	name: 'Test Admin'
} as const;

const pendingUser = {
	role: 'teacher',
	status: 'pending',
	name: 'Test Pending'
} as const;

function mockProfileQueryResult(user: unknown) {
	return {
		data: { user, actor: { kind: 'staff' }, capabilities: {} },
		isLoading: false,
		error: undefined,
		isStale: false
	} as unknown as {
		data: { user: unknown; actor: unknown; capabilities: unknown };
		isLoading: boolean;
		error: Error | undefined;
		isStale: boolean;
	};
}

import Layout from '$src/routes/+layout.svelte';

describe('access control', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPagePath.pathname = '/evaluations';
	});

	it('active admin can access /admin - page content visible', async () => {
		mockPagePath.pathname = '/admin';
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(mockProfileQueryResult(activeAdminUser) as never);

		render(Layout);
		// The Layout renders the header with title "Admin Dashboard" when on /admin
		await expect.element(page.getByText('Admin Dashboard')).toBeInTheDocument();
	});

	it('pending user sees modal on /evaluations', async () => {
		mockPagePath.pathname = '/evaluations';
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(mockProfileQueryResult(pendingUser) as never);

		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});

	it('pending user sees modal on /admin', async () => {
		mockPagePath.pathname = '/admin';
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue(mockProfileQueryResult(pendingUser) as never);

		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});
});
