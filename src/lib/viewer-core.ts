import {
	hasApplicationAccess,
	type AccessSubject,
	type AuthorizationActor,
	type EvaluationCapabilities,
	type StudentStatus
} from '$convex/shared/authorization';
import type { Id } from '$convex/_generated/dataModel';

/**
 * The settled identity of the signed-in user, as returned by the
 * `users.profile` query. Assignable to `AccessSubject` so the shared
 * authorization helpers accept it directly.
 */
export type Viewer = AccessSubject & {
	_id?: Id<'users'>;
	name?: string;
	email?: string;
	profileExists: boolean;
	studentId?: string;
	enrollmentStatus?: StudentStatus;
	englishName?: string;
	chineseName?: string;
	house?: string;
};

export type SessionStatus = 'loading' | 'signedOut' | 'pending' | 'active';

export type ViewerSession = {
	status: SessionStatus;
	viewer: Viewer | null;
	actor: AuthorizationActor;
	capabilities: EvaluationCapabilities;
	isAdmin: boolean;
	isTeacher: boolean;
	isStudent: boolean;
	isEnrolled: boolean;
	isApproved: boolean;
	needsProfileCreation: boolean;
};

export type AuthInput = {
	isLoading: boolean;
	isAuthenticated: boolean;
};

export type ProfileInput = {
	isLoading: boolean;
	data?: {
		user: unknown;
		actor: AuthorizationActor;
		capabilities: EvaluationCapabilities;
	} | null;
};

const anonymousActor: AuthorizationActor = { kind: 'anonymous' };

const emptyCapabilities: EvaluationCapabilities = {
	viewAnyEvaluation: false,
	viewOwnEvaluation: false,
	editOwnEvaluation: false,
	editAnyEvaluation: false
};

/**
 * The pure settle machine: derives the client session state from the raw auth
 * and profile inputs, without touching any hooks. Both the Svelte module and
 * test helpers feed it the same shape, so page-test mocks can never drift from
 * what the real module emits.
 */
export function settleViewer(auth: AuthInput, profile: ProfileInput): ViewerSession {
	const rawUser = profile.data?.user;
	const user = rawUser === undefined || rawUser === null ? null : (rawUser as Viewer);

	let status: SessionStatus;
	if (auth.isLoading) status = 'loading';
	else if (!auth.isAuthenticated) status = 'signedOut';
	else if (profile.isLoading) status = 'loading';
	// Authenticated yet the profile is still anonymous: the Convex JWT has
	// not reached the query (microtask race). Keep waiting instead of
	// treating this as "no access".
	else if (user === null) status = 'loading';
	else status = hasApplicationAccess(user) ? 'active' : 'pending';

	const actor = profile.data?.actor ?? anonymousActor;
	const capabilities = profile.data?.capabilities ?? emptyCapabilities;

	return {
		status,
		viewer: user,
		actor,
		capabilities,
		isStudent: actor.kind === 'student',
		isEnrolled: actor.kind !== 'student' || actor.enrollmentStatus === 'Enrolled',
		isAdmin: actor.kind === 'staff' && capabilities.viewAnyEvaluation,
		isTeacher:
			actor.kind === 'staff' && capabilities.viewOwnEvaluation && !capabilities.viewAnyEvaluation,
		isApproved: user !== null && hasApplicationAccess(user),
		needsProfileCreation:
			status !== 'loading' &&
			status !== 'signedOut' &&
			user !== null &&
			user.profileExists === false
	};
}
