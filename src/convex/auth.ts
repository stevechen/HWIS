import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { v } from 'convex/values';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel, type Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { betterAuth } from 'better-auth/minimal';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import authConfig from './auth.config';
import { devGoogleCredentials } from './auth.local';

const isDev =
	!process.env.NODE_ENV ||
	process.env.NODE_ENV === 'development' ||
	process.env.SITE_URL?.includes('localhost') ||
	process.env.CONVEX_DEPLOYMENT?.includes('local');

const siteUrl = isDev ? 'http://localhost:5173' : process.env.SITE_URL || 'https://hwis.vercel.app';

if (typeof window === 'undefined') {
	// Set environment variables for auth component if not already set
	const convexUrl =
		process.env.CONVEX_URL || process.env.PUBLIC_CONVEX_URL || 'http://127.0.0.1:3210';
	const siteUrlOverride =
		process.env.PUBLIC_CONVEX_SITE_URL || process.env.SITE_URL || 'http://localhost:5173';
	// Use env var or generate a secure secret for development
	const betterAuthSecret =
		process.env.BETTER_AUTH_SECRET ||
		'0150ee735cf86820eb80300e6050a1e4be246675a80a65fc62e64489633f7db0';

	process.env.CONVEX_URL = convexUrl;
	process.env.PUBLIC_CONVEX_SITE_URL = siteUrlOverride;
	process.env.BETTER_AUTH_SECRET = betterAuthSecret;
}

// Global constant for the mock auth ID - matches Vite DEV env setting
const MOCK_ADMIN_AUTH_ID = 'test-token-admin-mock';

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
		plugins: [convex({ authConfig })],
		hooks: {
			after: createAuthMiddleware(async ({ path, context }) => {
				if (!path?.startsWith('/sign-in/social')) return;

				const email = (context.session?.user as any)?.email;
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

// Helper to get authenticated user
export const getAuthenticatedUser = async (ctx: any, testToken?: string) => {
	// Check for test token first (for e2e testing)
	if (testToken === 'test-token-admin-mock') {
		// Return a test admin user
		const testUser = await ctx.db
			.query('users')
			.withIndex('by_authId', (q: any) => q.eq('authId', 'test-user-id'))
			.first();
		if (testUser) return testUser;

		// Create test user if it doesn't exist
		throw new Error('Test user not found - run seedBaseline first');
	}

	try {
		const user = await authComponent.getAuthUser(ctx);
		if (user) {
			const authId = (user as any).authId || (user as any).id || (user as any)._id;
			if (authId && ctx.db) {
				const profile = await ctx.db
					.query('users')
					.withIndex('by_authId', (q: any) => q.eq('authId', authId))
					.first();
				if (profile) return profile;
			}
			return user;
		}
	} catch (e) {
		// Ignore lookup failures
	}

	// For unit tests (convex-test), authComponent.getAuthUser will fail
	// Return a mock admin user to allow tests to run
	if (testToken === 'unit-test-token') {
		return {
			_id: 'test-user-id' as any,
			authId: 'test-user-id',
			name: 'Test Admin',
			role: 'admin',
			status: 'active'
		} as any;
	}

	return null;
};

// Unified helper that ensures user AND profile exists
export const requireUserProfile = async (ctx: any, _testToken?: string): Promise<Doc<'users'>> => {
	const user = await getAuthenticatedUser(ctx, _testToken);
	if (user) {
		// If the user object ALREADY looks like a HWIS profile, return it
		if ((user as any)._id && (user as any).role && (user as any).status) {
			return user as Doc<'users'>;
		}

		// Otherwise try to resolve from DB
		const authId = (user as any).authId || (user as any).id || (user as any)._id;
		if (authId && ctx.db) {
			const profile = await ctx.db
				.query('users')
				.withIndex('by_authId', (q: any) => q.eq('authId', authId))
				.first();
			if (profile) return profile;
		}
	}

	throw new Error('Unauthorized');
};

// Basic authentication requirement
export const requireAuthenticatedUser = async (ctx: any, _testToken?: string) => {
	return await requireUserProfile(ctx, _testToken);
};

// Admin/Super role requirement
export const requireAdminRole = async (ctx: any, _testToken?: string) => {
	const user = await requireUserProfile(ctx, _testToken);

	const role = user.role;
	if (role !== 'admin' && role !== 'super') {
		throw new Error('Forbidden: Admin or super role required');
	}

	return user;
};
