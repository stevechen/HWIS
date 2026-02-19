import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockUsers = [
	{
		_id: 'user-1',
		name: 'Current Admin',
		role: 'admin',
		status: 'active'
	},
	{
		_id: 'user-2',
		name: 'Pending Teacher',
		role: 'teacher',
		status: 'pending'
	},
	{
		_id: 'user-3',
		name: 'Active Teacher',
		role: 'teacher',
		status: 'active'
	}
];

let queryCall = 0;

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => {
		queryCall += 1;
		if (queryCall === 1) {
			return {
				data: { _id: 'user-1', name: 'Current Admin', role: 'admin', status: 'active' },
				isLoading: false,
				error: null
			};
		}
		return {
			data: mockUsers,
			isLoading: false,
			error: null
		};
	}),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

import UsersPage from '$src/routes/admin/users/+page.svelte';

describe('Users Admin Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryCall = 0;
	});

	it('renders users table and user rows', async () => {
		render(UsersPage);
		await expect.element(page.getByRole('table', { name: 'users' })).toBeInTheDocument();
		await expect.element(page.getByText('Current Admin')).toBeInTheDocument();
		await expect.element(page.getByText('Pending Teacher')).toBeInTheDocument();
		await expect.element(page.getByText('Active Teacher')).toBeInTheDocument();
	});

	it('shows approve action for pending users', async () => {
		render(UsersPage);
		await expect.element(page.getByRole('button', { name: 'Approve User' })).toBeInTheDocument();
	});

	it('shows remove access action for active users', async () => {
		render(UsersPage);
		await expect
			.element(page.getByRole('button', { name: 'Remove Access' }).first())
			.toBeInTheDocument();
	});
});
