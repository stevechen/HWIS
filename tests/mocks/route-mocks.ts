import {
	getEvaluationCapabilities,
	type Role,
	type StudentStatus,
	type UserStatus
} from '$convex/shared/authorization';
import type { Id } from '$convex/_generated/dataModel';
import {
	settleViewer,
	type AuthInput,
	type ProfileInput,
	type Viewer,
	type ViewerSession
} from '$lib/viewer-core';

export interface ViewerSessionConfig {
	role?: Role;
	status?: UserStatus;
	enrollmentStatus?: StudentStatus;
	profileExists?: boolean;
	name?: string;
	email?: string;
	studentId?: string;
	auth?: Partial<AuthInput>;
}

function buildActor(
	role: Role | undefined,
	status: UserStatus | undefined,
	enrollmentStatus: StudentStatus | undefined
): ViewerSession['actor'] {
	if (role === 'student') {
		return enrollmentStatus === 'Enrolled'
			? {
					kind: 'student',
					studentId: ('student_' + (status ?? 's')) as Id<'students'>,
					enrollmentStatus: 'Enrolled'
				}
			: { kind: 'anonymous' };
	}
	if (role && status) {
		return {
			kind: 'staff',
			subject: { role, status }
		};
	}
	return { kind: 'anonymous' };
}

function buildUser(config: ViewerSessionConfig): Viewer {
	return {
		_id: 'user_1' as Id<'users'>,
		name: config.name ?? 'Test User',
		email: config.email ?? 'test@hwhs.tc.edu.tw',
		role: config.role,
		status: config.status,
		enrollmentStatus: config.enrollmentStatus,
		profileExists: config.profileExists ?? true,
		studentId: config.studentId
	};
}

/**
 * Build a ViewerSession exactly as the real module would for the given role /
 * status / enrollment: constructs the backend-shaped profile input (actor and
 * capabilities derived via the shared authorization helpers) and runs it
 * through the same `settleViewer` the app uses. Defaults auth to a settled,
 * authenticated session. When auth is not authenticated, the profile is the
 * anonymous one the backend returns (user null, no capabilities).
 */
export function buildViewerSession(config: ViewerSessionConfig = {}): ViewerSession {
	const auth: AuthInput = {
		isLoading: false,
		isAuthenticated: true,
		...config.auth
	};

	const profile: ProfileInput =
		auth.isAuthenticated === false
			? {
					isLoading: false,
					data: {
						user: null,
						actor: { kind: 'anonymous' },
						capabilities: {
							viewAnyEvaluation: false,
							viewOwnEvaluation: false,
							editOwnEvaluation: false,
							editAnyEvaluation: false
						}
					}
				}
			: {
					isLoading: false,
					data: {
						user: buildUser(config),
						actor: buildActor(config.role, config.status, config.enrollmentStatus),
						capabilities: getEvaluationCapabilities(
							buildActor(config.role, config.status, config.enrollmentStatus)
						)
					}
				};

	return settleViewer(auth, profile);
}

/**
 * Like `buildViewerSession` but patches the derived session afterward. Use
 * overrides only for sessions the real module can never emit (e.g. the
 * timeline's defensive Access Denied branch for a not-enrolled student).
 */
export function makeViewerSession(
	config: ViewerSessionConfig = {},
	overrides: Partial<ViewerSession> = {}
): ViewerSession {
	return { ...buildViewerSession(config), ...overrides };
}
