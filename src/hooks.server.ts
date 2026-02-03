import type { Handle } from '@sveltejs/kit';
import { createAuth } from '$convex/auth.js';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const handle: Handle = async ({ event, resolve }) => {
	try {
		event.locals.token = await getToken(createAuth, event.cookies);
	} catch {
		event.locals.token = undefined;
	}

	return resolve(event);
};
