import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const now = Date.now();
const day = 86_400_000;

const viewer = { _id: 'user_a1', name: 'Current Admin', role: 'admin', status: 'active' };

const newOne = {
	_id: 'user_p1',
	name: 'New Teacher One',
	authId: 'one@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'pending',
	createdAt: now - day
};
const newTwo = {
	_id: 'user_p2',
	name: 'New Teacher Two',
	authId: 'two@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'pending',
	createdAt: now - 2 * day
};
const deactivated = {
	_id: 'user_p3',
	name: 'Old Teacher',
	authId: 'old@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'pending',
	createdAt: now - 400 * day,
	deactivatedAt: now - 30 * day
};
const activeAdmin = {
	_id: 'user_a1',
	name: 'Current Admin',
	authId: 'a1@hwhs.tc.edu.tw',
	role: 'admin',
	status: 'active',
	createdAt: now - 500 * day
};
const activeTeacher = {
	_id: 'user_a2',
	name: 'Active Teacher',
	authId: 'a2@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'active',
	createdAt: now - 300 * day
};

const defaultUsers = [newOne, newTwo, deactivated, activeAdmin, activeTeacher];

let currentUsers: typeof defaultUsers = defaultUsers;
let queryCall = 0;
let mutationMock: ReturnType<typeof vi.fn>;

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => {
		queryCall += 1;
		if (queryCall === 1) {
			return { data: viewer, isLoading: false, error: null };
		}
		return { data: currentUsers, isLoading: false, error: null };
	}),
	useConvexClient: vi.fn(() => {
		mutationMock = vi.fn().mockResolvedValue(undefined);
		return {
			mutation: mutationMock,
			query: vi.fn().mockResolvedValue({})
		};
	})
}));

import UsersPage from '$src/routes/admin/users/+page.svelte';

