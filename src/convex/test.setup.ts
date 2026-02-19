/// <reference types="vite/client" />

import { convexTest as originalConvexTest } from 'convex-test';

export const modules = import.meta.glob('./**/*.ts');
type ConvexTestSchema = Parameters<typeof originalConvexTest>[0];
type ConvexTestModules = Parameters<typeof originalConvexTest>[1];

// Test token for unit tests
const UNIT_TEST_TOKEN = 'unit-test-token';

/**
 * Wrapper around convexTest that automatically injects testToken for auth
 * Use this instead of convexTest from 'convex-test' in unit tests
 */
export function convexTest(schema: ConvexTestSchema, modules: ConvexTestModules) {
	const t = originalConvexTest(schema, modules);

	return {
		...t,
		mutation: async (
			api: Parameters<typeof t.mutation>[0],
			args?: Record<string, unknown>
		) => {
			// Inject testToken for auth
			const argsWithToken = args
				? { ...args, testToken: UNIT_TEST_TOKEN }
				: { testToken: UNIT_TEST_TOKEN };
			return t.mutation(api, argsWithToken as Parameters<typeof t.mutation>[1]);
		},
		query: async (api: Parameters<typeof t.query>[0], args?: Record<string, unknown>) => {
			// Inject testToken for auth
			const argsWithToken = args
				? { ...args, testToken: UNIT_TEST_TOKEN }
				: { testToken: UNIT_TEST_TOKEN };
			return t.query(api, argsWithToken as Parameters<typeof t.query>[1]);
		},
		run: t.run.bind(t)
	};
}
