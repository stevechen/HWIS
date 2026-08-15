import { redirect } from '@sveltejs/kit';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { env } from '$env/dynamic/private';
import { api } from '$convex/_generated/api';
import { canAccessAdminArea, hasApplicationAccess, isStudent } from '$convex/shared/authorization';
import { getConvexUrlFromToken } from '$lib/server/convex-url';

export const load = async ({ locals }: { locals: { token?: string } }) => {
	if (!locals.token) {
		return {};
	}

	const convexUrl = await getConvexUrlFromToken(
		locals.token,
		env.CONVEX_URL || env.PUBLIC_CONVEX_URL
	);
	const client = createConvexHttpClient({
		token: locals.token,
		convexUrl
	});

	const fetchViewer = async () => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				return await client.query(api.users.profile, {});
			} catch {
				if (attempt === 2) return null;
				await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
			}
		}
		return null;
	};

	const viewer = await fetchViewer();
	if (!viewer?.user) return {};

	const user = viewer.user;

	if (!hasApplicationAccess(user)) return {};

	if (isStudent(user) && 'studentId' in user && user.studentId) {
		throw redirect(302, `/evaluations/student/${user.studentId}`);
	}
	throw redirect(302, canAccessAdminArea(user) ? '/admin' : '/evaluations');
};
