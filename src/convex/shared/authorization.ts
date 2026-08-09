import type { Id } from '../_generated/dataModel';

export type Role = 'super' | 'admin' | 'teacher' | 'student';
export type UserStatus = 'pending' | 'active';
export type StudentStatus = 'Enrolled' | 'Not Enrolled';

export type EvaluationCapabilities = {
	viewAnyEvaluation: boolean;
	viewOwnEvaluation: boolean;
	editOwnEvaluation: boolean;
	editAnyEvaluation: boolean;
};

export type AuthorizationActor =
	| { kind: 'anonymous' }
	| { kind: 'staff'; subject: AccessSubject & { _id?: Id<'users'> } }
	| { kind: 'student'; studentId: Id<'students'>; enrollmentStatus: StudentStatus };

/**
 * The minimal normalized identity input for access decisions. Both the Convex
 * user profile (`Doc<'users'>`) and the Svelte viewer shape are assignable to
 * it, so every caller — backend guards and frontend layouts — decides against
 * the same policy.
 */
export type AccessSubject = {
	role?: Role;
	status?: UserStatus;
	enrollmentStatus?: StudentStatus;
};

export const noEvaluationCapabilities: EvaluationCapabilities = {
	viewAnyEvaluation: false,
	viewOwnEvaluation: false,
	editOwnEvaluation: false,
	editAnyEvaluation: false
};

export function getEvaluationCapabilities(
	actor: AuthorizationActor,
	evaluation?: { teacherId: Id<'users'>; isUnlocked: boolean }
): EvaluationCapabilities {
	if (actor.kind === 'staff') {
		const { subject } = actor;
		const active = isActiveStaff(subject);
		const own =
			active &&
			(subject.role === 'teacher' || isAdmin(subject)) &&
			(evaluation === undefined || evaluation.teacherId === subject._id);
		const unlocked = evaluation === undefined || evaluation.isUnlocked;
		const canViewOwn =
			active &&
			(isAdmin(subject) || subject.role === 'teacher') &&
			(evaluation === undefined || evaluation.teacherId === subject._id);
		return {
			viewAnyEvaluation: active && isAdmin(subject),
			viewOwnEvaluation: canViewOwn,
			editOwnEvaluation: own && unlocked,
			editAnyEvaluation: active && isSuper(subject) && unlocked
		};
	}
	if (actor.kind === 'student' && actor.enrollmentStatus === 'Enrolled') {
		return { ...noEvaluationCapabilities, viewOwnEvaluation: true };
	}
	return noEvaluationCapabilities;
}

/** True when the subject's role is Admin or Super User. */
export function isAdmin(subject: AccessSubject): boolean {
	return subject.role === 'admin' || subject.role === 'super';
}

/** True when the subject's role is Super User. */
export function isSuper(subject: AccessSubject): boolean {
	return subject.role === 'super';
}

/** True when the subject is staff (Teacher, Admin, or Super User). */
export function isStaff(subject: AccessSubject): boolean {
	return isAdmin(subject) || subject.role === 'teacher';
}

/** True when the subject is a Student (identity derived from email, no profile). */
export function isStudent(subject: AccessSubject): boolean {
	return subject.role === 'student';
}

/** True when the subject is a staff member whose account is Active. */
export function isActiveStaff(subject: AccessSubject): boolean {
	return isStaff(subject) && subject.status === 'active';
}

/** True when the subject may enter the Admin area: Admin/Super role and Active status. */
export function canAccessAdminArea(subject: AccessSubject): boolean {
	return isAdmin(subject) && subject.status === 'active';
}

/** True when the subject is a Student whose record is Enrolled. */
export function isEnrolledStudent(subject: AccessSubject): boolean {
	return isStudent(subject) && subject.enrollmentStatus === 'Enrolled';
}

/**
 * True when the subject should be admitted into the application from the root
 * page: Active staff or an Enrolled Student. Distinct from the Admin-area
 * guard so Pending users land on the landing page instead of redirect-looping.
 */
export function hasApplicationAccess(subject: AccessSubject): boolean {
	return isActiveStaff(subject) || isEnrolledStudent(subject);
}

/** True when an active Teacher may use the authored-evaluation history interface. */
export function canReadTeacherHistory(subject: AccessSubject): boolean {
	return isActiveStaff(subject) && subject.role === 'teacher';
}

