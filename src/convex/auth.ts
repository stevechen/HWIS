import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { query, mutation } from './_generated/server';
import { betterAuth } from 'better-auth/minimal';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import authConfig from './auth.config';
import { devGoogleCredentials } from './auth.local';

const siteUrl = process.env.SITE_URL || 'https://hwis.vercel.app';

const isDev =
	!process.env.NODE_ENV ||
	process.env.NODE_ENV === 'development' ||
	process.env.SITE_URL?.includes('localhost');

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
const EXCEPTION_EMAILS = ['steve.stevechen@gmail.com', 'steve.homecook@gmail.com'];
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
				prompt: 'select_account'
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

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return authComponent.getAuthUser(ctx);
	}
});
