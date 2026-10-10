/// <reference types="vite/client" />
import { vi } from 'vitest';
import {
	convexTest as originalConvexTest,
	type TestConvexForDataModelAndIdentity
} from 'convex-test';
import schema from './schema';
import type { DataModelFromSchemaDefinition } from 'convex/server';
import type { Id } from './_generated/dataModel';
import { authComponent, type AuthenticatedUserLike } from './auth';

export const modules = import.meta.glob('./**/*.ts');
type ConvexTestSchema = Parameters<typeof originalConvexTest>[0];
type ConvexTestModules = Parameters<typeof originalConvexTest>[1];

/**
 * A test instance that keeps its schema generic.
 *
 * `ReturnType<typeof convexTest>` erases the generics — they fall back to their
 * constraints, so `ctx.db` inside a `t.run` callback knows only the *system*
 * tables, and every `query('some_table')` or `.withIndex(...)` fails to typecheck.
 * Test files live inside `src/convex/`, so that failure also fails the Convex
 * push and withholds the whole deployment.
 *
 * Built from the real `schema`, which is what every test passes to `convexTest`.
 * `DataModelFromSchemaDefinition` is what `TestConvex` computes internally, so
 * naming these two reproduces the real return type exactly.
 */
export type ConvexTestInstance = TestConvexForDataModelAndIdentity<
	DataModelFromSchemaDefinition<typeof schema>
>;

/**
 * Mocks the better-auth getAuthUser query for a test.
 * Pass null to simulate an unauthenticated caller.
 */
export function mockAuthUser(user: AuthenticatedUserLike | null) {
	vi.spyOn(authComponent, 'getAuthUser').mockResolvedValue(user as never);
}

/**
 * Seeds a users row and returns its Id.
 * Only authId is required; the rest default to a plain active teacher.
 */
export async function seedUser(
	t: Awaited<ReturnType<typeof convexTest>>,
	overrides: {
		authId: string;
		name?: string;
		role?: 'super' | 'admin' | 'teacher' | 'student';
		status?: 'pending' | 'active';
	}
): Promise<Id<'users'>> {
	return t.run((ctx) =>
		ctx.db.insert('users', {
			authId: overrides.authId,
			name: overrides.name ?? 'Test User',
			role: overrides.role ?? 'teacher',
			status: overrides.status ?? 'active'
		})
	);
}

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
	t: Awaited<ReturnType<typeof convexTest>>,
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
): Promise<{ classId: Id<'classes'>; studentId: Id<'students'> }> {
	const opts = options;

	const classId = await t.run(async (ctx) => {
		return await ctx.db.insert('classes', {
			grade: opts.grade,
			class: opts.classNum
		});
	});

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
 * Deliberately not generic. `Awaited<ReturnType<typeof convexTest>>` instantiates
 * type parameters at their constraints, which would erase the real schema — so the
 * return type is pinned to {@link ConvexTestInstance} instead. `query`/`mutation`
 * are bound straight from the underlying instance so their generic signatures
 * survive; re-wrapping them in arrows was what erased every result to `any`.
 */
export async function convexTest(
	schema: ConvexTestSchema,
	modules: ConvexTestModules
): Promise<ConvexTestInstance> {
	const t = originalConvexTest(schema, modules) as unknown as ConvexTestInstance;

	return {
		...t,
		mutation: t.mutation.bind(t),
		query: t.query.bind(t),
		run: t.run.bind(t)
	};
}
