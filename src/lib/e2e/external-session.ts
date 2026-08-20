import { browser } from '$app/environment';
import { E2E_SESSION_TOKEN_KEY } from './session-keys';

export type ExternalSession = { getAccessToken: () => string };

/**
 * Builds the external session object for the better-auth Svelte client when an
 * e2e session token is present in localStorage (injected by e2e/setup.spec.ts).
 * Returns undefined outside the browser or when no token is set.
 */
export function getExternalSession(): ExternalSession | undefined {
	if (!browser) return undefined;
	try {
		const sessionToken = localStorage.getItem(E2E_SESSION_TOKEN_KEY);
		if (!sessionToken) return undefined;
		return { getAccessToken: () => sessionToken };
	} catch {
		return undefined;
	}
}
