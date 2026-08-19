export type AuthState = {
	isLoading: boolean;
	isAuthenticated: boolean;
};

/**
 * Computes the login redirect target for a client-side auth gate.
 * Returns null when no redirect is needed (auth still loading, user
 * authenticated, or already on the login page).
 */
export function computeAuthRedirect(
	pathname: string,
	search: string,
	auth: AuthState
): string | null {
	if (auth.isLoading) return null;
	if (auth.isAuthenticated) return null;
	if (pathname === '/login') return null;
	const callbackUrl = `${pathname}${search}`;
	return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
