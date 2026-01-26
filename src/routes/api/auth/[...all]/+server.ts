import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { env } from '$env/dynamic/private';

const convexUrl = env.CONVEX_URL || env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
// Convex site proxy runs on port 3211 (backend port + 1)
const convexSiteUrl = convexUrl.replace(':3210', ':3211');

console.log('[Auth Handler] Starting with convexSiteUrl:', convexSiteUrl);

const handler = createSvelteKitHandler({
	convexSiteUrl
});

import type { RequestEvent } from '@sveltejs/kit';

export const GET = async (event: RequestEvent) => {
	try {
		return await handler.GET(event);
	} catch (error) {
		console.error('[Auth Handler] GET Error:', error);
		throw error;
	}
};

export const POST = async (event: RequestEvent) => {
	console.log('[Auth Handler] POST request received:', event.request.url);
	try {
		const result = await handler.POST(event);
		console.log('[Auth Handler] POST result status:', result.status);
		if (!result.ok) {
			const body = await result.text();
			console.error('[Auth Handler] POST error body:', body);
		}
		return result;
	} catch (error) {
		console.error('[Auth Handler] POST Error:', error);
		if (error instanceof Error) {
			console.error('[Auth Handler] Error stack:', error.stack);
		}
		throw error;
	}
};
