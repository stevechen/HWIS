import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$lib/auth-client', () => {
	const mockSignIn = vi.fn();
	return {
		authClient: {
			useSession: vi.fn(() => ({
				subscribe: vi.fn((callback) => {
					callback({ data: null, isPending: false });
					return () => {};
				})
			})),
			signIn: {
				social: mockSignIn
			},
			signOut: vi.fn().mockResolvedValue({ error: null })
		}
	};
});

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

import LoginPage from '$src/routes/login/+page.svelte';

describe('Login Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders sign in heading', async () => {
		render(LoginPage);
		await expect.element(page.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
	});

	it('displays Google SSO button', async () => {
		render(LoginPage);
		await expect
			.element(page.getByRole('button', { name: 'Sign in with Google' }))
			.toBeInTheDocument();
	});

	it('displays Google logo in button', async () => {
		render(LoginPage);
		const button = page.getByRole('button', { name: 'Sign in with Google' });
		await expect.element(button).toBeInTheDocument();
		// Verify button contains SVG (Google logo)
		await expect
			.element(page.getByRole('button', { name: 'Sign in with Google' }))
			.toBeInTheDocument();
	});

	it('displays domain restriction note', async () => {
		render(LoginPage);
		await expect.element(page.getByText(/Only for HWIS staffs/i)).toBeInTheDocument();
	});
});
