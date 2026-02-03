import { test as setup, expect } from '@playwright/test';
import { seedBaseline, setupTestUsers } from './convex-client';
import { mkdir, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCookieGetter, parseSetCookieHeader } from 'better-auth/cookies';
import { serializeSignedCookie } from 'better-call';
import { JWT_COOKIE_NAME } from '@convex-dev/better-auth/plugins';
import { createAuth } from '../src/convex/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type StorageState = {
	cookies: Array<{
		name: string;
		value: string;
		domain: string;
		path: string;
		expires: number;
		httpOnly: boolean;
		secure: boolean;
		sameSite: 'Lax' | 'Strict' | 'None';
	}>;
	origins: unknown[];
};

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const DEFAULT_BETTER_AUTH_SECRET =
	'0150ee735cf86820eb80300e6050a1e4be246675a80a65fc62e64489633f7db0';
const loadEnvSecret = () => {
	try {
		const envPath = path.join(__dirname, '..', '.env');
		const content = readFileSync(envPath, 'utf-8');
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const [key, ...rest] = trimmed.split('=');
			if (key !== 'BETTER_AUTH_SECRET') continue;
			const rawValue = rest.join('=').trim();
			return rawValue.replace(/^['"]|['"]$/g, '');
		}
	} catch {
		// ignore missing env file
	}
	return undefined;
};

const BETTER_AUTH_SECRET =
	process.env.BETTER_AUTH_SECRET ||
	process.env.AUTH_SECRET ||
	loadEnvSecret() ||
	DEFAULT_BETTER_AUTH_SECRET;

type CreateAuthArgs = Parameters<typeof createAuth>[0];
const auth = createAuth({} as CreateAuthArgs);
const cookieOptions = { ...auth.options, baseURL: BASE_URL };
const createCookie = createCookieGetter(cookieOptions);
const sessionCookieConfig = createCookie('session_token');
const jwtCookieConfig = createCookie(JWT_COOKIE_NAME);

const normalizeSameSite = (value?: string): 'Lax' | 'Strict' | 'None' => {
	if (!value) return 'Lax';
	const normalized = value.toLowerCase();
	if (normalized === 'strict') return 'Strict';
	if (normalized === 'none') return 'None';
	return 'Lax';
};

type CookieConfig = {
	name: string;
	value: string;
	path?: string;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: string;
};

const toPlaywrightCookie = (config: CookieConfig) => ({
	name: config.name,
	value: config.value,
	domain: 'localhost',
	path: config.path ?? '/',
	expires: -1,
	httpOnly: config.httpOnly ?? true,
	secure: config.secure ?? false,
	sameSite: normalizeSameSite(config.sameSite)
});

async function getSignedSessionCookieValue(sessionToken: string): Promise<string> {
	const cookieString = await serializeSignedCookie(
		sessionCookieConfig.name,
		sessionToken,
		BETTER_AUTH_SECRET,
		sessionCookieConfig.attributes
	);
	const parsed = parseSetCookieHeader(cookieString).get(sessionCookieConfig.name);
	if (!parsed?.value) {
		throw new Error('Failed to serialize Better Auth session cookie');
	}
	return parsed.value;
}

async function getConvexJwtToken(sessionCookieValue: string): Promise<string> {
	const response = await fetch(`${BASE_URL}/api/auth/convex/token`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			cookie: `${sessionCookieConfig.name}=${sessionCookieValue}`
		}
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => '');
		throw new Error(`Failed to fetch Convex JWT (${response.status}): ${errorText}`);
	}

	const data = (await response.json()) as { token?: string };
	if (!data?.token) {
		throw new Error('Convex JWT token missing from response');
	}
	return data.token;
}

async function buildStorageState(sessionToken: string): Promise<StorageState> {
	const signedSessionToken = await getSignedSessionCookieValue(sessionToken);
	const convexJwtToken = await getConvexJwtToken(signedSessionToken);

	return {
		cookies: [
			toPlaywrightCookie({
				name: sessionCookieConfig.name,
				value: signedSessionToken,
				path: sessionCookieConfig.attributes.path,
				secure: sessionCookieConfig.attributes.secure,
				httpOnly: sessionCookieConfig.attributes.httpOnly,
				sameSite: sessionCookieConfig.attributes.sameSite
			}),
			toPlaywrightCookie({
				name: jwtCookieConfig.name,
				value: convexJwtToken,
				path: jwtCookieConfig.attributes.path,
				secure: jwtCookieConfig.attributes.secure,
				httpOnly: jwtCookieConfig.attributes.httpOnly,
				sameSite: jwtCookieConfig.attributes.sameSite
			})
		],
		origins: []
	};
}

setup('seed test data and verify setup', async ({ page }) => {
	const setupResult = await setupTestUsers();
	expect(setupResult?.adminSessionToken).toBeTruthy();
	expect(setupResult?.teacherSessionToken).toBeTruthy();
	expect(setupResult?.superSessionToken).toBeTruthy();

	const authDir = path.join(__dirname, '.auth');
	await mkdir(authDir, { recursive: true });
	const adminStorage = await buildStorageState(setupResult.adminSessionToken as string);
	const teacherStorage = await buildStorageState(setupResult.teacherSessionToken as string);
	const superStorage = await buildStorageState(setupResult.superSessionToken as string);

	await writeFile(path.join(authDir, 'admin.json'), JSON.stringify(adminStorage, null, 2));
	await writeFile(path.join(authDir, 'teacher.json'), JSON.stringify(teacherStorage, null, 2));
	await writeFile(path.join(authDir, 'super.json'), JSON.stringify(superStorage, null, 2));

	await page.context().addCookies(adminStorage.cookies);

	await page.goto(`${BASE_URL}/`);
	await page.waitForSelector('body.hydrated');

	await seedBaseline();

	await page.goto(`${BASE_URL}/admin/academic`);
	await page.waitForSelector('body.hydrated');

	const url = page.url();

	expect(url).toContain('/admin/academic');
});
