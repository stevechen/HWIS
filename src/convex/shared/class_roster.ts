// Class-roster decisions.
//
// The single home for the ADR-0005 class rules (same-grade movement, IB only
// for grades 11-12, protected classes) plus the roster-level decisions the
// classes page makes: which classes are eligible move targets, how a move plan
// is built (including the students it skips), and how classes are grouped for
// display. Convex mutations remain the authoritative enforcer (ADR-0002); the
// Svelte page imports the same pure functions so drag/drop and bulk movement
// share one decision path instead of reconstructing the rules in event
// handlers.

import type { Id } from '../_generated/dataModel';

export const GRADES = [7, 8, 9, 10, 11, 12];

// IB classes are only offered in grades 11-12 (IB-DP).
export const MIN_IB_GRADE = 11;

export interface RosterStudent {
	_id: Id<'students'>;
	name: string;
	studentId: string;
	status: 'Enrolled' | 'Not Enrolled';
}

export interface RosterClass {
	_id: Id<'classes'>;
	grade: number;
	class: string;
	students: RosterStudent[];
}

// ---- Display naming & protected classes (ADR-0005) ----

export function getDisplayName(grade: number, className: string): string {
	if (className === 'default') return `${grade}`;
	if (className === 'IB') return `${grade}-IB`;
	return `${grade}-${className}`;
}

export function isProtectedClass(className: string): boolean {
	return className === '1' || className === 'IB';
}

// Message shown when deleting a protected class (the "1" stream or "IB").
// Only called with a class that passes `isProtectedClass`.
export function protectedClassErrorMessage(grade: number, className: string): string {
	const required = className === '1' ? '1' : 'IB';
	return `Cannot delete protected class ${getDisplayName(grade, className)}: ${required} classes are required`;
}

// ---- Display grouping ----

// Gradient order within a grade: "default" first, then numbered classes
// (1, 2, 3...), non-numeric classes, and "IB" last (lightest).
export function classSortPriority(className: string): number {
	if (className === 'IB') return 999;
	if (className === 'default') return 0;
	const num = parseInt(className, 10);
	return isNaN(num) ? 998 : num;
}

// 0-based position in the gradient for `className` among `totalClasses`
// classes: "default" is first (brightest), numbered classes follow in order,
// and "IB" is last (lightest). Shared so the color stops stay in sync with
// `classSortPriority`.
export function classGradientPosition(className: string, totalClasses: number): number {
	if (className === 'IB') return totalClasses - 1;
	if (className === 'default') return 0;
	const num = parseInt(className, 10);
	return isNaN(num) ? 0 : num - 1;
}

// Group classes by grade, keeping only Enrolled students per class, ordered by
// gradient priority. Generic over `T` so callers keep their richer class shape.
export function groupClassesByGrade<T extends RosterClass>(classes: T[]): Record<number, T[]> {
	const grouped: Record<number, T[]> = {};
	for (const grade of GRADES) {
		grouped[grade] = classes
			.filter((c) => c.grade === grade)
			.map((c) => ({
				...c,
				students: c.students.filter((s) => s.status !== 'Not Enrolled')
			}))
			.sort((a, b) => classSortPriority(a.class) - classSortPriority(b.class));
	}
	return grouped;
}

// ---- Movement (ADR-0005) ----

// A student currently in `sourceGrade` may move into `targetClass` only within
// the same grade, and only into an IB class at grades 11-12.
export function isEligibleMoveTarget(
	sourceGrade: number,
	targetClass: { grade: number; class: string }
): boolean {
	return moveRejectionReason(sourceGrade, targetClass) === null;
}

// Why a move from `sourceGrade` into `targetClass` is not allowed, or null when
// it is allowed. The single source of the ADR-0005 movement rules; both the
// mutation's error messages and the move plan's skip reasons derive from it.
export function moveRejectionReason(
	sourceGrade: number,
	targetClass: { grade: number; class: string }
): 'cross-grade' | 'ib-below-min' | null {
	if (targetClass.grade !== sourceGrade) return 'cross-grade';
	if (targetClass.class === 'IB' && sourceGrade < MIN_IB_GRADE) return 'ib-below-min';
	return null;
}

export type MoveSkipReason = 'cross-grade' | 'no-source-class';

export interface MovePlan {
	moves: { studentId: Id<'students'>; toClassId: Id<'classes'> }[];
	skipped: { studentId: Id<'students'>; reason: MoveSkipReason }[];
}

// Build the move plan for sending `studentIds` to `targetClass`. Students whose
// current class shares the target's grade move; students from other grades (or
// not found in any class) are skipped. Drag/drop and bulk movement both execute
// through this plan so they decide on one path.
export function buildMovePlan(params: {
	studentIds: Id<'students'>[];
	targetClass: { _id: Id<'classes'>; grade: number; class: string };
	classes: RosterClass[];
}): MovePlan {
	const { studentIds, targetClass, classes } = params;
	const moves: MovePlan['moves'] = [];
	const skipped: MovePlan['skipped'] = [];

	for (const studentId of studentIds) {
		const sourceClass = classes.find((c) => c.students.some((s) => s._id === studentId));
		if (!sourceClass) {
			skipped.push({ studentId, reason: 'no-source-class' });
		} else if (moveRejectionReason(sourceClass.grade, targetClass) !== null) {
			skipped.push({ studentId, reason: 'cross-grade' });
		} else {
			moves.push({ studentId, toClassId: targetClass._id });
		}
	}

	return { moves, skipped };
}

// Classes in `grade` a bulk move may target: same-grade classes only, excluding
// the source class when every selected student comes from a single class, and
// excluding IB classes below grade 11. Ordered by gradient priority.
export function eligibleTargetClasses(params: {
	grade: number;
	classes: RosterClass[];
	selectedStudentIds: Id<'students'>[];
}): RosterClass[] {
	const { grade, classes, selectedStudentIds } = params;
	const selected = new Set(selectedStudentIds);

	const sourceClassIds = new Set<string>();
	for (const cls of classes) {
		for (const student of cls.students) {
			if (selected.has(student._id)) {
				sourceClassIds.add(cls._id);
			}
		}
	}
	const isSingleSource = sourceClassIds.size === 1;

	return classes
		.filter((cls) => {
			if (cls.grade !== grade) return false;
			if (isSingleSource && sourceClassIds.has(cls._id)) return false;
			if (cls.class === 'IB' && grade < MIN_IB_GRADE) return false;
			return true;
		})
		.sort((a, b) => classSortPriority(a.class) - classSortPriority(b.class));
}
