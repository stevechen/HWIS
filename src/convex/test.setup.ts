/// <reference types="vite/client" />

import { convexTest as originalConvexTest } from 'convex-test';

export const modules = import.meta.glob('./**/*.ts');
type ConvexTestSchema = Parameters<typeof originalConvexTest>[0];
type ConvexTestModules = Parameters<typeof originalConvexTest>[1];

// Test tokens for unit tests
export const UNIT_TEST_TOKEN = 'unit-test-token';
export const SUPER_TEST_TOKEN = 'super-unit-test-token';

// Set of valid test tokens that should be preserved if passed
const VALID_TEST_TOKENS = new Set([UNIT_TEST_TOKEN, SUPER_TEST_TOKEN]);

/**
 * Helper to create a student with a class in unit tests.
 * Creates the class first, then creates the student with that classId.
 *
 * Usage:
 *   const { classId, studentId } = await createStudentWithClass(t, {
 *     englishName: 'John Doe',
 *     chineseName: '張三',
 *     studentId: '7001001',
 *     grade: 7,
 *     classNum: '1',
 *     status: 'Enrolled'
 *   });
 */
export async function createStudentWithClass(
	t: ReturnType<typeof convexTest>,
	options: {
		englishName: string;
		chineseName: string;
		studentId: string;
		grade: number;
		classNum: string;
		status: 'Enrolled' | 'Not Enrolled';
		e2eTag?: string;
		note?: string;
	}
): Promise<{ classId: string; studentId: string }> {
	// Destructure options
	const opts = options;

	// Create class first
	const classId = await t.run(async (ctx) => {
		return await ctx.db.insert('classes', {
			grade: opts.grade,
			class: opts.classNum
		});
	});

	// Then create student with classId
	const studentIdResult = await t.run(async (ctx) => {
		return await ctx.db.insert('students', {
			englishName: opts.englishName,
			chineseName: opts.chineseName,
			studentId: opts.studentId,
			classId,
			status: opts.status,
			e2eTag: opts.e2eTag,
			note: opts.note || ''
		});
	});

	return { classId, studentId: studentIdResult };
}

/**
 * Wrapper around convexTest that automatically injects testToken for auth
 * Use this instead of convexTest from 'convex-test' in unit tests
 *
 * By default, uses admin role (UNIT_TEST_TOKEN). For super role, pass
 * SUPER_TEST_TOKEN explicitly in args.testToken.
 */
export function convexTest(schema: ConvexTestSchema, modules: ConvexTestModules) {
	const t = originalConvexTest(schema, modules);

	return {
		...t,
		mutation: async (api: Parameters<typeof t.mutation>[0], args?: Record<string, unknown>) => {
			// Inject testToken for auth
			// Preserve valid test tokens, otherwise use default admin token
			const existingToken = args?.testToken;
			const testToken =
				existingToken && VALID_TEST_TOKENS.has(existingToken as string)
					? existingToken
					: UNIT_TEST_TOKEN;
			const argsWithToken = args ? { ...args, testToken } : { testToken: UNIT_TEST_TOKEN };
			return t.mutation(api, argsWithToken as Parameters<typeof t.mutation>[1]);
		},
		query: async (api: Parameters<typeof t.query>[0], args?: Record<string, unknown>) => {
			// Inject testToken for auth
			// Preserve valid test tokens, otherwise use default admin token
			const existingToken = args?.testToken;
			const testToken =
				existingToken && VALID_TEST_TOKENS.has(existingToken as string)
					? existingToken
					: UNIT_TEST_TOKEN;
			const argsWithToken = args ? { ...args, testToken } : { testToken: UNIT_TEST_TOKEN };
			return t.query(api, argsWithToken as Parameters<typeof t.query>[1]);
		},
		run: t.run.bind(t)
	};
}
