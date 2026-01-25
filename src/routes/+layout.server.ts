import { redirect } from '@sveltejs/kit';

export const load = async ({
	cookies,
	url,
	locals
}: {
	cookies: { get: (name: string) => string | undefined };
	url: URL;
	locals: { token?: string };
}) => {
	const testAuthCookie = cookies.get('hwis_test_auth') || '';
	const sessionToken = cookies.get('convex_session_token') || '';

	const isLoginPage = url.pathname === '/login';
	const isLandingPage = url.pathname === '/';

	// Detect test mode
	const isTestAuthCookiePresent = testAuthCookie.length > 0;
	const isTestSessionToken = sessionToken.includes('test_');
	const isTestMode = isTestAuthCookiePresent || isTestSessionToken;

	// Redirect logic for SSR protection
	const isAuthenticated = !!locals.token || isTestMode;

	if (!isAuthenticated && !isLoginPage && !isLandingPage) {
		throw redirect(302, '/login');
	}

	let testRole: 'teacher' | 'admin' | 'super' | undefined = undefined;
	if (isTestAuthCookiePresent || isTestSessionToken) {
		// Support formats: "true", "true;role=admin", "admin", "super"
		const roleValue = testAuthCookie.split(';')[0].trim();
		if (['admin', 'super'].includes(roleValue)) {
			testRole = roleValue as 'admin' | 'super';
		} else if (isTestSessionToken) {
			// Infer role from session token if it looks like a test token
			if (sessionToken.includes('super')) {
				testRole = 'super';
			} else if (sessionToken.includes('admin')) {
				testRole = 'admin';
			}
		} else {
			// Check for role= in the full cookie value
			const roleMatch = testAuthCookie.match(/role=(\w+)/);
			if (roleMatch && ['admin', 'super', 'teacher'].includes(roleMatch[1])) {
				testRole = roleMatch[1] as 'teacher' | 'admin' | 'super';
			}
		}
	}

	return {
		isLoginPage: url.pathname === '/login',
		testRole,
		mockToken: locals.token,
		mockUser: (locals as any).user
	};
};
