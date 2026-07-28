/// <reference types="vite/client" />
import { convexTest as originalConvexTest } from 'convex-test';

export const modules = import.meta.glob('./**/*.ts');
type ConvexTestSchema = Parameters<typeof originalConvexTest>[0];
type ConvexTestModules = Parameters<typeof originalConvexTest>[1];

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

export function convexTest(schema: ConvexTestSchema, modules: ConvexTestModules) {
	const t = originalConvexTest(schema, modules);

	return {
		...t,
		mutation: (api: Parameters<typeof t.mutation>[0], args?: Parameters<typeof t.mutation>[1]) => {
			return t.mutation(api, args);
		},
		query: (api: Parameters<typeof t.query>[0], args?: Parameters<typeof t.query>[1]) => {
			return t.query(api, args);
		},
		run: t.run.bind(t)
	};
}
