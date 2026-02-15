import type { Id, TableNames } from '../../src/convex/_generated/dataModel';

/**
 * Type for the convexTest instance
 * This matches the interface from src/convex/test.setup.ts
 */
export interface ConvexTestInstance {
	run: <T>(fn: (ctx: { db: Database }) => Promise<T>) => Promise<T>;
	mutation: <T>(api: unknown, args: Record<string, unknown>) => Promise<T>;
	query: <T>(api: unknown, args: Record<string, unknown>) => Promise<T>;
}

/**
 * Database interface for direct operations - uses Convex's Database type
 */
export interface Database {
	insert: <T extends TableNames>(table: T, doc: Record<string, unknown>) => Promise<Id<T>>;
	get: <T>(id: string) => Promise<T | null>;
	query: <T extends TableNames>(table: T) => QueryBuilder<T>;
}

/**
 * Query builder interface
 */
export interface QueryBuilder<T extends TableNames> {
	filter: (fn: (q: FilterBuilder) => unknown) => QueryBuilder<T>;
	collect: () => Promise<Id<T>[]>;
	first: () => Promise<Id<T> | null>;
}

/**
 * Filter builder interface
 */
export interface FilterBuilder {
	eq: (a: unknown, b: unknown) => unknown;
	field: (name: string) => unknown;
}

/**
 * Default student values
 */
export const DEFAULT_STUDENT = {
	englishName: 'Test Student',
	chineseName: 'Test',
	studentId: 'STU001',
	grade: 10,
	status: 'Enrolled' as const
};

/**
 * Default teacher/user values
 */
export const DEFAULT_TEACHER = {
	authId: 'test-auth-id',
	name: 'Test Teacher',
	role: 'teacher' as const,
	status: 'active' as const
};

/**
 * Default category values
 */
export const DEFAULT_CATEGORY = {
	name: 'Test Category',
	subCategories: ['Sub1']
};

/**
 * Default evaluation values
 */
export const DEFAULT_EVALUATION = {
	value: 1,
	subCategory: 'Sub1',
	details: 'Test evaluation details',
	timestamp: Date.now(),
	semesterId: '2025-H1'
};

/**
 * Student creation options
 */
export type StudentOverrides = Partial<typeof DEFAULT_STUDENT> & {
	note?: string;
	e2eTag?: string;
};

/**
 * Teacher creation options
 */
export type TeacherOverrides = Partial<typeof DEFAULT_TEACHER> & {
	e2eTag?: string;
};

/**
 * Category creation options
 */
export type CategoryOverrides = Partial<typeof DEFAULT_CATEGORY> & {
	e2eTag?: string;
};

/**
 * Evaluation creation options
 */
export type EvaluationOverrides = Partial<typeof DEFAULT_EVALUATION> & {
	e2eTag?: string;
};

/**
 * Create a test student with defaults and optional overrides
 *
 * @example
 * ```typescript
 * const t = convexTest(schema, modules);
 * const studentId = await createTestStudent(t, { englishName: 'Custom Name' });
 * ```
 */
export async function createTestStudent(
	t: ConvexTestInstance,
	overrides: StudentOverrides = {}
): Promise<Id<'students'>> {
	const student = { ...DEFAULT_STUDENT, ...overrides };

	return t.run(async (ctx) => {
		return ctx.db.insert('students', student);
	});
}

/**
 * Create a test teacher (user) with defaults and optional overrides
 *
 * @example
 * ```typescript
 * const t = convexTest(schema, modules);
 * const teacherId = await createTestTeacher(t, { role: 'admin' });
 * ```
 */
export async function createTestTeacher(
	t: ConvexTestInstance,
	overrides: TeacherOverrides = {}
): Promise<Id<'users'>> {
	const teacher = { ...DEFAULT_TEACHER, ...overrides };

	return t.run(async (ctx) => {
		return ctx.db.insert('users', teacher);
	});
}

/**
 * Create a test category with defaults and optional overrides
 *
 * @example
 * ```typescript
 * const t = convexTest(schema, modules);
 * const categoryId = await createTestCategory(t, { name: 'Leadership', subCategories: ['Team Lead'] });
 * ```
 */
export async function createTestCategory(
	t: ConvexTestInstance,
	overrides: CategoryOverrides = {}
): Promise<Id<'point_categories'>> {
	const category = { ...DEFAULT_CATEGORY, ...overrides };

	return t.run(async (ctx) => {
		return ctx.db.insert('point_categories', category);
	});
}

/**
 * Create a test evaluation with defaults and required relationships
 *
 * @example
 * ```typescript
 * const t = convexTest(schema, modules);
 * const studentId = await createTestStudent(t);
 * const teacherId = await createTestTeacher(t);
 * const categoryId = await createTestCategory(t);
 * const evaluationId = await createTestEvaluation(t, studentId, teacherId, categoryId, { value: 2 });
 * ```
 */
export async function createTestEvaluation(
	t: ConvexTestInstance,
	studentId: Id<'students'>,
	teacherId: Id<'users'>,
	categoryId: Id<'point_categories'>,
	overrides: EvaluationOverrides = {}
): Promise<Id<'evaluations'>> {
	const evaluation = {
		...DEFAULT_EVALUATION,
		...overrides,
		studentId,
		teacherId,
		categoryId
	};

	return t.run(async (ctx) => {
		return ctx.db.insert('evaluations', evaluation);
	});
}

/**
 * Create a complete test data set with student, teacher, category, and optional evaluation
 * Useful for tests that need all related entities
 *
 * @example
 * ```typescript
 * const t = convexTest(schema, modules);
 * const { studentId, teacherId, categoryId, evaluationId } = await createTestDataSet(t);
 * ```
 */
export async function createTestDataSet(
	t: ConvexTestInstance,
	options: {
		student?: StudentOverrides;
		teacher?: TeacherOverrides;
		category?: CategoryOverrides;
		evaluation?: EvaluationOverrides;
		createEvaluation?: boolean;
	} = {}
) {
	const studentId = await createTestStudent(t, options.student);
	const teacherId = await createTestTeacher(t, options.teacher);
	const categoryId = await createTestCategory(t, options.category);

	let evaluationId: Id<'evaluations'> | undefined;
	if (options.createEvaluation !== false) {
		evaluationId = await createTestEvaluation(
			t,
			studentId,
			teacherId,
			categoryId,
			options.evaluation
		);
	}

	return { studentId, teacherId, categoryId, evaluationId };
}

/**
 * Generate a unique student ID for testing
 * Useful when creating multiple students in the same test
 */
let studentIdCounter = 0;
export function generateUniqueStudentId(): string {
	studentIdCounter++;
	return `STU${String(studentIdCounter).padStart(3, '0')}`;
}

/**
 * Reset the student ID counter (use in beforeEach)
 */
export function resetStudentIdCounter(): void {
	studentIdCounter = 0;
}
