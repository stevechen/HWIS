import { vi } from 'vitest';

/**
 * Options for configuring Convex mock behavior
 */
export interface ConvexMockOptions {
	/** Default data to return from useQuery */
	data?: unknown[];
	/** Loading state for useQuery */
	isLoading?: boolean;
	/** Error state for useQuery */
	error?: unknown;
	/** Custom mutation function */
	customMutation?: ReturnType<typeof vi.fn>;
	/** Custom query function */
	customQuery?: ReturnType<typeof vi.fn>;
}

/**
 * Options for configuring Auth mock behavior
 */
export interface AuthMockOptions {
	/** Loading state for useAuth */
	isLoading?: boolean;
	/** Authentication state for useAuth */
	isAuthenticated?: boolean;
	/** User data to return from useAuth */
	user?: {
		name: string;
		role?: 'super' | 'admin' | 'teacher';
		status?: 'pending' | 'active';
	};
}

/**
 * Default Convex mock options
 */
const defaultConvexOptions: ConvexMockOptions = {
	data: [],
	isLoading: false,
	error: null
};

/**
 * Default Auth mock options
 */
const defaultAuthOptions: AuthMockOptions = {
	isLoading: false,
	isAuthenticated: true,
	user: { name: 'Test User' }
};

/**
 * Setup mock for convex-svelte module
 * Call this at the top of your test file before importing any components
 *
 * @example
 * ```typescript
 * import { setupConvexMocks } from '$tests/mocks/convex-mocks';
 *
 * setupConvexMocks({ data: [{ _id: '1', name: 'Test' }] });
 * ```
 */
export function setupConvexMocks(options: ConvexMockOptions = {}) {
	const opts = { ...defaultConvexOptions, ...options };

	return vi.mock('convex-svelte', () => ({
		setupConvex: vi.fn(),
		useQuery: vi.fn(() => ({
			data: opts.data,
			isLoading: opts.isLoading,
			error: opts.error
		})),
		useConvexClient: vi.fn(() => ({
			mutation: opts.customMutation ?? vi.fn().mockResolvedValue(undefined),
			query: opts.customQuery ?? vi.fn().mockResolvedValue({})
		}))
	}));
}

/**
 * Setup mock for @mmailaender/convex-better-auth-svelte/svelte module
 * Call this at the top of your test file before importing any components
 *
 * @example
 * ```typescript
 * import { setupAuthMocks } from '$tests/mocks/convex-mocks';
 *
 * setupAuthMocks({ user: { name: 'Admin', role: 'admin' } });
 * ```
 */
export function setupAuthMocks(options: AuthMockOptions = {}) {
	const opts = { ...defaultAuthOptions, ...options };

	return vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
		createSvelteAuthClient: vi.fn(),
		useAuth: vi.fn(() => ({
			isLoading: opts.isLoading,
			isAuthenticated: opts.isAuthenticated,
			data: opts.isAuthenticated ? { user: opts.user } : null
		}))
	}));
}

/**
 * Create a typed mock query result for use with manual mock overrides
 *
 * @example
 * ```typescript
 * const mockResult = createMockQueryResult([{ _id: '1', name: 'Test' }]);
 * // Use with vi.mocked(useQuery).mockReturnValue(mockResult);
 * ```
 */
export function createMockQueryResult<T>(data: T[]) {
	return {
		data,
		isLoading: false,
		error: undefined,
		isStale: false
	};
}

/**
 * Setup both Convex and Auth mocks together
 * Convenience function for common test setup
 *
 * @example
 * ```typescript
 * import { setupDefaultMocks } from '$tests/mocks/convex-mocks';
 *
 * setupDefaultMocks({
 *   convex: { data: students },
 *   auth: { user: { name: 'Admin', role: 'admin' } }
 * });
 * ```
 */
export function setupDefaultMocks(
	options: {
		convex?: ConvexMockOptions;
		auth?: AuthMockOptions;
	} = {}
) {
	setupConvexMocks(options.convex);
	setupAuthMocks(options.auth);
}
