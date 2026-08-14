import { getContext, setContext } from 'svelte';
import { useQuery } from 'convex-svelte';
import { api } from '$convex/_generated/api';
import type { AuthorizationActor, EvaluationCapabilities } from '$convex/shared/authorization';

export const AUTH_PROFILE_KEY = 'auth-profile';

export type ProfileResult = {
	user: unknown;
	actor: AuthorizationActor;
	capabilities: EvaluationCapabilities;
};

type ProfileQueryFn = () => ReturnType<typeof useQuery<typeof api.users.profile>>;

export type AuthProfile = ReturnType<ProfileQueryFn>;

export function setAuthProfile(profile: AuthProfile): void {
	setContext(AUTH_PROFILE_KEY, profile);
}

export function useAuthProfile(): AuthProfile {
	const contextValue = getContext<AuthProfile | null>(AUTH_PROFILE_KEY);
	if (contextValue) return contextValue;
	return useQuery(api.users.profile, () => ({}));
}
