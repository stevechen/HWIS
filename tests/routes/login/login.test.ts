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

	it('displays Google SSO button', async () => {
		render(LoginPage);
		await expect
			.element(page.getByRole('button', { name: 'Sign in with Google' }))
			.toBeInTheDocument();
	});

	it('displays domain restriction note', async () => {
		render(LoginPage);
		await expect.element(page.getByText(/Only for HWIS staffs/i)).toBeInTheDocument();
	});

	it('links to the legal pages, which are unreachable without a session', async () => {
		// Google fetches the privacy URL from outside a session, so the only way a
		// visitor reaches it is this link — or by typing the URL, which would be
		// bounced to /login if the guard did not exempt it.
		render(LoginPage);
		await expect.element(page.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
	});
});
