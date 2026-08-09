import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel, type Doc, type Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { betterAuth } from 'better-auth/minimal';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import authConfig from './auth.config';
import { resolveEffectiveTestToken } from './testAuth';
import { canAccessAdminArea, isActiveStaff, isSuper } from './shared/authorization';

function normalizeEnvValue(value?: string | null): string | undefined {
	if (!value) return undefined;

	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

export function getEnvValue(key: string): string | undefined {
	return normalizeEnvValue(process.env[key]);
}

const isDev =
	!getEnvValue('NODE_ENV') ||
	getEnvValue('NODE_ENV') === 'development' ||
	getEnvValue('SITE_URL')?.includes('localhost') ||
	getEnvValue('CONVEX_DEPLOYMENT')?.includes('local');
export const isTestRuntime =
	getEnvValue('NODE_ENV') === 'test' ||
	getEnvValue('VITEST') === 'true' ||
	getEnvValue('PLAYWRIGHT_WORKER_ID') !== undefined;

export const isProdDeployment = getEnvValue('CONVEX_DEPLOYMENT')?.startsWith('prod:') ?? false;

const siteUrl = isDev
	? 'http://localhost:5173'
	: getEnvValue('SITE_URL') || 'https://hwis.vercel.app';

function generateEphemeralSecret(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

if (typeof window === 'undefined') {
	// Set environment variables for auth component if not already set
	const convexUrl =
		getEnvValue('CONVEX_URL') || getEnvValue('PUBLIC_CONVEX_URL') || 'http://127.0.0.1:3210';
	const stripSlash = (value: string) => value.replace(/\/$/, '');
	const appOrigins = [getEnvValue('SITE_URL'), 'http://localhost:5173', 'http://127.0.0.1:5173']
		.filter(Boolean)
		.map((value) => stripSlash(value as string));
	const normalizeConvexSiteUrl = (value?: string) => {
		if (!value) return undefined;
		let normalized = stripSlash(value);
		if (appOrigins.includes(normalized)) {
			return undefined;
		}
		if (normalized.includes('.convex.cloud')) {
			normalized = normalized.replace('.convex.cloud', '.convex.site');
		}
		if (normalized.includes(':3210')) {
			normalized = normalized.replace(':3210', ':3211');
		}
		return normalized;
	};
	const convexSiteUrl =
		normalizeConvexSiteUrl(
			getEnvValue('CONVEX_SITE_URL') || getEnvValue('PUBLIC_CONVEX_SITE_URL')
		) ||
		normalizeConvexSiteUrl(convexUrl) ||
		'http://127.0.0.1:3211';
	let betterAuthSecret = getEnvValue('BETTER_AUTH_SECRET');
	if (!betterAuthSecret) {
		betterAuthSecret = generateEphemeralSecret();
		if (isDev || isTestRuntime) {
			console.warn(
				'[auth] BETTER_AUTH_SECRET is not set. Generated an ephemeral secret for local/test runtime.'
			);
		} else {
			console.warn(
				'[auth] BETTER_AUTH_SECRET is not set. Using ephemeral secret; set a stable secret in production env.'
			);
		}
	}

	process.env.CONVEX_URL = convexUrl;
	process.env.PUBLIC_CONVEX_SITE_URL = convexSiteUrl;
	process.env.BETTER_AUTH_SECRET = betterAuthSecret;
	const googleClientId = getEnvValue('GOOGLE_CLIENT_ID');
	const googleClientSecret = getEnvValue('GOOGLE_CLIENT_SECRET');
	if (googleClientId) process.env.GOOGLE_CLIENT_ID = googleClientId;
	if (googleClientSecret) process.env.GOOGLE_CLIENT_SECRET = googleClientSecret;
	const trustedOriginsValue = getEnvValue('BETTER_AUTH_TRUSTED_ORIGINS');
	if (trustedOriginsValue) process.env.BETTER_AUTH_TRUSTED_ORIGINS = trustedOriginsValue;
}

const trustedOriginsEnv =
	getEnvValue('BETTER_AUTH_TRUSTED_ORIGINS')
		?.split(',')
		.map((o) => o.trim()) || [];

const trustedOrigins = [
	...(isDev ? ['http://localhost:5173'] : []),
	siteUrl,
	'https://*.vercel.app',
	...trustedOriginsEnv
];

// Domain restriction configuration
const ALLOWED_DOMAIN = 'hwhs.tc.edu.tw';
const STUDENT_DOMAIN = 'std.hwhs.tc.edu.tw';
const ALLOWLISTED_EMAIL_ROLE_MAP: Record<string, 'super' | 'admin' | 'teacher'> = {
	'steve.stevechen@gmail.com': 'super',
	'steve@hwhs.tc.edu.tw': 'admin',
	'steve.homecook@gmail.com': 'teacher'
};
export const EXCEPTION_EMAILS = Object.keys(ALLOWLISTED_EMAIL_ROLE_MAP);
const REJECTION_MESSAGE = 'For Hong Wen International School (HWIS) staffs only.';

// Student email validation helpers
export function isStudentEmail(email: string): boolean {
	return email.endsWith(`@${STUDENT_DOMAIN}`);
}

export function extractStudentIdFromEmail(email: string): string | null {
	if (!isStudentEmail(email)) return null;

	const localPart = email.split('@')[0];
	// Match pattern: s followed by one or more digits
	const match = localPart.match(/^s(\d+)$/);
	return match ? match[1] : null;
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);
type AuthCtx = QueryCtx | MutationCtx;
export type AuthenticatedUserLike = {
	_id?: Id<'users'> | string;
	id?: string;
	authId?: string;
	email?: string;
	name?: string;
	role?: 'super' | 'admin' | 'teacher' | 'student';
	status?: 'pending' | 'active';
};

function resolveAuthId(user: AuthenticatedUserLike): string | undefined {
	return user.authId || user.id || (typeof user._id === 'string' ? user._id : undefined);
}

function isUserProfile(user: AuthenticatedUserLike): user is Doc<'users'> {
	return Boolean(user._id && user.role && user.status);
}

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		baseURL: siteUrl,
		trustedOrigins,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false
		},
		socialProviders: {
			google: {
				clientId: isDev ? getEnvValue('GOOGLE_CLIENT_ID') || '' : getEnvValue('GOOGLE_CLIENT_ID')!,
				clientSecret: isDev
					? getEnvValue('GOOGLE_CLIENT_SECRET') || ''
					: getEnvValue('GOOGLE_CLIENT_SECRET')!,
				prompt: 'select_account',
				redirectURI: `${siteUrl}/api/auth/callback/google`
			}
		},
		plugins: [
			convex({
				authConfig,
				// Keep JWTs valid longer in dev/test to avoid mid-suite expiry
				jwtExpirationSeconds: isDev ? 60 * 60 * 24 : undefined
			})
		],
		hooks: {
			after: createAuthMiddleware(async ({ path, context }) => {
				if (!path?.startsWith('/sign-in/social')) return;

				const email = (context.session?.user as { email?: string } | undefined)?.email;
				if (!email) return;

				const isException = EXCEPTION_EMAILS.includes(email);
				const isAllowedDomain = email.endsWith(`@${ALLOWED_DOMAIN}`);
				const isStudentDomain = isStudentEmail(email);

				// Allow student domain emails - student record verification happens post-login
				if (!isException && !isAllowedDomain && !isStudentDomain) {
					throw new APIError('FORBIDDEN', {
						message: REJECTION_MESSAGE
					});
				}
			})
		}
	});
};

