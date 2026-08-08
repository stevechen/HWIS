import { describe, it, expect } from 'vitest';
import type { Doc, Id } from './_generated/dataModel';
import {
	isAdmin,
	isSuper,
	isStaff,
	isStudent,
	isActiveStaff,
	canAccessAdminArea,
	isEnrolledStudent,
	hasApplicationAccess,
	canReadEvaluation,
	requireEvaluationAccess,
	type AccessSubject
} from './shared/authorization';

function subject(overrides: Partial<AccessSubject> = {}): AccessSubject {
	return { role: 'teacher', status: 'active', ...overrides };
}

function makeUser(overrides: Partial<Doc<'users'>> = {}): Doc<'users'> {
	return {
		_id: 'users-placeholder' as Id<'users'>,
		_creationTime: Date.now(),
		authId: 'auth-1',
		name: 'Test User',
		role: 'teacher',
		status: 'active',
		...overrides
	};
}

const studentId = 'students-1' as Id<'students'>;
const teacherId = 'users-teacher' as Id<'users'>;

const evaluation = {
	studentId,
	teacherId
};

describe('isAdmin', () => {
	it('returns true for admin role', () => {
		expect(isAdmin(makeUser({ role: 'admin' }))).toBe(true);
	});

	it('returns true for super role', () => {
		expect(isAdmin(makeUser({ role: 'super' }))).toBe(true);
	});

	it('returns false for teacher role', () => {
		expect(isAdmin(makeUser({ role: 'teacher' }))).toBe(false);
	});

	it('returns false for student role', () => {
		expect(isAdmin(makeUser({ role: 'student' }))).toBe(false);
	});

	it('returns false when role is undefined', () => {
		expect(isAdmin(makeUser({ role: undefined }))).toBe(false);
	});
});

describe('isStudent', () => {
	it('returns true for student role', () => {
		expect(isStudent(makeUser({ role: 'student' }))).toBe(true);
	});

	it('returns false for non-student roles', () => {
		expect(isStudent(makeUser({ role: 'admin' }))).toBe(false);
		expect(isStudent(makeUser({ role: 'teacher' }))).toBe(false);
		expect(isStudent(makeUser({ role: 'super' }))).toBe(false);
	});
});

describe('isSuper', () => {
	it.each<[Role | undefined, boolean]>([
		['super', true],
		['admin', false],
		['teacher', false],
		['student', false],
		[undefined, false]
	])('isSuper(%s) -> %s', (role, expected) => {
		expect(isSuper(subject({ role }))).toBe(expected);
	});

	it('does not depend on status', () => {
		expect(isSuper(subject({ role: 'super', status: 'pending' }))).toBe(true);
	});
});

describe('isStaff', () => {
	it.each<[Role | undefined, boolean]>([
		['super', true],
		['admin', true],
		['teacher', true],
		['student', false],
		[undefined, false]
	])('isStaff(%s) -> %s', (role, expected) => {
		expect(isStaff(subject({ role }))).toBe(expected);
	});
});

describe('isActiveStaff', () => {
	it.each<[Role | undefined, UserStatus | undefined, boolean]>([
		['super', 'active', true],
		['admin', 'active', true],
		['teacher', 'active', true],
		['student', 'active', false],
		[undefined, 'active', false],
		['super', 'pending', false],
		['admin', 'pending', false],
		['teacher', 'pending', false],
		['student', 'pending', false],
		[undefined, 'pending', false],
		['super', undefined, false],
		['admin', undefined, false],
		['teacher', undefined, false],
		['student', undefined, false],
		[undefined, undefined, false]
	])('isActiveStaff(%s, %s) -> %s', (role, status, expected) => {
		expect(isActiveStaff(subject({ role, status }))).toBe(expected);
	});
});

describe('canAccessAdminArea', () => {
	it.each<[Role | undefined, UserStatus | undefined, boolean]>([
		['super', 'active', true],
		['admin', 'active', true],
		['teacher', 'active', false],
		['student', 'active', false],
		[undefined, 'active', false],
		['super', 'pending', false],
		['admin', 'pending', false],
		['teacher', 'pending', false],
		['student', 'pending', false],
		[undefined, 'pending', false],
		['super', undefined, false],
		['admin', undefined, false],
		['teacher', undefined, false],
		['student', undefined, false],
		[undefined, undefined, false]
	])('canAccessAdminArea(%s, %s) -> %s', (role, status, expected) => {
		expect(canAccessAdminArea(subject({ role, status }))).toBe(expected);
	});
});

describe('isEnrolledStudent', () => {
	it.each<[Role | undefined, 'Enrolled' | 'Not Enrolled' | undefined, boolean]>([
		['student', 'Enrolled', true],
		['student', 'Not Enrolled', false],
		['student', undefined, false],
		['teacher', 'Enrolled', false],
		['admin', 'Enrolled', false],
		['super', 'Enrolled', false],
		[undefined, 'Enrolled', false]
	])('isEnrolledStudent(%s, %s) -> %s', (role, enrollmentStatus, expected) => {
		expect(isEnrolledStudent(subject({ role, enrollmentStatus }))).toBe(expected);
	});
});

describe('hasApplicationAccess', () => {
	it.each<[Role | undefined, UserStatus | undefined, boolean]>([
		['super', 'active', true],
		['admin', 'active', true],
		['teacher', 'active', true],
		['super', 'pending', false],
		['admin', 'pending', false],
		['teacher', 'pending', false],
		['super', undefined, false],
		['admin', undefined, false],
		['teacher', undefined, false]
	])('hasApplicationAccess(staff %s, %s) -> %s', (role, status, expected) => {
		expect(hasApplicationAccess(subject({ role, status }))).toBe(expected);
	});

	it.each<['Enrolled' | 'Not Enrolled' | undefined, boolean]>([
		['Enrolled', true],
		['Not Enrolled', false],
		[undefined, false]
	])('hasApplicationAccess(student, %s) -> %s', (enrollmentStatus, expected) => {
		expect(hasApplicationAccess(subject({ role: 'student', enrollmentStatus }))).toBe(expected);
	});
});

describe('canReadEvaluation', () => {
	it('returns true for admins', () => {
		expect(canReadEvaluation(makeUser({ role: 'admin' }), evaluation)).toBe(true);
	});

	it('returns true when teacher is the evaluator', () => {
		const teacherUser = makeUser({ role: 'teacher', _id: teacherId });
		expect(canReadEvaluation(teacherUser, evaluation)).toBe(true);
	});

	it('returns false when teacher did not create the evaluation', () => {
		const otherTeacher = makeUser({ role: 'teacher', _id: 'users-other' as Id<'users'> });
		expect(canReadEvaluation(otherTeacher, evaluation)).toBe(false);
	});
});

describe('requireEvaluationAccess', () => {
	it('does not throw for admin', () => {
		expect(() => requireEvaluationAccess(makeUser({ role: 'admin' }), evaluation)).not.toThrow();
	});

	it('throws Forbidden for non-evaluator teacher', () => {
		const otherTeacher = makeUser({ role: 'teacher', _id: 'users-other' as Id<'users'> });
		expect(() => requireEvaluationAccess(otherTeacher, evaluation)).toThrow('Forbidden');
	});
});
