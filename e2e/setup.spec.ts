import { test as setup, expect } from '@playwright/test';
import { setupTestUsers, cleanupTestUsers } from './convex-client';
import { mkdir, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCookieGetter, parseSetCookieHeader } from 'better-auth/cookies';
import { serializeSignedCookie } from 'better-call';
import { JWT_COOKIE_NAME } from '@convex-dev/better-auth/plugins';

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
	origins: Array<{
		origin: string;
		localStorage: Array<{
			name: string;
			value: string;
		}>;
	}>;
};

type BrowserContextCookie = {
	name: string;
	value: string;
	url: string;
	expires: number;
	httpOnly: boolean;
	secure: boolean;
	sameSite: 'Lax' | 'Strict' | 'None';
};

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const DEFAULT_BETTER_AUTH_SECRET =
	'0150ee735cf86820eb80300e6050a1e4be246675a80a65fc62e64489633f7db0';
const loadEnvSecret = () => {
	const envFiles = ['.env.local', '.env'];
	for (const envFile of envFiles) {
		try {
			const envPath = path.join(__dirname, '..', envFile);
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
	}
	return undefined;
};

const BETTER_AUTH_SECRET =
	process.env.BETTER_AUTH_SECRET ||
	process.env.AUTH_SECRET ||
	loadEnvSecret() ||
	DEFAULT_BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || BETTER_AUTH_SECRET;

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

type RuntimeCookieConfig = {
	sessionCookieConfig: ReturnType<ReturnType<typeof createCookieGetter>>;
	jwtCookieConfig: ReturnType<ReturnType<typeof createCookieGetter>>;
};

let runtimeCookieConfigPromise: Promise<RuntimeCookieConfig> | null = null;
async function getRuntimeCookieConfig(): Promise<RuntimeCookieConfig> {
	if (!runtimeCookieConfigPromise) {
		runtimeCookieConfigPromise = (async () => {
			const { createAuth } = await import('../src/convex/auth');
			type CreateAuthArgs = Parameters<typeof createAuth>[0];
			const auth = createAuth({} as CreateAuthArgs);
			const cookieOptions = { ...auth.options, baseURL: BASE_URL };
			const createCookie = createCookieGetter(cookieOptions);
			return {
				sessionCookieConfig: createCookie('session_token'),
				jwtCookieConfig: createCookie(JWT_COOKIE_NAME)
			};
		})();
	}
	return await runtimeCookieConfigPromise;
}

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

const toBrowserContextCookie = (config: CookieConfig): BrowserContextCookie => ({
	name: config.name,
	value: config.value,
	url: BASE_URL,
	expires: -1,
	httpOnly: config.httpOnly ?? true,
	secure: config.secure ?? false,
	sameSite: normalizeSameSite(config.sameSite)
});

async function getSignedSessionCookieValue(sessionToken: string): Promise<string> {
	const { sessionCookieConfig } = await getRuntimeCookieConfig();
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

async function getConvexJwtToken(sessionToken: string): Promise<string> {
	const response = await fetch(`${BASE_URL}/api/auth/convex/token`, {
		method: 'GET',
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${sessionToken}`
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
	const { sessionCookieConfig, jwtCookieConfig } = await getRuntimeCookieConfig();
	const signedSessionToken = await getSignedSessionCookieValue(sessionToken);
	const convexJwtToken = await getConvexJwtToken(sessionToken);

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
		origins: [
			{
				origin: BASE_URL,
				localStorage: [
					{
						name: 'e2eSessionToken',
						value: sessionToken
					},
					{
						name: 'convexAuth',
						value: JSON.stringify({ token: convexJwtToken })
					}
				]
			}
		]
	};
}

async function buildContextCookies(sessionToken: string): Promise<BrowserContextCookie[]> {
	const { sessionCookieConfig, jwtCookieConfig } = await getRuntimeCookieConfig();
	const signedSessionToken = await getSignedSessionCookieValue(sessionToken);
	const convexJwtToken = await getConvexJwtToken(sessionToken);

	return [
		toBrowserContextCookie({
			name: sessionCookieConfig.name,
			value: signedSessionToken,
			path: sessionCookieConfig.attributes.path,
			secure: sessionCookieConfig.attributes.secure,
			httpOnly: sessionCookieConfig.attributes.httpOnly,
			sameSite: sessionCookieConfig.attributes.sameSite
		}),
		toBrowserContextCookie({
			name: jwtCookieConfig.name,
			value: convexJwtToken,
			path: jwtCookieConfig.attributes.path,
			secure: jwtCookieConfig.attributes.secure,
			httpOnly: jwtCookieConfig.attributes.httpOnly,
			sameSite: jwtCookieConfig.attributes.sameSite
		})
	];
}

setup('seed test data and verify setup', async ({ page }) => {
	// Clean up old test users first to avoid accumulation
	await cleanupTestUsers();

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

	await page
		.context()
		.addCookies(await buildContextCookies(setupResult.adminSessionToken as string));

	await expect(adminStorage.cookies.length).toBeGreaterThan(0);
	await expect(teacherStorage.cookies.length).toBeGreaterThan(0);
	await expect(superStorage.cookies.length).toBeGreaterThan(0);
});