describe('Users Admin Page - batch approval', () => {
	let mounted: ReturnType<typeof render>[] = [];

	beforeEach(() => {
		vi.clearAllMocks();
		queryCall = 0;
		currentUsers = defaultUsers;
		mounted = [];
	});

	afterEach(() => {
		for (const m of mounted) m.unmount();
	});

	function renderPage() {
		const r = render(UsersPage);
		mounted.push(r);
		return r;
	}

	it('renders Pending, Deactivated, and Active tabs with counts', async () => {
		renderPage();
		await expect.element(page.getByRole('tab', { name: /Pending/ })).toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: /Deactivated/ })).toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: /Active/ })).toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: 'Pending (2)' })).toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: 'Deactivated (1)' })).toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: 'Active (2)' })).toBeInTheDocument();
	});

	it('lands on the Pending tab by default when new signups exist', async () => {
		renderPage();
		await expect.element(page.getByText('New Teacher One')).toBeInTheDocument();
		await expect.element(page.getByText('New Teacher Two')).toBeInTheDocument();
	});

	it('pre-checks new signups and labels the hero "Approve all (N)"', async () => {
		renderPage();
		const approveAll = page.getByRole('button', { name: /Approve all/ });
		await expect.element(approveAll).toBeInTheDocument();
		await expect.element(approveAll).toHaveTextContent('Approve all (2)');
		await expect
			.element(page.getByRole('checkbox', { name: 'Select New Teacher One' }))
			.toBeChecked();
		await expect
			.element(page.getByRole('checkbox', { name: 'Select New Teacher Two' }))
			.toBeChecked();
	});

	it('flips the hero to "Approve checked (M)" when a new signup is unchecked', async () => {
		renderPage();
		const hero = page.getByTestId('admin-users.approve-checked');
		await expect.element(hero).toHaveTextContent('Approve all (2)');

		await page.getByRole('checkbox', { name: 'Select New Teacher One' }).click();
		await expect.element(hero).toHaveTextContent('Approve checked (1)');
	});

	it('disables the hero when nothing is checked', async () => {
		renderPage();
		const hero = page.getByTestId('admin-users.approve-checked');
		await page.getByRole('checkbox', { name: 'Select New Teacher One' }).click();
		await page.getByRole('checkbox', { name: 'Select New Teacher Two' }).click();
		await expect.element(hero).toHaveTextContent('Approve checked (0)');
		await expect.element(hero).toBeDisabled();
	});

	it('batch-approves exactly the checked ids via the users.update mutation', async () => {
		renderPage();
		await page.getByRole('button', { name: /Approve all/ }).click();

		await vi.waitFor(() => {
			expect(mutationMock).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ id: 'user_p1', status: 'active' })
			);
		});
		await vi.waitFor(() => {
			expect(mutationMock).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ id: 'user_p2', status: 'active' })
			);
		});
		expect(
			mutationMock.mock.calls.some(
				([, args]) => args && args.id === 'user_p3' && args.status === 'active'
			)
		).toBe(false);
	});

	it('does not pre-check deactivated teachers and shows "Reactivate" for them', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Deactivated/ }).click();

		await expect.element(page.getByText('Old Teacher')).toBeInTheDocument();
		await expect
			.element(page.getByRole('checkbox', { name: 'Select Old Teacher' }))
			.not.toBeChecked();
		await expect.element(page.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
	});

	it('distinguishes new signups from previously-deactivated teachers on their cards', async () => {
		renderPage();
		await expect.element(page.getByText(/New ·/).first()).toBeInTheDocument();

		await page.getByRole('tab', { name: /Deactivated/ }).click();
		await expect.element(page.getByText(/Access removed/)).toBeInTheDocument();
		await expect.element(page.getByText('previously deactivated')).toBeInTheDocument();
	});

	it('styles the Pending tab red only when there is at least one new pending teacher', async () => {
		const first = renderPage();
		const pendingTab = page.getByRole('tab', { name: 'Pending (2)' });
		await expect.element(pendingTab).toHaveClass(/text-red-600/);

		first.unmount();
		currentUsers = [deactivated, activeAdmin, activeTeacher];
		renderPage();
		// wait for the count to reflect the no-new-pending fixture
		const nowActive = page.getByRole('tab', { name: 'Active (2)' });
		await expect.element(nowActive).toBeInTheDocument();
		const pendingTabNoCount = page.getByRole('tab', { name: /Pending/ });
		await expect.element(pendingTabNoCount).not.toHaveClass(/text-red-600/);
	});

	it('lands on the Active tab when there are no new pending teachers', async () => {
		currentUsers = [deactivated, activeAdmin, activeTeacher];
		renderPage();
		await expect.element(page.getByText('Active Teacher')).toBeInTheDocument();
		await expect.element(page.getByText('New Teacher One')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('admin-users.hero')).not.toBeInTheDocument();
		await expect.element(page.getByText(/New teacher influx/)).not.toBeInTheDocument();
	});

	it('keeps the role dropdown on Active tab cards', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();
		await expect
			.element(page.getByRole('button', { name: /select role for Active Teacher/i }))
			.toBeInTheDocument();
	});

	it('moves approved teachers to the Active tab after batch approval', async () => {
		renderPage();
		await page.getByRole('button', { name: /Approve all/ }).click();
		await vi.waitFor(() => {
			expect(mutationMock).toHaveBeenCalled();
		});

		// After the last new signup is approved there are no new-pending teachers left, so
		// the influx banner disappears and the view flips to the Active tab, where the
		// now-approved teachers appear with an "Approved this session" badge.
		await expect.element(page.getByTestId('admin-users.hero')).not.toBeInTheDocument();
		await expect.element(page.getByText('Active (4)')).toBeVisible();
		await expect
			.element(page.getByTestId('admin-users.card-user_p1'))
			.toHaveTextContent('Approved this session');
		await expect
			.element(page.getByTestId('admin-users.card-user_p2'))
			.toHaveTextContent('Approved this session');
	});
});
