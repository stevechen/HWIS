import { test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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

setup('setup test users', async () => {
	const convexToken = process.env.CONVEX_AUTH_TOKEN;
	if (!convexToken) {
		console.log('CONVEX_AUTH_TOKEN not set, skipping test user setup');
		return;
	}

	console.log('Setting up test users...');

	const result = await callConvexMutation(convexToken, 'testSetup:setupTestUsers', {});

	console.log('Test users created:', result);

	// Session cookie for debugging if needed
	// const sessionCookie = `convex_session_token=${result.teacherSessionToken}; Path=/; HttpOnly; SameSite=Lax`;

	const teacherStorageState = {
		cookies: [
			{
				name: 'convex_session_token',
				value: result.teacherSessionToken,
				domain: 'localhost',
				path: '/',
				expires: -1,
				httpOnly: true,
				secure: false,
				sameSite: 'Lax'
			}
		],
		origins: []
	};

	const adminStorageState = {
		cookies: [
			{
				name: 'convex_session_token',
				value: result.adminSessionToken,
				domain: 'localhost',
				path: '/',
				expires: -1,
				httpOnly: true,
				secure: false,
				sameSite: 'Lax'
			}
		],
		origins: []
	};

	const storageDir = path.join(process.cwd(), 'e2e/.auth');
	if (!fs.existsSync(storageDir)) {
		fs.mkdirSync(storageDir, { recursive: true });
	}

	fs.writeFileSync(
		path.join(storageDir, 'teacher.json'),
		JSON.stringify(teacherStorageState, null, 2)
	);

	fs.writeFileSync(path.join(storageDir, 'admin.json'), JSON.stringify(adminStorageState, null, 2));

	console.log('Storage state files created');
});
