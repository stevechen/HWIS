import type { SessionStatus } from './viewer-core';

export type AuthState = {
	isLoading: boolean;
	isAuthenticated: boolean;
};

export const CALLBACK_URL_PARAM = 'callbackUrl';

/**
 * Maps a viewer session status to the auth gate's boolean state.
 *
 * A status of 'loading' means auth (and possibly the profile query) has not
 * settled yet. Everything except 'loading' and 'signedOut' counts as
 * authenticated, which keeps a user from being bounced to /login during the
 * JWT microtask race where a valid session briefly reports no user.
 */
export function toAuthState(status: SessionStatus): AuthState {
	return {
		isLoading: status === 'loading',
		isAuthenticated: status !== 'loading' && status !== 'signedOut'
	};
}

/**
 * Returns a safe relative redirect target for a callbackUrl search param, or
 * '/' when the value is missing or would cause an open redirect.
 */
export function validateCallbackUrl(raw: string | null): string {
	if (!raw) return '/';
	if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://')) return raw;
	return '/';
}

/**
 * Computes the login redirect target for a client-side auth gate.
 * Returns null when no redirect is needed (auth still loading, user
 * authenticated, or already on the login page).
 */
export function computeAuthRedirect(url: URL, auth: AuthState): string | null {
	if (auth.isLoading) return null;
	if (auth.isAuthenticated) return null;
	if (url.pathname === '/login') return null;
	if (isPublicPath(url.pathname)) return null;
	const callbackUrl = `${url.pathname}${url.search}`;
	return `/login?${CALLBACK_URL_PARAM}=${encodeURIComponent(callbackUrl)}`;
}

/**
 * Paths reachable without authentication. External clients (e.g. Google's
 * privacy-policy verifier) must be able to view these without being bounced
 * to /login.
 */
export function isPublicPath(pathname: string): boolean {
	if (pathname === '/privacy') return true;
	if (pathname === '/display' || pathname.startsWith('/display/')) return true;
	return false;
}
