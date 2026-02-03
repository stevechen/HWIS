import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config';
import type { AuthConfig } from 'convex/server';

const resolveConvexSiteUrl = (): string | undefined => {
	const stripSlash = (value: string) => value.replace(/\/$/, '');
	const appOrigins = [
		process.env.SITE_URL,
		'http://localhost:5173',
		'http://127.0.0.1:5173'
	]
		.filter(Boolean)
		.map((value) => stripSlash(value as string));

	const normalize = (value?: string) => {
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

	const envSiteUrl = normalize(process.env.CONVEX_SITE_URL) ?? normalize(process.env.PUBLIC_CONVEX_SITE_URL);
	if (envSiteUrl) return envSiteUrl;

	const convexUrl = process.env.CONVEX_URL || process.env.PUBLIC_CONVEX_URL;
	return normalize(convexUrl);
};

const convexSiteUrl = resolveConvexSiteUrl();
if (convexSiteUrl && process.env.CONVEX_SITE_URL !== convexSiteUrl) {
	process.env.CONVEX_SITE_URL = convexSiteUrl;
}

export default {
	providers: [getAuthConfigProvider()]
} satisfies AuthConfig;
