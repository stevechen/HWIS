import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

export const GET = async () => {
	try {
		const convexUrl = env.CONVEX_URL || env.PUBLIC_CONVEX_URL || 'not-set';
		const convexSiteUrl = env.CONVEX_SITE_URL || env.PUBLIC_CONVEX_SITE_URL || 'not-set';

		const info = {
			convexUrl,
			convexSiteUrl,
			siteUrl: env.SITE_URL || 'not-set',
			nodeEnv: env.NODE_ENV || 'not-set',
			hasPubConvexUrl: !!env.PUBLIC_CONVEX_URL,
			hasPubConvexSiteUrl: !!env.PUBLIC_CONVEX_SITE_URL,
			hasConvexUrl: !!env.CONVEX_URL,
			hasBetterAuth: !!env.BETTER_AUTH_SECRET
		};

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

		return json({ info, siteStatus });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
};
