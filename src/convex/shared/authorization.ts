import type { Doc, Id } from '../_generated/dataModel';

export function isAdmin(user: Doc<'users'>): boolean {
	return user.role === 'admin' || user.role === 'super';
}

export function isStudent(user: Doc<'users'>): boolean {
	return user.role === 'student';
}

export function canReadEvaluation(
	user: Doc<'users'>,
	evaluation: { studentId: Id<'students'>; teacherId: Id<'users'> }
): boolean {
	if (isAdmin(user)) return true;
	return evaluation.teacherId === user._id;
}

export function requireEvaluationAccess(
	user: Doc<'users'>,
	evaluation: { studentId: Id<'students'>; teacherId: Id<'users'> }
): void {
	if (!canReadEvaluation(user, evaluation)) {
		throw new Error('Forbidden');
	}
}
