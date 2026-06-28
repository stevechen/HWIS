import { page } from 'vitest/browser';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setupConvexMocks, setupAuthMocks, resetMockOptions } from '../mocks/convex-mocks';

const mockPagePath = { pathname: '/evaluations' };

vi.mock('$app/stores', async () => {
	const actual = await vi.importActual('$app/stores');
	return {
		...actual,
		page: {
			subscribe: (callback: (value: unknown) => void) => {
				callback({ url: mockPagePath });
				return () => {};
			}
		}
	};
});

vi.mock('$lib/auth-client', () => ({
	authClient: {
		signOut: (async () => ({ error: null })) as unknown as () => Promise<{ error: null }>
	}
}));

vi.mock('$app/navigation', () => ({
	goto: () => {}
}));

const pendingUser = {
	role: 'teacher',
	status: 'pending',
	name: 'Test Pending'
} as const;

import Layout from '$src/routes/+layout.svelte';

describe('access modal', () => {
	beforeEach(() => {
		resetMockOptions();
		mockPagePath.pathname = '/evaluations';
		setupConvexMocks({ data: pendingUser });
		setupAuthMocks({
			isAuthenticated: true,
			user: { name: 'Test Pending', role: 'teacher', status: 'pending' }
		});
	});

	it('modal appears for pending users', async () => {
		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});

	it('modal has correct message', async () => {
		render(Layout);
		await expect
			.element(page.getByRole('heading', { name: 'Access Restricted' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText('Your account access has been changed. Please sign in again.'))
			.toBeInTheDocument();
	});

	it('modal sign in again button is visible', async () => {
		render(Layout);
		await expect.element(page.getByRole('button', { name: 'Sign In Again' })).toBeVisible();
	});
});
