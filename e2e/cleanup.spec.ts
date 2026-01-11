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
	const convexToken = process.env.CONVEX_AUTH_TOKEN;
	if (!convexToken) {
		return;
	}

	console.log('Cleaning up test users...');
	await callConvexMutation(convexToken, 'testSetup:cleanupTestUsers', {});
	console.log('Test users cleaned up');
});
