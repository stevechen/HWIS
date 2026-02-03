import { redirect } from '@sveltejs/kit';
import { getAuthState } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { createAuth } from '$convex/auth.js';

export const load = async ({
	cookies,
	url,
	locals
}: {
	cookies: { get: (name: string) => string | undefined };
	url: URL;
	locals: { token?: string };
}) => {
	const isLoginPage = url.pathname === '/login';
	const authState = await getAuthState(createAuth, cookies);

	// Redirect logic for SSR protection
	const isAuthenticated = !!locals.token || authState.isAuthenticated;

	if (!isAuthenticated && !isLoginPage) {
		const callbackUrl = `${url.pathname}${url.search}`;
		const redirectTo = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
		throw redirect(302, redirectTo);
	}

	return {
		authState
	};
};
