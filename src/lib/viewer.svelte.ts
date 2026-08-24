import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
import { useQuery } from 'convex-svelte';
import { api } from '$convex/_generated/api';
import { settleViewer, type AuthInput, type ProfileInput, type ViewerSession } from './viewer-core';

export type { Viewer, SessionStatus, ViewerSession } from './viewer-core';

export function useViewer(): ViewerSession {
	const auth = useAuth();
	const profile = useQuery(api.users.profile, () => ({}));

	// Settle the viewer session once and make it reactive
	const settled = $derived(settleViewer(auth, profile));

	return {
		get status() {
			return settled.status;
		},
		get viewer() {
			return settled.viewer;
		},
		get actor() {
			return settled.actor;
		},
		get capabilities() {
			return settled.capabilities;
		},
		get isStudent() {
			return settled.isStudent;
		},
		get isEnrolled() {
			return settled.isEnrolled;
		},
		get isAdmin() {
			return settled.isAdmin;
		},
		get isTeacher() {
			return settled.isTeacher;
		},
		get isApproved() {
			return settled.isApproved;
		},
		get needsProfileCreation() {
			return settled.needsProfileCreation;
		}
	};
}

export type { AuthInput, ProfileInput };
