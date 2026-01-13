import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import { betterAuth } from 'better-auth/minimal';
import authConfig from './auth.config';
import { devGoogleCredentials } from './auth.local';

const siteUrl = process.env.SITE_URL || 'https://hwis.vercel.app';

const isDev =
	!process.env.NODE_ENV ||
	process.env.NODE_ENV === 'development' ||
	process.env.SITE_URL?.includes('localhost');

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		baseURL: siteUrl,
		trustedOrigins: ['http://localhost:5173', siteUrl, 'https://*.vercel.app'],
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
		plugins: [convex({ authConfig })]
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
