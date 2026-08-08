import type { Id } from '../_generated/dataModel';

export type Role = 'super' | 'admin' | 'teacher' | 'student';
export type UserStatus = 'pending' | 'active';
export type StudentStatus = 'Enrolled' | 'Not Enrolled';

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

/** True when active Admin/Super users or the active authoring Teacher may read an evaluation. */
export function canReadEvaluation(
	subject: AccessSubject & { _id?: Id<'users'> },
	evaluation: { teacherId: Id<'users'> }
): boolean {
	if (!isActiveStaff(subject)) return false;
	if (isAdmin(subject)) return true;
	return subject.role === 'teacher' && evaluation.teacherId === subject._id;
}

export function requireEvaluationAccess(
	subject: AccessSubject & { _id?: Id<'users'> },
	evaluation: { teacherId: Id<'users'> }
): void {
	if (!canReadEvaluation(subject, evaluation)) {
		throw new Error('Forbidden');
	}
}
