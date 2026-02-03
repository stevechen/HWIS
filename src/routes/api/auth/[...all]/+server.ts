import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

const stripSlash = (value: string) => value.replace(/\/$/, '');
const appOrigins = [
	env.SITE_URL,
	env.PUBLIC_SITE_URL,
	env.VITE_SITE_URL,
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

const convexUrl = env.CONVEX_URL || env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
const convexSiteUrl =
	normalizeConvexSiteUrl(env.CONVEX_SITE_URL || env.PUBLIC_CONVEX_SITE_URL) ||
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
