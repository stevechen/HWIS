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

const activeTeacherUser = {
	role: 'teacher',
	status: 'active',
	name: 'Test Teacher'
};

const activeAdminUser = {
	role: 'admin',
	status: 'active',
	name: 'Test Admin'
};

const pendingUser = {
	role: 'teacher',
	status: 'pending',
	name: 'Test Pending'
};

import Layout from '$src/routes/+layout.svelte';

describe('access control', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPagePath.pathname = '/evaluations';
	});

	it('active teacher can access /evaluations - page content visible', async () => {
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue({
			data: activeTeacherUser,
			isLoading: false,
			error: null
		} as any);

		render(Layout);
		await expect.element(page.getByRole('heading', { name: 'Evaluation History' })).toBeInTheDocument();
	});

	it('active admin can access /admin - page content visible', async () => {
		mockPagePath.pathname = '/admin';
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue({
			data: activeAdminUser,
			isLoading: false,
			error: null
		} as any);

		render(Layout);
		await expect.element(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument();
	});

	it('pending user sees modal on /evaluations', async () => {
		mockPagePath.pathname = '/evaluations';
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue({
			data: pendingUser,
			isLoading: false,
			error: null
		} as any);

		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});

	it('pending user sees modal on /admin', async () => {
		mockPagePath.pathname = '/admin';
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue({
			data: pendingUser,
			isLoading: false,
			error: null
		} as any);

		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});
});
