import { describe, expect, it } from 'vitest';
import {
	MIN_IB_GRADE,
	classGradientPosition,
	classSortPriority,
	eligibleTargetClasses,
	buildMovePlan,
	getDisplayName,
	groupClassesByGrade,
	isEligibleMoveTarget,
	isProtectedClass,
	moveRejectionReason,
	protectedClassErrorMessage
} from './shared/class_roster';
import type { RosterClass, RosterStudent } from './shared/class_roster';
import type { Id } from './_generated/dataModel';

function student(id: string, status: 'Enrolled' | 'Not Enrolled' = 'Enrolled'): RosterStudent {
	return { _id: id as Id<'students'>, name: `Student ${id}`, studentId: id, status };
}

function makeClass(
	id: string,
	grade: number,
	className: string,
	students: RosterStudent[] = []
): RosterClass {
	return { _id: id as Id<'classes'>, grade, class: className, students };
}

describe('class roster policy', () => {
	describe('getDisplayName', () => {
		it('renders numeric classes as grade-class', () => {
			expect(getDisplayName(7, '1')).toBe('7-1');
			expect(getDisplayName(12, '3')).toBe('12-3');
		});

		it('renders IB classes with the IB suffix', () => {
			expect(getDisplayName(11, 'IB')).toBe('11-IB');
		});

		it('renders default classes as just the grade', () => {
			expect(getDisplayName(7, 'default')).toBe('7');
		});
	});

	describe('isProtectedClass', () => {
		it('protects the "1" stream and IB classes', () => {
			expect(isProtectedClass('1')).toBe(true);
			expect(isProtectedClass('IB')).toBe(true);
		});

		it('does not protect numbered or default classes', () => {
			expect(isProtectedClass('2')).toBe(false);
			expect(isProtectedClass('default')).toBe(false);
		});
	});

	describe('protectedClassErrorMessage', () => {
		it('names the required class correctly for the "1" stream', () => {
			expect(protectedClassErrorMessage(7, '1')).toBe(
				'Cannot delete protected class 7-1: 1 classes are required'
			);
		});

		it('names the required class correctly for IB', () => {
			expect(protectedClassErrorMessage(11, 'IB')).toBe(
				'Cannot delete protected class 11-IB: IB classes are required'
			);
		});
	});

	describe('classSortPriority', () => {
		it('orders default first, then numbered, then IB last', () => {
			expect(classSortPriority('default')).toBeLessThan(classSortPriority('1'));
			expect(classSortPriority('1')).toBeLessThan(classSortPriority('2'));
			expect(classSortPriority('3')).toBeLessThan(classSortPriority('IB'));
		});

		it('treats non-numeric classes as nearly-last', () => {
			expect(classSortPriority('A')).toBeGreaterThan(classSortPriority('3'));
			expect(classSortPriority('A')).toBeLessThan(classSortPriority('IB'));
		});
	});

	describe('classGradientPosition', () => {
		it('places default first and IB last', () => {
			expect(classGradientPosition('default', 4)).toBe(0);
			expect(classGradientPosition('IB', 4)).toBe(3);
		});

		it('places numbered classes by their number', () => {
			expect(classGradientPosition('1', 4)).toBe(0);
			expect(classGradientPosition('3', 4)).toBe(2);
		});
	});

	describe('groupClassesByGrade', () => {
		it('groups classes by grade and drops Not Enrolled students', () => {
			const grouped = groupClassesByGrade([
				makeClass('c2', 7, '2', [student('s2'), student('s3', 'Not Enrolled')]),
				makeClass('c1', 7, '1', [student('s1')]),
				makeClass('c8', 8, '1')
			]);

			expect(grouped[7].map((c) => c.class)).toEqual(['1', '2']);
			expect(grouped[7][1].students.map((s) => s._id)).toEqual(['s2']);
			expect(grouped[8].map((c) => c.class)).toEqual(['1']);
			expect(grouped[9]).toEqual([]);
		});

		it('sorts IB last within a grade', () => {
			const grouped = groupClassesByGrade([makeClass('ib', 11, 'IB'), makeClass('c1', 11, '1')]);

			expect(grouped[11].map((c) => c.class)).toEqual(['1', 'IB']);
		});
	});

	describe('isEligibleMoveTarget', () => {
		it('allows movement within the same grade', () => {
			expect(isEligibleMoveTarget(7, { grade: 7, class: '2' })).toBe(true);
		});

		it('blocks cross-grade movement', () => {
			expect(isEligibleMoveTarget(7, { grade: 8, class: '1' })).toBe(false);
		});

		it('allows IB targets only at grades 11-12', () => {
			expect(isEligibleMoveTarget(MIN_IB_GRADE - 1, { grade: 10, class: 'IB' })).toBe(false);
			expect(isEligibleMoveTarget(MIN_IB_GRADE, { grade: 11, class: 'IB' })).toBe(true);
			expect(isEligibleMoveTarget(12, { grade: 12, class: 'IB' })).toBe(true);
		});
	});

	describe('moveRejectionReason', () => {
		it('returns null for allowed moves', () => {
			expect(moveRejectionReason(7, { grade: 7, class: '2' })).toBeNull();
		});

		it('names cross-grade rejections', () => {
			expect(moveRejectionReason(7, { grade: 8, class: '1' })).toBe('cross-grade');
		});

		it('names IB-below-min rejections separately from cross-grade', () => {
			expect(moveRejectionReason(10, { grade: 10, class: 'IB' })).toBe('ib-below-min');
			expect(moveRejectionReason(11, { grade: 11, class: 'IB' })).toBeNull();
		});
	});

	describe('buildMovePlan', () => {
		const classes = [
			makeClass('c7a', 7, '1', [student('s1'), student('s2')]),
			makeClass('c7b', 7, '2'),
			makeClass('c8a', 8, '1', [student('s3')])
		];

		it('moves students whose class shares the target grade', () => {
			const plan = buildMovePlan({
				studentIds: ['s1', 's2'] as Id<'students'>[],
				targetClass: { _id: 'c7b' as Id<'classes'>, grade: 7, class: '2' },
				classes
			});

			expect(plan.moves).toEqual([
				{ studentId: 's1', toClassId: 'c7b' },
				{ studentId: 's2', toClassId: 'c7b' }
			]);
			expect(plan.skipped).toEqual([]);
		});

		it('skips students from other grades as cross-grade', () => {
			const plan = buildMovePlan({
				studentIds: ['s1', 's3'] as Id<'students'>[],
				targetClass: { _id: 'c7b' as Id<'classes'>, grade: 7, class: '2' },
				classes
			});

			expect(plan.moves).toEqual([{ studentId: 's1', toClassId: 'c7b' }]);
			expect(plan.skipped).toEqual([{ studentId: 's3', reason: 'cross-grade' }]);
		});

		it('skips students not found in any class', () => {
			const plan = buildMovePlan({
				studentIds: ['s1', 'ghost'] as Id<'students'>[],
				targetClass: { _id: 'c7b' as Id<'classes'>, grade: 7, class: '2' },
				classes
			});

			expect(plan.moves).toEqual([{ studentId: 's1', toClassId: 'c7b' }]);
			expect(plan.skipped).toEqual([{ studentId: 'ghost', reason: 'no-source-class' }]);
		});

		it('does not move students into an IB class below grade 11', () => {
			const ibClass = { _id: 'c7ib' as Id<'classes'>, grade: 7, class: 'IB' };
			const plan = buildMovePlan({
				studentIds: ['s1'] as Id<'students'>[],
				targetClass: ibClass,
				classes: [...classes, makeClass('c7ib', 7, 'IB')]
			});

			expect(plan.moves).toEqual([]);
			expect(plan.skipped).toEqual([{ studentId: 's1', reason: 'cross-grade' }]);
		});
	});

	describe('eligibleTargetClasses', () => {
		const classes = [
			makeClass('c1', 7, '1', [student('s1')]),
			makeClass('c2', 7, '2'),
			makeClass('c3', 7, '3'),
			makeClass('c4', 8, '1')
		];

		it('excludes the source class when all students come from one class', () => {
			const targets = eligibleTargetClasses({
				grade: 7,
				classes,
				selectedStudentIds: ['s1'] as Id<'students'>[]
			});

			expect(targets.map((c) => c._id)).toEqual(['c2', 'c3']);
		});

		it('keeps source classes when students span multiple classes', () => {
			const multiSource = [...classes, makeClass('c5', 7, '4', [student('s2')])];
			const targets = eligibleTargetClasses({
				grade: 7,
				classes: multiSource,
				selectedStudentIds: ['s1', 's2'] as Id<'students'>[]
			});

			expect(targets.map((c) => c._id)).toEqual(['c1', 'c2', 'c3', 'c5']);
		});

		it('excludes IB classes below grade 11', () => {
			const withIB = [...classes, makeClass('ib7', 7, 'IB'), makeClass('ib11', 11, 'IB')];
			const targets = eligibleTargetClasses({
				grade: 7,
				classes: withIB,
				selectedStudentIds: ['s1'] as Id<'students'>[]
			});

			expect(targets.map((c) => c._id)).toEqual(['c2', 'c3']);
		});

		it('includes IB classes at grade 11-12', () => {
			const grade11 = [makeClass('c1', 11, '1', [student('s1')]), makeClass('ib', 11, 'IB')];
			const targets = eligibleTargetClasses({
				grade: 11,
				classes: grade11,
				selectedStudentIds: ['s1'] as Id<'students'>[]
			});

			expect(targets.map((c) => c._id)).toEqual(['ib']);
		});
	});
});
