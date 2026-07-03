import { verifyJWT } from 'better-auth/crypto';

const DEFAULT_CONVEX_URL = 'http://127.0.0.1:3210';

type JwtPayload = {
	iss?: string;
};

const decodeJwtPayload = async (token: string): Promise<JwtPayload | null> => {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (secret) {
		try {
			const verified = await verifyJWT(token, secret);
			if (verified) {
				return verified as JwtPayload;
			}
		} catch {
			// Fall through to unverified decode if JWT verification fails
		}
	}
	// Fallback: unverified decode (only reads the `iss` claim for URL routing)
	const parts = token.split('.');
	if (parts.length < 2) return null;
	try {
		const json = Buffer.from(parts[1], 'base64url').toString('utf-8');
		return JSON.parse(json) as JwtPayload;
	} catch {
		return null;
	}
};

export const getConvexUrlFromToken = async (token?: string, fallback?: string): Promise<string> => {
	if (!token) return fallback || DEFAULT_CONVEX_URL;

	const payload = await decodeJwtPayload(token);
	if (!payload?.iss) return fallback || DEFAULT_CONVEX_URL;

	let origin = payload.iss;
	try {
		origin = new URL(payload.iss).origin;
	} catch {
		// Keep raw issuer if it's not a valid URL
	}

	const stripSlash = (value: string) => value.replace(/\/$/, '');
	const appOrigins = [
		process.env.SITE_URL,
		process.env.PUBLIC_SITE_URL,
		process.env.VITE_SITE_URL,
		'http://localhost:5173',
		'http://127.0.0.1:5173'
	]
		.filter(Boolean)
		.map((value) => stripSlash(value as string));
	const normalizedOrigin = stripSlash(origin);
	if (appOrigins.includes(normalizedOrigin)) {
		return fallback || DEFAULT_CONVEX_URL;
	}

	if (origin.includes(':3211')) {
		return origin.replace(':3211', ':3210');
	}

	if (origin.includes('.convex.site')) {
		return origin.replace('.convex.site', '.convex.cloud');
	}

	return origin || fallback || DEFAULT_CONVEX_URL;
};
