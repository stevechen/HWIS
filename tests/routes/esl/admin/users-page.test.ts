import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getFunctionName } from 'convex/server';
import { useQuery } from 'convex-svelte';
import { selectOption } from '../../../lib/select';
import { buildViewerSession } from '../../../mocks/route-mocks';

const mockMutation = vi.fn().mockResolvedValue(undefined);

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true }))
}));

import { api } from '$convex/_generated/api';
import UsersPage from '$src/routes/esl/admin/users/+page.svelte';

const STAFF = [
	{
		_id: 'user_admin',
		name: 'Ada Admin',
		role: 'teacher' as const,
		status: 'active' as const,
		eslRole: 'admin' as const,
		internationalRole: null
	},
	{
		_id: 'user_teacher',
		name: 'Theo Teacher',
		role: 'teacher' as const,
		status: 'active' as const,
		eslRole: 'teacher' as const,
		internationalRole: 'teacher' as const
	},
	{
		_id: 'user_intl',
		name: 'Ivan International',
		role: 'teacher' as const,
		status: 'active' as const,
		eslRole: null,
		internationalRole: 'teacher' as const
	}
];

function withStaff(staff: unknown[] = STAFF) {
	vi.mocked(useQuery).mockImplementation(((reference: unknown) => {
		const name = getFunctionName(reference as never);
		return {
			data: name === 'esl/staff:list' ? staff : [],
			isLoading: false,
			error: null
		};
	}) as never);
}

async function signInAsEslAdmin() {
	const { useViewer } = await import('$lib/viewer.svelte');
	vi.mocked(useViewer).mockReturnValue(
		buildViewerSession({ role: 'teacher', status: 'active', departmentRoles: { esl: 'admin' } })
	);
}

describe('ESL admin users page', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		await signInAsEslAdmin();
		withStaff();
	});

	it('summarises department membership', async () => {
		render(UsersPage);

		await expect
			.element(page.getByTestId('esl-admin-users.summary'))
			.toHaveTextContent('2 in the department · 1 ESL admin(s) · 3 staff total');
	});

	it('lists staff with their current ESL and International assignments', async () => {
		render(UsersPage);

		await expect.element(page.getByText('Ada Admin')).toBeInTheDocument();
		await expect
			.element(page.getByRole('combobox', { name: 'ESL role for Ada Admin' }))
			.toHaveValue('admin');
		await expect
			.element(page.getByRole('combobox', { name: 'ESL role for Ivan International' }))
			.toHaveValue('none');
	});

	it('offers exactly the three ESL role choices', async () => {
		render(UsersPage);

		const select = page.getByRole('combobox', { name: 'ESL role for Theo Teacher' });
		await expect.element(select).toBeInTheDocument();
		// Scoped to one select: every row carries the same three options.
		for (const label of ['No ESL role', 'ESL Teacher', 'ESL Admin']) {
			await expect.element(select.getByRole('option', { name: label })).toBeInTheDocument();
		}
	});

	it('assigns the ESL admin role', async () => {
		render(UsersPage);

		await selectOption(
			page.getByRole('combobox', { name: 'ESL role for Ivan International' }),
			'admin'
		);

		await vi.waitFor(() =>
			expect(mockMutation).toHaveBeenCalledWith(api.esl.staff.setEslRole, {
				userId: 'user_intl',
				eslRole: 'admin'
			})
		);
	});

	it('clears the ESL role with a null assignment', async () => {
		render(UsersPage);

		await selectOption(page.getByRole('combobox', { name: 'ESL role for Theo Teacher' }), 'none');

		await vi.waitFor(() =>
			expect(mockMutation).toHaveBeenCalledWith(api.esl.staff.setEslRole, {
				userId: 'user_teacher',
				eslRole: null
			})
		);
	});

	it('surfaces a refused change, e.g. changing your own ESL role', async () => {
		mockMutation.mockRejectedValueOnce(new Error('You cannot change your own ESL role'));
		render(UsersPage);

		await selectOption(page.getByRole('combobox', { name: 'ESL role for Ada Admin' }), 'none');

		await expect
			.element(page.getByTestId('esl-admin-users.error'))
			.toHaveTextContent('You cannot change your own ESL role');
	});

	it('filters to ESL staff only', async () => {
		render(UsersPage);

		await page.getByTestId('esl-admin-users.only-esl').click();

		await expect.element(page.getByText('Ivan International')).not.toBeInTheDocument();
		await expect.element(page.getByText('Ada Admin')).toBeInTheDocument();
	});

	it('searches staff by name', async () => {
		render(UsersPage);

		await page.getByTestId('esl-admin-users.search').fill('theo');

		await expect.element(page.getByText('Theo Teacher')).toBeInTheDocument();
		await expect.element(page.getByText('Ada Admin')).not.toBeInTheDocument();
	});

	it('shows the empty state when nothing matches', async () => {
		render(UsersPage);

		await page.getByTestId('esl-admin-users.search').fill('nobody');

		await expect.element(page.getByTestId('esl-admin-users.empty')).toBeInTheDocument();
	});
});
