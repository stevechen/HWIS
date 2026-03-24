import { vi } from 'vitest';

export interface ConvexMockOptions {
	data?: unknown;
	isLoading?: boolean;
	error?: unknown;
	customMutation?: ReturnType<typeof vi.fn>;
	customQuery?: ReturnType<typeof vi.fn>;
}

export interface AuthMockOptions {
	isLoading?: boolean;
	isAuthenticated?: boolean;
	user?: {
		name: string;
		role?: 'super' | 'admin' | 'teacher';
		status?: 'pending' | 'active';
	};
}

const defaultConvexOptions: ConvexMockOptions = {
	data: [],
	isLoading: false,
	error: null
};

const defaultAuthOptions: AuthMockOptions = {
	isLoading: false,
	isAuthenticated: true,
	user: { name: 'Test User' }
};

let currentConvexOptions: ConvexMockOptions = { ...defaultConvexOptions };
let currentAuthOptions: AuthMockOptions = { ...defaultAuthOptions };

const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue({});
const mockUseQuery = vi.fn(() => ({
	data: currentConvexOptions.data,
	isLoading: currentConvexOptions.isLoading ?? false,
	error: currentConvexOptions.error,
	isStale: false
}));
const mockCreateSvelteAuthClient = vi.fn();
const mockUseAuth = vi.fn(() => ({
	isLoading: currentAuthOptions.isLoading ?? false,
	isAuthenticated: currentAuthOptions.isAuthenticated ?? true,
	data: currentAuthOptions.isAuthenticated === false ? null : { user: currentAuthOptions.user }
}));

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
	useQuery: mockUseQuery,
	useConvexClient: vi.fn(() => ({
		mutation: currentConvexOptions.customMutation ?? mockMutation,
		query: currentConvexOptions.customQuery ?? mockQuery
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	createSvelteAuthClient: mockCreateSvelteAuthClient,
	useAuth: mockUseAuth
}));

export function setupConvexMocks(options: ConvexMockOptions = {}) {
	currentConvexOptions = { ...defaultConvexOptions, ...options };
	return {
		useQuery: mockUseQuery,
		mutation: currentConvexOptions.customMutation ?? mockMutation,
		query: currentConvexOptions.customQuery ?? mockQuery
	};
}

export function setupAuthMocks(options: AuthMockOptions = {}) {
	currentAuthOptions = { ...defaultAuthOptions, ...options };
	return {
		createSvelteAuthClient: mockCreateSvelteAuthClient,
		useAuth: mockUseAuth
	};
}

export function createMockQueryResult<T>(data: T) {
	return {
		data,
		isLoading: false,
		error: undefined,
		isStale: false
	};
}

export function setupDefaultMocks(
	options: {
		convex?: ConvexMockOptions;
		auth?: AuthMockOptions;
	} = {}
) {
	setupConvexMocks(options.convex);
	setupAuthMocks(options.auth);
}

export function resetMockOptions() {
	currentConvexOptions = { ...defaultConvexOptions };
	currentAuthOptions = { ...defaultAuthOptions };
	mockMutation.mockReset();
	mockMutation.mockResolvedValue(undefined);
	mockQuery.mockReset();
	mockQuery.mockResolvedValue({});
	mockUseQuery.mockClear();
	mockCreateSvelteAuthClient.mockClear();
	mockUseAuth.mockClear();
}