// Helper function to check if a user is an exception email
export function isExceptionEmail(email: string): boolean {
	return Boolean(ALLOWLISTED_EMAIL_ROLE_MAP[email.toLowerCase()]);
}

// Returns preferred bootstrap role for an allowlisted email, or null if not allowlisted.
export function getAllowlistedRole(email?: string | null): 'super' | 'admin' | 'teacher' | null {
	if (!email) return null;
	return ALLOWLISTED_EMAIL_ROLE_MAP[email.toLowerCase()] ?? null;
}

// Helper function to validate email domain
export function isAllowedDomain(email: string): boolean {
	return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export const getAuthenticatedUser = async (
	ctx: AuthCtx,
	testToken?: string
): Promise<Doc<'users'> | AuthenticatedUserLike | null> => {
	// 1. Try real auth session lookup FIRST (if session exists in request, return logged-in user)
	try {
		const user = (await authComponent.getAuthUser(ctx)) as AuthenticatedUserLike | null;
		if (user) {
			const authId = resolveAuthId(user);
			if (authId && ctx.db) {
				const profile = await ctx.db
					.query('users')
					.withIndex('by_authId', (q) => q.eq('authId', authId))
					.first();
				if (profile) return profile;
			}
			return user;
		}
	} catch {
		// Ignore lookup failures
	}

	// 2. If no real session exists, check if testToken bypass was supplied
	if (testToken) {
		const configuredTestToken = getEnvValue('E2E_TEST_TOKEN');
		const allowDefaultTestToken = !isProdDeployment;
		const isSuperTestToken = isTestRuntime && testToken === 'super-unit-test-token';
		const isValidTestToken =
			(configuredTestToken && testToken === configuredTestToken) ||
			(isTestRuntime && testToken === 'unit-test-token') ||
			(allowDefaultTestToken && testToken === 'unit-test-token');

		if (isSuperTestToken) {
			return {
				_id: 'test-super-user-id' as Id<'users'>,
				authId: 'test_super',
				name: 'Test Super',
				role: 'super',
				status: 'active'
			};
		}
		if (isValidTestToken) {
			return {
				_id: 'test-user-id' as Id<'users'>,
				authId: 'test_admin',
				name: 'Test Admin',
				role: 'admin',
				status: 'active'
			};
		}
	}

	return null;
};

// Unified helper that ensures user AND profile exists
export const requireUserProfile = async (
	ctx: AuthCtx,
	_testToken?: string
): Promise<Doc<'users'>> => {
	const user = await getAuthenticatedUser(ctx, _testToken);
	if (user) {
		// If the user object ALREADY looks like a HWIS profile, return it
		if (isUserProfile(user)) return user;

		// Otherwise try to resolve from DB
		const authId = resolveAuthId(user);
		if (authId && ctx.db) {
			const profile = await ctx.db
				.query('users')
				.withIndex('by_authId', (q) => q.eq('authId', authId))
				.first();
			if (profile) return profile;
		}
	}

	throw new Error('Unauthorized');
};

// Basic authentication requirement
export const requireAuthenticatedUser = async (ctx: AuthCtx, _testToken?: string) => {
	return await requireUserProfile(ctx, _testToken);
};

export const requireActiveStaff = async (ctx: AuthCtx, _testToken?: string) => {
	const user = await requireUserProfile(ctx, _testToken);
	if (!isActiveStaff(user)) {
		throw new Error('Forbidden: Active staff access required');
	}
	return user;
};

// Admin/Super role requirement — delegates to the shared access policy.
export const requireAdminRole = async (ctx: AuthCtx, _testToken?: string) => {
	const user = await requireUserProfile(ctx, _testToken);

	if (!canAccessAdminArea(user)) {
		if (
			_testToken &&
			(_testToken === 'unit-test-token' || _testToken === 'super-unit-test-token') &&
			(isTestRuntime || !isProdDeployment)
		) {
			return { ...user, role: 'admin' as const, status: 'active' as const };
		}
		throw new Error('Forbidden: Admin or super role required');
	}

	return user;
};

// Super role requirement (for promoting users to super)
export const requireSuperRole = async (ctx: AuthCtx, _testToken?: string) => {
	const user = await requireUserProfile(ctx, _testToken);
	if (!isSuper(user)) {
		if (_testToken === 'super-unit-test-token' && (isTestRuntime || !isProdDeployment)) {
			return { ...user, role: 'super' as const, status: 'active' as const };
		}
		throw new Error('Forbidden: Super role required');
	}
	return user;
};

export const requireUserProfileForSensitiveOperation = async (ctx: AuthCtx, testToken?: string) => {
	const effectiveTestToken = resolveEffectiveTestToken(testToken);
	return await requireUserProfile(ctx, effectiveTestToken);
};

export const requireAdminForSensitiveOperation = async (ctx: AuthCtx, testToken?: string) => {
	const effectiveTestToken = resolveEffectiveTestToken(testToken);
	return await requireAdminRole(ctx, effectiveTestToken);
};

export const requireSuperForSensitiveOperation = async (ctx: AuthCtx, testToken?: string) => {
	const effectiveTestToken = resolveEffectiveTestToken(testToken);
	return await requireSuperRole(ctx, effectiveTestToken);
};
