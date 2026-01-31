import type { Handle } from '@sveltejs/kit';
import { createAuth } from '$convex/auth.js';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const handle: Handle = async ({ event, resolve }) => {
	const testAuthCookie = event.cookies.get('hwis_test_auth') || '';
	const sessionToken = event.cookies.get('convex_session_token') || '';
	const testRoleQuery = event.url.searchParams.get('testRole');

	// Detect test mode from EITHER source:
	// 1. hwis_test_auth cookie (e.g., "admin", "super", "true")
	// 2. convex_session_token that looks like a test token (contains "test_")
	// 3. testRole query parameter (for e2e tests)
	const isTestAuthCookiePresent = testAuthCookie.length > 0;
	const isTestSessionToken = sessionToken.includes('test_');
	const isTestModeFromQuery =
		testRoleQuery === 'teacher' || testRoleQuery === 'admin' || testRoleQuery === 'super';
	const isTestMode = isTestAuthCookiePresent || isTestSessionToken || isTestModeFromQuery;

	let testRole: 'admin' | 'super' | 'teacher' = 'teacher';
	if (isTestMode) {
		// Support formats: "true", "true;role=admin", "admin", "super"
		const roleValue = testAuthCookie.split(';')[0].trim();
		if (['admin', 'super'].includes(roleValue)) {
			testRole = roleValue as typeof testRole;
		} else if (isTestSessionToken) {
			// Infer role from session token if it looks like a test token
			if (sessionToken.includes('super')) {
				testRole = 'super';
			} else if (sessionToken.includes('admin')) {
				testRole = 'admin';
			}
		} else if (testRoleQuery && ['admin', 'super', 'teacher'].includes(testRoleQuery)) {
			// Use testRole from query parameter
			testRole = testRoleQuery as typeof testRole;
		} else {
			// Check for role= in the full cookie value
			const roleMatch = testAuthCookie.match(/role=(\w+)/);
			if (roleMatch && ['admin', 'super', 'teacher'].includes(roleMatch[1])) {
				testRole = roleMatch[1] as typeof testRole;
			}
		}
	}

	if (isTestMode) {
		const roleName =
			testRole === 'super' ? 'Super Admin' : testRole === 'admin' ? 'Admin' : 'Teacher';
		event.locals.token = 'test-token-admin-mock';
		event.locals.user = {
			_id: 'test-user-id',
			name: `Test ${roleName}`,
			email: `${testRole}@hwis.test`,
			role: testRole,
			status: 'active' as const
		};
		event.locals.isTestMode = true;
		event.locals.testRole = testRole;
	} else {
		try {
			event.locals.token = await getToken(createAuth, event.cookies);
		} catch {
			event.locals.token = undefined;
		}
		event.locals.isTestMode = false;
		event.locals.testRole = undefined;
	}

	const response = await resolve(event);

	if (isTestMode) {
		// Headers are immutable, so we need to clone and modify
		const newResponse = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: new Headers(response.headers)
		});
		newResponse.headers.set('x-test-mode', 'true');
		return newResponse;
	}

	return response;
};
