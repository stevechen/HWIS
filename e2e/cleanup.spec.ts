import { test as cleanup } from '@playwright/test';

const CONVEX_URL = process.env.CONVEX_URL || 'http://localhost:3210';

async function callConvexMutation(
	token: string,
	mutation: string,
	args: Record<string, unknown> = {}
) {
	const response = await fetch(`${CONVEX_URL}/api/mutation`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			path: mutation,
			args
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Convex mutation failed: ${error}`);
	}

	return response.json();
}

cleanup('cleanup test users', async () => {
	const convexToken = process.env.CONVEX_AUTH_TOKEN?.split('|')[1];
	if (!convexToken) {
		return;
	}

	await callConvexMutation(convexToken, 'testSetup:cleanupTestUsers', {});
});

cleanup('cleanup all test data (nuclear cleanup)', async () => {
	const convexToken = process.env.CONVEX_AUTH_TOKEN?.split('|')[1];
	if (!convexToken) {
		return;
	}

	// First, clean up all test data (students, evaluations, categories, audit logs with e2eTag)
	await callConvexMutation(convexToken, 'testCleanup.cleanupAllTestData', {});

	// Then, clean up orphaned test users
	await callConvexMutation(convexToken, 'testCleanup.cleanupAllTestUsers', {});

	// Finally, clean up any remaining test Better Auth users
	try {
		await callConvexMutation(convexToken, 'testSetup:cleanupTestUsers', {});
	} catch {
		// Cleanup skipped
	}
});
