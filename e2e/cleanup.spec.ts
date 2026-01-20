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
		console.log('CONVEX_AUTH_TOKEN not set, skipping test user cleanup');
		return;
	}

	console.log('Cleaning up test users...');
	await callConvexMutation(convexToken, 'testSetup:cleanupTestUsers', {});
	console.log('Test users cleaned up');
});

cleanup('cleanup all test data (nuclear cleanup)', async () => {
	const convexToken = process.env.CONVEX_AUTH_TOKEN?.split('|')[1];
	if (!convexToken) {
		console.log('CONVEX_AUTH_TOKEN not set, skipping nuclear cleanup');
		return;
	}

	console.log('Running nuclear cleanup of all test data...');

	// First, clean up all test data (students, evaluations, categories, audit logs with e2eTag)
	await callConvexMutation(convexToken, 'testCleanup.cleanupAllTestData', {});
	console.log('All test data cleaned up');

	// Then, clean up orphaned test users
	await callConvexMutation(convexToken, 'testCleanup.cleanupAllTestUsers', {});
	console.log('Orphaned test users cleaned up');

	// Finally, clean up any remaining test Better Auth users
	try {
		await callConvexMutation(convexToken, 'testSetup:cleanupTestUsers', {});
		console.log('Test Better Auth users cleaned up');
	} catch (e) {
		console.log('Test Better Auth users cleanup skipped:', e);
	}

	console.log('Nuclear cleanup complete');
});
