import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => {
	const mockUsers = [
		{
			_id: 'u001',
			_creationTime: Date.now(),
			name: 'John Teacher',
			email: 'john@school.edu',
			role: 'teacher',
			status: 'active'
		},
		{
			_id: 'u002',
			_creationTime: Date.now() - 86400000,
			name: 'Jane Admin',
			email: 'jane@school.edu',
			role: 'admin',
			status: 'active'
		}
	];

	const mockUser = {
		data: { role: 'admin' },
		loading: false,
		error: null
	};

	return {
		useQuery: vi.fn((_api: unknown) => {
			const apiStr = JSON.stringify(_api);
			if (apiStr.includes('viewer')) {
				return mockUser;
			}
			if (apiStr.includes('list')) {
				return { data: mockUsers, loading: false, error: null };
			}
			return { data: null, loading: false, error: null };
		}),
		useConvexClient: vi.fn(() => ({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		}))
	};
});

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin' } }
	}))
}));

import UsersPage from '$src/routes/admin/users/+page.svelte';

describe('Users Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows back to admin button', async () => {
		render(UsersPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('renders page title as heading', async () => {
		render(UsersPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('heading', { name: 'Manage Users' })).toBeInTheDocument();
	});

	it('renders page description', async () => {
		render(UsersPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByText('teachers and staff')).toBeInTheDocument();
	});
});
