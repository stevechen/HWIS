import type { Handle } from '@sveltejs/kit';
import { createAuth } from '$convex/auth.js';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const handle: Handle = async ({ event, resolve }) => {
	const isTestMode = event.cookies.get('hwis_test_auth') === 'true';

	if (isTestMode) {
		event.locals.token = 'test-token-mock';
		event.locals.user = {
			_id: 'test-user-id',
			name: 'Test Teacher',
			email: 'teacher@hwis.test',
			emailVerified: true,
			role: 'teacher' as const,
			status: 'active' as const
		};
		event.locals.isTestMode = true;
	} else {
		try {
			event.locals.token = await getToken(createAuth, event.cookies);
		} catch (e) {
			event.locals.token = null;
		}
		event.locals.isTestMode = false;
	}

	const response = await resolve(event);

	if (isTestMode) {
		response.headers.set('x-test-mode', 'true');
	}

	return response;
};