/** True when active Admin/Super users or the active authoring Teacher may read an evaluation. */
export function canReadEvaluation(
	subject: AccessSubject & { _id?: Id<'users'> },
	evaluation: { teacherId: Id<'users'> }
): boolean {
	if (!isActiveStaff(subject)) return false;
	if (isAdmin(subject)) return true;
	return subject.role === 'teacher' && evaluation.teacherId === subject._id;
}

/** True when an active staff member may edit an evaluation before the calendar lock. */
export function canEditEvaluation(
	subject: AccessSubject & { _id?: Id<'users'> },
	evaluation: { teacherId: Id<'users'> }
): boolean {
	if (!isActiveStaff(subject)) return false;
	return isSuper(subject) || evaluation.teacherId === subject._id;
}

/**
 * Builds a staff `AuthorizationActor` from a user profile (or any
 * `AccessSubject` that carries an `_id`). Every backend guard and the
 * frontend capability query decide against the same normalized actor.
 */
export function buildStaffActor(
	subject: AccessSubject & { _id?: Id<'users'> }
): AuthorizationActor {
	return { kind: 'staff', subject };
}

/** Evaluation context consumed by named operation guards. */
export type EvaluationContext = {
	teacherId: Id<'users'>;
	isUnlocked: boolean;
};

/**
 * Named read guard. Backed by `getEvaluationCapabilities`: a staff member may
 * read when they are Admin/Super (viewAny) or the authoring Teacher (viewOwn).
 * Student actors are denied here — their path is `getStudentEvaluationsAnonymous`.
 *
 * Lock status is irrelevant for reads, so `isUnlocked` is forced to `true` to
 * perform an auth-only check.
 *
 * Query handlers catch this error and return null/empty per endpoint contract.
 */
export function requireEvaluationRead(
	subject: AccessSubject & { _id?: Id<'users'> },
	evaluation: { teacherId: Id<'users'> }
): void {
	const actor = buildStaffActor(subject);
	const caps = getEvaluationCapabilities(actor, {
		teacherId: evaluation.teacherId,
		isUnlocked: true
	});
	if (!caps.viewAnyEvaluation && !caps.viewOwnEvaluation) {
		throw new Error('Forbidden');
	}
}

/** Alias preserved for existing callers and tests. */
export const requireEvaluationAccess = requireEvaluationRead;

/**
 * Named edit guard. Backed by `getEvaluationCapabilities`: Super may edit any
 * evaluation (editAny), Admin/Teacher their own (editOwn).
 *
 * The guard checks **authorisation only** (ownership + role + active status).
 * Calender-lock enforcement (`isEditable`) happens in the mutation handler
 * so that a distinct error message is produced for locked records, including
 * for Super.
 */
export function requireEvaluationEdit(
	subject: AccessSubject & { _id?: Id<'users'> },
	evaluation: { teacherId: Id<'users'> }
): void {
	const actor = buildStaffActor(subject);
	const caps = getEvaluationCapabilities(actor, {
		teacherId: evaluation.teacherId,
		isUnlocked: true
	});
	if (!caps.editAnyEvaluation && !caps.editOwnEvaluation) {
		throw new Error('Not authorized to edit this evaluation');
	}
}

/**
 * Named delete guard. Uses the same capability surface as edit but with a
 * distinct error message so callers can disambiguate auth vs. lock failures.
 */
export function requireEvaluationDelete(
	subject: AccessSubject & { _id?: Id<'users'> },
	evaluation: { teacherId: Id<'users'> }
): void {
	if (!isActiveStaff(subject) || (!isSuper(subject) && evaluation.teacherId !== subject._id)) {
		throw new Error('Not authorized to delete this evaluation');
	}
}

/**
 * Named create guard. Backed by `getEvaluationCapabilities`: only active
 * staff (Teacher/Admin/Super) may author evaluations. The `editOwn`/
 * `editAny` capabilities imply `create` since writing requires the same
 * role/status predicate.
 */
export function requireEvaluationCreate(subject: AccessSubject & { _id?: Id<'users'> }): void {
	if (!isActiveStaff(subject)) {
		throw new Error('Not authorized to create evaluations');
	}
}
