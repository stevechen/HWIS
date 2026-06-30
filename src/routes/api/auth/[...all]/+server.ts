import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestEvent } from '@sveltejs/kit';

const stripSlash = (value: string) => value.replace(/\/$/, '');
const appOrigins = [
	privateEnv.SITE_URL,
	privateEnv.PUBLIC_SITE_URL,
	privateEnv.VITE_SITE_URL,
	'http://localhost:5173',
	'http://127.0.0.1:5173'
]
	.filter(Boolean)
	.map((value) => stripSlash(value as string));
const normalizeConvexSiteUrl = (value?: string) => {
	if (!value) return undefined;
	let normalized = stripSlash(value);
	if (appOrigins.includes(normalized)) {
		return undefined;
	}
	if (normalized.includes('.convex.cloud')) {
		normalized = normalized.replace('.convex.cloud', '.convex.site');
	}
	if (normalized.includes(':3210')) {
		normalized = normalized.replace(':3210', ':3211');
	}
	return normalized;
};

const convexUrl = publicEnv.CONVEX_URL || publicEnv.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
const convexSiteUrl =
	normalizeConvexSiteUrl(publicEnv.CONVEX_SITE_URL || publicEnv.PUBLIC_CONVEX_SITE_URL) ||
	normalizeConvexSiteUrl(convexUrl) ||
	'http://127.0.0.1:3211';

const handler = createSvelteKitHandler({
	convexSiteUrl
});

export const GET = async (event: RequestEvent) => {
	try {
		return await handler.GET(event);
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			return new Response(null, { status: 204 });
		}
		throw err;
	}
};

export const POST = async (event: RequestEvent) => {
	try {
		return await handler.POST(event);
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			return new Response(null, { status: 204 });
		}
		throw err;
	}
};
