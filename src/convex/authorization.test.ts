import { describe, it, expect } from 'vitest';
import type { Doc, Id } from './_generated/dataModel';
import {
	isAdmin,
	isStudent,
	canReadStudent,
	requireStudentDataAccess,
	canReadEvaluation,
	requireEvaluationAccess,
	requireStudentRole
} from './shared/authorization';

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

describe('canReadStudent', () => {
	it('returns true for admins regardless of target', () => {
		expect(canReadStudent(makeUser({ role: 'admin' }), studentId)).toBe(true);
	});

	it('returns true when student user owns the record', () => {
		const studentUser = makeUser({ role: 'student', studentRecordId: studentId });
		expect(canReadStudent(studentUser, studentId)).toBe(true);
	});

	it('returns false when student user targets a different record', () => {
		const studentUser = makeUser({
			role: 'student',
			studentRecordId: 'students-other' as Id<'students'>
		});
		expect(canReadStudent(studentUser, studentId)).toBe(false);
	});

	it('returns true for teachers', () => {
		expect(canReadStudent(makeUser({ role: 'teacher' }), studentId)).toBe(true);
	});
});

describe('requireStudentDataAccess', () => {
	it('does not throw for admin', () => {
		expect(() => requireStudentDataAccess(makeUser({ role: 'admin' }), studentId)).not.toThrow();
	});

	it('does not throw for student who owns the record', () => {
		const studentUser = makeUser({ role: 'student', studentRecordId: studentId });
		expect(() => requireStudentDataAccess(studentUser, studentId)).not.toThrow();
	});

	it('throws Forbidden for student targeting another record', () => {
		const studentUser = makeUser({
			role: 'student',
			studentRecordId: 'students-other' as Id<'students'>
		});
		expect(() => requireStudentDataAccess(studentUser, studentId)).toThrow('Forbidden');
	});
});

describe('canReadEvaluation', () => {
	it('returns true for admins', () => {
		expect(canReadEvaluation(makeUser({ role: 'admin' }), evaluation)).toBe(true);
	});

	it('returns true when student owns the evaluated record', () => {
		const studentUser = makeUser({ role: 'student', studentRecordId: studentId });
		expect(canReadEvaluation(studentUser, evaluation)).toBe(true);
	});

	it('returns false when student does not own the record', () => {
		const studentUser = makeUser({
			role: 'student',
			studentRecordId: 'students-other' as Id<'students'>
		});
		expect(canReadEvaluation(studentUser, evaluation)).toBe(false);
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

describe('requireStudentRole', () => {
	it('does not throw for student with a linked record', () => {
		const studentUser = makeUser({ role: 'student', studentRecordId: studentId });
		expect(() => requireStudentRole(studentUser)).not.toThrow();
	});

	it('throws for non-student roles', () => {
		expect(() => requireStudentRole(makeUser({ role: 'teacher' }))).toThrow(
			'Only students can access this endpoint'
		);
		expect(() => requireStudentRole(makeUser({ role: 'admin' }))).toThrow(
			'Only students can access this endpoint'
		);
	});

	it('throws when student has no linked record', () => {
		const studentUser = makeUser({ role: 'student' });
		expect(() => requireStudentRole(studentUser)).toThrow('Student record not linked');
	});
});
