import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

export const GET = async () => {
	const errs: string[] = [];
	try {
		const convexUrl = env.CONVEX_URL || env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
		const convexSiteUrl = env.CONVEX_SITE_URL || env.PUBLIC_CONVEX_SITE_URL || '';

		const info = {
			convexUrl,
			convexSiteUrl,
			siteUrl: env.SITE_URL,
			nodeEnv: env.NODE_ENV,
			hasPubConvexUrl: !!env.PUBLIC_CONVEX_URL,
			hasPubConvexSiteUrl: !!env.PUBLIC_CONVEX_SITE_URL,
			hasConvexUrl: !!env.CONVEX_URL,
			hasBetterAuth: !!env.BETTER_AUTH_SECRET
		};

		// Test connection to Convex site
		let siteStatus = 'untested';
		try {
			const res = await fetch(`${convexSiteUrl}/api/auth/get-session`, {
				method: 'GET',
				headers: { 'accept-encoding': 'application/json' }
			});
			siteStatus = `status=${res.status} body=${await res.text()}`;
		} catch (e) {
			siteStatus = `fetch failed: ${e instanceof Error ? e.message : String(e)}`;
		}

		return json({ info, siteStatus, errors: errs });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e), errors: errs }, { status: 500 });
	}
};
