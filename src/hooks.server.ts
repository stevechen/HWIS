import type { Handle } from '@sveltejs/kit';
import { createAuth } from '$convex/auth.js';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';

type TestRole = 'admin' | 'super' | 'teacher';

export const handle: Handle = async ({ event, resolve }) => {
	const testAuthCookie = event.cookies.get('hwis_test_auth') || '';
	const isTestMode = testAuthCookie.length > 0;

	let testRole: TestRole = 'teacher';
	if (isTestMode) {
		// Support formats: "true", "true;role=admin", "admin", "super"
		const roleValue = testAuthCookie.split(';')[0].trim();
		if (['admin', 'super'].includes(roleValue)) {
			testRole = roleValue as TestRole;
		} else {
			// Check for role= in the full cookie value
			const roleMatch = testAuthCookie.match(/role=(\w+)/);
			if (roleMatch && ['admin', 'super', 'teacher'].includes(roleMatch[1])) {
				testRole = roleMatch[1] as TestRole;
			}
		}
	}

	if (isTestMode) {
		const roleName =
			testRole === 'super' ? 'Super Admin' : testRole === 'admin' ? 'Admin' : 'Teacher';
		event.locals.token = 'test-token-mock';
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
