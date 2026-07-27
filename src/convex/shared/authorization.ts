import type { Doc, Id } from '../_generated/dataModel';

export function isAdmin(user: Doc<'users'>): boolean {
	return user.role === 'admin' || user.role === 'super';
}

export function isStudent(user: Doc<'users'>): boolean {
	return user.role === 'student';
}

export function canReadStudent(
	user: Doc<'users'>,
	targetStudentId: Id<'students'> | string
): boolean {
	if (isAdmin(user)) return true;
	if (isStudent(user)) return user.studentRecordId === targetStudentId;
	return true;
}

export function requireStudentDataAccess(
	user: Doc<'users'>,
	targetStudentId: Id<'students'> | string
): void {
	if (!canReadStudent(user, targetStudentId)) {
		throw new Error('Forbidden');
	}
}

export function canReadEvaluation(
	user: Doc<'users'>,
	evaluation: { studentId: Id<'students'>; teacherId: Id<'users'> }
): boolean {
	if (isAdmin(user)) return true;
	if (isStudent(user)) return evaluation.studentId === user.studentRecordId;
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

export function requireStudentRole(
	user: Doc<'users'>
): asserts user is Doc<'users'> & { studentRecordId: Id<'students'> } {
	if (user.role !== 'student') {
		throw new Error('Only students can access this endpoint');
	}
	if (!user.studentRecordId) {
		throw new Error('Student record not linked');
	}
}
