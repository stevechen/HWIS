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
	canReadTeacherHistory,
	canReadEvaluation,
	canEditEvaluation,
	getEvaluationCapabilities,
	noEvaluationCapabilities,
	requireEvaluationAccess,
	requireEvaluationRead,
	requireEvaluationEdit,
	requireEvaluationCreate,
	requireEvaluationDelete,
	isInternationalStaff,
	isInternationalAdmin,
	isEslStaff,
	isEslAdmin,
	isHybridStaff,
	isActiveInternationalStaff,
	isActiveEslStaff,
	resolveDepartmentRoles,
	type AccessSubject,
	type Role,
	type UserStatus
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

describe('getEvaluationCapabilities', () => {
	it('gives admins global view and own-edit capability', () => {
		const capabilities = getEvaluationCapabilities({
			kind: 'staff',
			subject: makeUser({ role: 'admin' })
		});
		expect(capabilities).toEqual({
			viewAnyEvaluation: true,
			viewOwnEvaluation: true,
			editOwnEvaluation: true,
			editAnyEvaluation: false
		});
	});

	it('gives Super global edit capability', () => {
		const capabilities = getEvaluationCapabilities({
			kind: 'staff',
			subject: makeUser({ role: 'super' })
		});
		expect(capabilities.editAnyEvaluation).toBe(true);
	});

	it('gives enrolled students only own-view capability', () => {
		const capabilities = getEvaluationCapabilities({
			kind: 'student',
			studentId,
			enrollmentStatus: 'Enrolled'
		});
		expect(capabilities).toEqual({ ...noEvaluationCapabilities, viewOwnEvaluation: true });
	});

	it('denies inactive and anonymous actors', () => {
		expect(
			getEvaluationCapabilities({
				kind: 'staff',
				subject: makeUser({ role: 'teacher', status: 'pending' })
			})
		).toEqual(noEvaluationCapabilities);
		expect(getEvaluationCapabilities({ kind: 'anonymous' })).toEqual(noEvaluationCapabilities);
	});
});

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

	it.each(['pending', undefined] as const)('rejects non-active admin status %s', (status) => {
		expect(canReadEvaluation(makeUser({ role: 'admin', status }), evaluation)).toBe(false);
	});

	it('rejects pending teacher even when they authored the evaluation', () => {
		expect(
			canReadEvaluation(
				makeUser({ role: 'teacher', status: 'pending', _id: teacherId }),
				evaluation
			)
		).toBe(false);
	});
});

describe('canReadTeacherHistory', () => {
	it('allows active teachers', () => {
		expect(canReadTeacherHistory(makeUser({ role: 'teacher', status: 'active' }))).toBe(true);
	});

	it('rejects admins and inactive teachers', () => {
		expect(canReadTeacherHistory(makeUser({ role: 'admin' }))).toBe(false);
		expect(canReadTeacherHistory(makeUser({ role: 'teacher', status: 'pending' }))).toBe(false);
	});
});

