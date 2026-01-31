/// <reference types="vite/client" />

import { convexTest as originalConvexTest } from 'convex-test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const modules = import.meta.glob('./**/*.ts') as any;

// Test token for unit tests
const UNIT_TEST_TOKEN = 'unit-test-token';

/**
 * Wrapper around convexTest that automatically injects testToken for auth
 * Use this instead of convexTest from 'convex-test' in unit tests
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convexTest(schema: any, modules: any) {
	const t = originalConvexTest(schema, modules);

	return {
		...t,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		mutation: async (api: any, args: any) => {
			// Inject testToken for auth
			const argsWithToken = args
				? { ...args, testToken: UNIT_TEST_TOKEN }
				: { testToken: UNIT_TEST_TOKEN };
			return t.mutation(api, argsWithToken);
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		query: async (api: any, args?: any) => {
			// Inject testToken for auth
			const argsWithToken = args
				? { ...args, testToken: UNIT_TEST_TOKEN }
				: { testToken: UNIT_TEST_TOKEN };
			return t.query(api, argsWithToken);
		},
		run: t.run.bind(t)
	};
}
