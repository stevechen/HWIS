import { redirect } from '@sveltejs/kit';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { env } from '$env/dynamic/private';
import { api } from '$convex/_generated/api';
import { getConvexUrlFromToken } from '$lib/server/convex-url';

export const load = async ({ locals }: { locals: { token?: string } }) => {
	if (!locals.token) {
		return {};
	}

	const convexUrl = getConvexUrlFromToken(locals.token, env.CONVEX_URL || env.PUBLIC_CONVEX_URL);
	const client = createConvexHttpClient({
		token: locals.token,
		convexUrl
	});

	const fetchViewer = async () => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				return await client.query(api.users.viewer, {});
			} catch {
				if (attempt === 2) return null;
				await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
			}
		}
		return null;
	};

	const viewer = await fetchViewer();
	if (!viewer) return {};

	const isApproved =
		viewer.status === 'active' || viewer.role === 'admin' || viewer.role === 'super';
	if (!isApproved) return {};

	const isAdmin = viewer.role === 'admin' || viewer.role === 'super';
	throw redirect(302, isAdmin ? '/admin' : '/evaluations');
};
