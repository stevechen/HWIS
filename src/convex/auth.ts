import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel, type Doc, type Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { betterAuth } from 'better-auth/minimal';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import authConfig from './auth.config';
import { devGoogleCredentials } from './auth.local';

const isDev =
	!process.env.NODE_ENV ||
	process.env.NODE_ENV === 'development' ||
	process.env.SITE_URL?.includes('localhost') ||
	process.env.CONVEX_DEPLOYMENT?.includes('local');
const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const isProdDeployment = process.env.CONVEX_DEPLOYMENT?.startsWith('prod:') ?? false;

const siteUrl = isDev ? 'http://localhost:5173' : process.env.SITE_URL || 'https://hwis.vercel.app';

function generateEphemeralSecret(): string {
	const parts = [
		Date.now().toString(16),
		Math.random().toString(16).slice(2),
		Math.random().toString(16).slice(2),
		Math.random().toString(16).slice(2)
	];
	return parts.join('').slice(0, 64);
}

if (typeof window === 'undefined') {
	// Set environment variables for auth component if not already set
	const convexUrl =
		process.env.CONVEX_URL || process.env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
	const stripSlash = (value: string) => value.replace(/\/$/, '');
	const appOrigins = [process.env.SITE_URL, 'http://localhost:5173', 'http://127.0.0.1:5173']
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
		normalizeConvexSiteUrl(process.env.CONVEX_SITE_URL || process.env.PUBLIC_CONVEX_SITE_URL) ||
		normalizeConvexSiteUrl(convexUrl) ||
		'http://127.0.0.1:3211';
	let betterAuthSecret = process.env.BETTER_AUTH_SECRET;
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
}

const trustedOriginsEnv =
	process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((o) => o.trim()) || [];

const trustedOrigins = [
	...(isDev ? ['http://localhost:5173'] : []),
	siteUrl,
	'https://*.vercel.app',
	...trustedOriginsEnv
];

// Domain restriction configuration
const ALLOWED_DOMAIN = 'hwhs.tc.edu.tw';
export const EXCEPTION_EMAILS = [
	'steve.stevechen@gmail.com',
	'steve.homecook@gmail.com',
	'steve@hwhs.tc.edu.tw'
];
const REJECTION_MESSAGE = 'For Hong Wen International School (HWIS) staffs only.';

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);
type AuthCtx = QueryCtx | MutationCtx;
type AuthenticatedUserLike = {
	_id?: Id<'users'> | string;
	id?: string;
	authId?: string;
	email?: string;
	name?: string;
	role?: 'super' | 'admin' | 'teacher';
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
				clientId: isDev ? devGoogleCredentials.clientId : process.env.GOOGLE_CLIENT_ID!,
				clientSecret: isDev ? devGoogleCredentials.clientSecret : process.env.GOOGLE_CLIENT_SECRET!,
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

				if (!isException && !isAllowedDomain) {
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
	return EXCEPTION_EMAILS.includes(email);
}

// Helper function to validate email domain
export function isAllowedDomain(email: string): boolean {
	return email.endsWith(`@${ALLOWED_DOMAIN}`);
}

export const getAuthenticatedUser = async (
	ctx: AuthCtx,
	testToken?: string
): Promise<Doc<'users'> | AuthenticatedUserLike | null> => {
	const configuredTestToken = process.env.E2E_TEST_TOKEN;
	const allowDefaultTestToken = !isProdDeployment;
	const isValidTestToken =
		(configuredTestToken && testToken === configuredTestToken) ||
		(isTestRuntime && testToken === 'unit-test-token') ||
		(allowDefaultTestToken && testToken === 'unit-test-token');

	// For unit tests/e2e helpers, allow explicit test token bypass.
	if (isValidTestToken) {
		return {
			_id: 'test-user-id' as Id<'users'>,
			authId: 'test_admin',
			name: 'Test Admin',
			role: 'admin',
			status: 'active'
		};
	}

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

// Admin/Super role requirement
export const requireAdminRole = async (ctx: AuthCtx, _testToken?: string) => {
	const user = await requireUserProfile(ctx, _testToken);

	const role = user.role;
	if (role !== 'admin' && role !== 'super') {
		throw new Error('Forbidden: Admin or super role required');
	}

	return user;
};

export const requireAdminForSensitiveOperation = async (ctx: AuthCtx, testToken?: string) => {
	const effectiveTestToken = isTestRuntime && !testToken ? 'unit-test-token' : testToken;
	return await requireAdminRole(ctx, effectiveTestToken);
};
