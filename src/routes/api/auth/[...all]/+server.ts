import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

const convexUrl = env.CONVEX_URL || env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
// Convex site proxy runs on port 3211 (backend port + 1)
const convexSiteUrl = convexUrl.replace(':3210', ':3211');

const handler = createSvelteKitHandler({
	convexSiteUrl
});

export const GET = async (event: RequestEvent) => {
	return handler.GET(event);
};

export const POST = async (event: RequestEvent) => {
	return handler.POST(event);
};