describe('canEditEvaluation', () => {
	it("allows Super to edit another teacher's evaluation", () => {
		expect(canEditEvaluation(makeUser({ role: 'super' }), evaluation)).toBe(true);
	});

	it('allows an authoring teacher but not another teacher or admin', () => {
		expect(canEditEvaluation(makeUser({ role: 'teacher', _id: teacherId }), evaluation)).toBe(true);
		expect(canEditEvaluation(makeUser({ role: 'teacher' }), evaluation)).toBe(false);
		expect(canEditEvaluation(makeUser({ role: 'admin' }), evaluation)).toBe(false);
	});

	it('rejects inactive Super', () => {
		expect(canEditEvaluation(makeUser({ role: 'super', status: 'pending' }), evaluation)).toBe(
			false
		);
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

describe('requireEvaluationRead', () => {
	it('does not throw for admin reading any evaluation', () => {
		expect(() => requireEvaluationRead(makeUser({ role: 'admin' }), evaluation)).not.toThrow();
	});

	it('does not throw for super reading any evaluation', () => {
		expect(() => requireEvaluationRead(makeUser({ role: 'super' }), evaluation)).not.toThrow();
	});

	it('does not throw for authoring teacher', () => {
		const authoringTeacher = makeUser({ role: 'teacher', _id: teacherId });
		expect(() => requireEvaluationRead(authoringTeacher, evaluation)).not.toThrow();
	});

	it('throws Forbidden for non-authoring teacher', () => {
		const otherTeacher = makeUser({ role: 'teacher', _id: 'users-other' as Id<'users'> });
		expect(() => requireEvaluationRead(otherTeacher, evaluation)).toThrow('Forbidden');
	});

	it('throws Forbidden for inactive staff', () => {
		expect(() =>
			requireEvaluationRead(makeUser({ role: 'admin', status: 'pending' }), evaluation)
		).toThrow('Forbidden');
	});
});

describe('requireEvaluationEdit', () => {
	it('does not throw for super editing any evaluation', () => {
		expect(() => requireEvaluationEdit(makeUser({ role: 'super' }), evaluation)).not.toThrow();
	});

	it('does not throw for authoring teacher', () => {
		const authoringTeacher = makeUser({ role: 'teacher', _id: teacherId });
		expect(() => requireEvaluationEdit(authoringTeacher, evaluation)).not.toThrow();
	});

	it('throws "Not authorized" for non-authoring teacher', () => {
		const otherTeacher = makeUser({ role: 'teacher', _id: 'users-other' as Id<'users'> });
		expect(() => requireEvaluationEdit(otherTeacher, evaluation)).toThrow(
			'Not authorized to edit this evaluation'
		);
	});

	it('throws "Not authorized" for admin (admins cannot edit)', () => {
		expect(() => requireEvaluationEdit(makeUser({ role: 'admin' }), evaluation)).toThrow(
			'Not authorized to edit this evaluation'
		);
	});

	it('throws "Not authorized" for inactive staff', () => {
		const authoringTeacher = makeUser({ role: 'teacher', _id: teacherId, status: 'pending' });
		expect(() => requireEvaluationEdit(authoringTeacher, evaluation)).toThrow(
			'Not authorized to edit this evaluation'
		);
	});
});

describe('requireEvaluationCreate', () => {
	it('does not throw for active teacher', () => {
		expect(() => requireEvaluationCreate(makeUser({ role: 'teacher' }))).not.toThrow();
	});

	it('does not throw for active admin', () => {
		expect(() => requireEvaluationCreate(makeUser({ role: 'admin' }))).not.toThrow();
	});

	it('does not throw for active super', () => {
		expect(() => requireEvaluationCreate(makeUser({ role: 'super' }))).not.toThrow();
	});

	it('throws "Not authorized" for pending teacher', () => {
		expect(() => requireEvaluationCreate(makeUser({ role: 'teacher', status: 'pending' }))).toThrow(
			'Not authorized to create evaluations'
		);
	});

	it('throws "Not authorized" for student', () => {
		expect(() => requireEvaluationCreate(makeUser({ role: 'student' }))).toThrow(
			'Not authorized to create evaluations'
		);
	});

	it('throws "Not authorized" for undefined role', () => {
		expect(() => requireEvaluationCreate(makeUser({ role: undefined }))).toThrow(
			'Not authorized to create evaluations'
		);
	});
});

describe('requireEvaluationDelete', () => {
	it('does not throw for super deleting any evaluation', () => {
		expect(() => requireEvaluationDelete(makeUser({ role: 'super' }), evaluation)).not.toThrow();
	});

	it('does not throw for authoring teacher', () => {
		const authoringTeacher = makeUser({ role: 'teacher', _id: teacherId });
		expect(() => requireEvaluationDelete(authoringTeacher, evaluation)).not.toThrow();
	});

	it('throws "Not authorized" for non-authoring teacher', () => {
		const otherTeacher = makeUser({ role: 'teacher', _id: 'users-other' as Id<'users'> });
		expect(() => requireEvaluationDelete(otherTeacher, evaluation)).toThrow(
			'Not authorized to delete this evaluation'
		);
	});

	it('throws "Not authorized" for admin (admins cannot delete)', () => {
		expect(() => requireEvaluationDelete(makeUser({ role: 'admin' }), evaluation)).toThrow(
			'Not authorized to delete this evaluation'
		);
	});

	it('throws "Not authorized" for inactive staff', () => {
		const authoringTeacher = makeUser({ role: 'teacher', _id: teacherId, status: 'pending' });
		expect(() => requireEvaluationDelete(authoringTeacher, evaluation)).toThrow(
			'Not authorized to delete this evaluation'
		);
	});
});

describe('resolveDepartmentRoles', () => {
	it('falls back to the International department for legacy staff rows', () => {
		expect(resolveDepartmentRoles(makeUser({ role: 'teacher' }))).toEqual({
			international: 'teacher'
		});
		expect(resolveDepartmentRoles(makeUser({ role: 'admin' }))).toEqual({ international: 'admin' });
	});

	it('returns no department for super, students, and role-less subjects', () => {
		expect(resolveDepartmentRoles(makeUser({ role: 'super' }))).toEqual({});
		expect(resolveDepartmentRoles(makeUser({ role: 'student' }))).toEqual({});
		expect(resolveDepartmentRoles({})).toEqual({});
	});

	it('treats an empty departmentRoles object as absent and falls back', () => {
		expect(resolveDepartmentRoles(makeUser({ role: 'teacher', departmentRoles: {} }))).toEqual({
			international: 'teacher'
		});
	});

	it('prefers an explicit assignment over the legacy role fallback', () => {
		const roles = resolveDepartmentRoles(
			makeUser({ role: 'admin', departmentRoles: { esl: 'admin' } })
		);
		expect(roles.international).toBeUndefined();
		expect(roles.esl).toBe('admin');
	});
});

describe('department predicates', () => {
	it('treats legacy staff without an assignment as International-only', () => {
		const teacher = makeUser({ role: 'teacher', departmentRoles: undefined });

		expect(isInternationalStaff(teacher)).toBe(true);
		expect(isInternationalAdmin(teacher)).toBe(false);
		expect(isEslStaff(teacher)).toBe(false);
		expect(isEslAdmin(teacher)).toBe(false);
		expect(isHybridStaff(teacher)).toBe(false);
	});

	it('gives Super universal access to every department', () => {
		const superUser = makeUser({ role: 'super', departmentRoles: undefined });

		expect(isInternationalStaff(superUser)).toBe(true);
		expect(isInternationalAdmin(superUser)).toBe(true);
		expect(isEslStaff(superUser)).toBe(true);
		expect(isEslAdmin(superUser)).toBe(true);
		expect(isHybridStaff(superUser)).toBe(true);
	});

	it('honours an explicit ESL assignment without leaking International access', () => {
		const eslAdmin = makeUser({ role: 'teacher', departmentRoles: { esl: 'admin' } });

		expect(isEslAdmin(eslAdmin)).toBe(true);
		expect(isEslStaff(eslAdmin)).toBe(true);
		expect(isInternationalStaff(eslAdmin)).toBe(false);
		expect(isInternationalAdmin(eslAdmin)).toBe(false);
		expect(isHybridStaff(eslAdmin)).toBe(false);
	});

	it('honours an explicit International assignment', () => {
		const internationalTeacher = makeUser({
			role: 'teacher',
			departmentRoles: { international: 'teacher' }
		});

		expect(isInternationalStaff(internationalTeacher)).toBe(true);
		expect(isInternationalAdmin(internationalTeacher)).toBe(false);
		expect(isEslStaff(internationalTeacher)).toBe(false);
		expect(isEslAdmin(internationalTeacher)).toBe(false);
	});

	it('detects hybrid staff assigned to both departments', () => {
		const hybrid = makeUser({
			role: 'teacher',
			departmentRoles: { international: 'teacher', esl: 'admin' }
		});

		expect(isHybridStaff(hybrid)).toBe(true);
		expect(isInternationalStaff(hybrid)).toBe(true);
		expect(isEslAdmin(hybrid)).toBe(true);
	});

	it('denies every department to students and role-less subjects', () => {
		for (const denied of [makeUser({ role: 'student' }), makeUser({ role: undefined })]) {
			expect(isInternationalStaff(denied)).toBe(false);
			expect(isInternationalAdmin(denied)).toBe(false);
			expect(isEslStaff(denied)).toBe(false);
			expect(isEslAdmin(denied)).toBe(false);
			expect(isHybridStaff(denied)).toBe(false);
		}
	});

	it('requires an Active status for the active-staff variants', () => {
		const pendingEslTeacher = makeUser({
			role: 'teacher',
			status: 'pending',
			departmentRoles: { esl: 'teacher' }
		});

		expect(isEslStaff(pendingEslTeacher)).toBe(true);
		expect(isActiveEslStaff(pendingEslTeacher)).toBe(false);

		expect(isActiveInternationalStaff(makeUser({ role: 'teacher' }))).toBe(true);
		expect(isActiveInternationalStaff(makeUser({ role: 'teacher', status: 'pending' }))).toBe(
			false
		);
	});
});
