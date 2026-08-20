import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildViewerSession } from '../../../mocks/route-mocks';

const now = Date.now();
const day = 86_400_000;

const newOne = {
	_id: 'user_p1',
	name: 'New Teacher One',
	authId: 'auth-one',
	email: 'one@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'pending',
	createdAt: now - day
};
const newTwo = {
	_id: 'user_p2',
	name: 'New Teacher Two',
	authId: 'auth-two',
	email: 'two@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'pending',
	createdAt: now - 2 * day
};
const deactivated = {
	_id: 'user_p3',
	name: 'Old Teacher',
	authId: 'auth-old',
	email: 'old@hwhs.tc.edu.tw',
	role: 'teacher',
	status: 'pending',
	createdAt: now - 400 * day,
	deactivatedAt: now - 30 * day
};
const activeAdmin = {
	_id: 'user_a1',
	name: 'Current Admin',
	authId: 'auth-a1',
	email: 'a1@hwhs.tc.edu.tw',
	role: 'admin',
	status: 'active',
	createdAt: now - 500 * day
};
const activeTeacher = {
	_id: 'user_a2',
	name: 'Active Teacher',
	authId: 'auth-a2',
	email: 'a2@hwhs.tc.edu.tw',
	image: 'https://lh3.googleusercontent.com/photo.jpg',
	role: 'teacher',
	status: 'active',
	createdAt: now - 300 * day
};

const defaultUsers = [newOne, newTwo, deactivated, activeAdmin, activeTeacher];

let currentUsers: typeof defaultUsers = defaultUsers;
let mutationMock: ReturnType<typeof vi.fn>;

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => {
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

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import UsersPage from '$src/routes/admin/users/+page.svelte';

describe('Users Admin Page - card grid', () => {
	let mounted: ReturnType<typeof render>[] = [];

	beforeEach(async () => {
		vi.clearAllMocks();
		currentUsers = defaultUsers;
		mounted = [];
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			buildViewerSession({ role: 'admin', status: 'active', name: 'Current Admin' })
		);
	});

	afterEach(() => {
		for (const m of mounted) m.unmount();
	});

	function renderPage() {
		const r = render(UsersPage);
		mounted.push(r);
		return r;
	}

	it('renders Pending, Active, and Deactivated tabs with counts', async () => {
		renderPage();
		await expect.element(page.getByRole('tab', { name: 'Pending (2)' })).toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: 'Active (2)' })).toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: 'Deactivated (1)' })).toBeInTheDocument();
	});

	it('lands on the Pending tab by default when new signups exist', async () => {
		renderPage();
		await expect.element(page.getByText('New Teacher One')).toBeInTheDocument();
		await expect.element(page.getByText('New Teacher Two')).toBeInTheDocument();
	});

	it('shows the "New teacher(s) pending" banner when new signups exist', async () => {
		renderPage();
		await expect.element(page.getByText('New teacher(s) pending')).toBeInTheDocument();
		await expect.element(page.getByText('2 awaiting access')).toBeInTheDocument();
	});

	it('pre-checks new signups and labels the hero "Approve checked (N)"', async () => {
		renderPage();
		const hero = page.getByTestId('admin-users.approve-checked');
		await expect.element(hero).toHaveTextContent('Approve checked (2)');
		await expect
			.element(page.getByRole('checkbox', { name: 'Select New Teacher One' }))
			.toBeChecked();
		await expect
			.element(page.getByRole('checkbox', { name: 'Select New Teacher Two' }))
			.toBeChecked();
	});

	it('updates the hero count as new signups are unchecked', async () => {
		renderPage();
		const hero = page.getByTestId('admin-users.approve-checked');
		await expect.element(hero).toHaveTextContent('Approve checked (2)');

		await page.getByRole('checkbox', { name: 'Select New Teacher One' }).click();
		await expect.element(hero).toHaveTextContent('Approve checked (1)');
	});

	it('hides the batch button entirely when nothing is checked', async () => {
		renderPage();
		const hero = page.getByTestId('admin-users.approve-checked');
		await page.getByRole('checkbox', { name: 'Select New Teacher One' }).click();
		await page.getByRole('checkbox', { name: 'Select New Teacher Two' }).click();
		await expect.element(hero).not.toBeInTheDocument();
	});

	it('batch-approves exactly the checked ids via the users.update mutation', async () => {
		renderPage();
		await page.getByTestId('admin-users.approve-checked').click();

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

	it('offers deactivated teachers no checkbox and a Reactivate action', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Deactivated/ }).click();

		await expect.element(page.getByText('Old Teacher')).toBeInTheDocument();
		await expect
			.element(page.getByRole('checkbox', { name: 'Select Old Teacher' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
	});

	it('distinguishes new signups from previously-deactivated teachers on their cards', async () => {
		renderPage();
		await expect.element(page.getByText(/New ·/).first()).toBeInTheDocument();

		await page.getByRole('tab', { name: /Deactivated/ }).click();
		await expect.element(page.getByText(/Access removed/)).toBeInTheDocument();
	});

	it('styles the unselected Pending tab red when new signups exist', async () => {
		renderPage();
		// Landed on Pending by default, so switch away to make it unselected.
		await page.getByRole('tab', { name: /Active/ }).click();
		const pendingTab = page.getByRole('tab', { name: 'Pending (2)' });
		await expect.element(pendingTab).toHaveClass(/text-red-600/);
	});

	it('hides the Pending tab entirely when there are no new signups', async () => {
		currentUsers = [deactivated, activeAdmin, activeTeacher];
		renderPage();
		await expect
			.element(page.getByTestId('admin-users.card-user_a2'))
			.toHaveTextContent('Active Teacher');
		await expect.element(page.getByRole('tab', { name: /Pending/ })).not.toBeInTheDocument();
		await expect.element(page.getByTestId('admin-users.hero')).not.toBeInTheDocument();
		await expect.element(page.getByText('New teacher(s) pending')).not.toBeInTheDocument();
	});

	it('keeps the role dropdown on Active tab cards', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();
		await expect
			.element(page.getByRole('button', { name: /select role for Active Teacher/i }))
			.toBeInTheDocument();
	});

	it('color-codes the role badge on a card', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();
		const card = page.getByTestId('admin-users.card-user_a1');
		await expect.element(card).toHaveTextContent('Admin');
	});

	it('moves approved teachers to the Active tab after batch approval', async () => {
		renderPage();
		await page.getByTestId('admin-users.approve-checked').click();
		await vi.waitFor(() => {
			expect(mutationMock).toHaveBeenCalled();
		});

		// After the last new signup is approved there are no new-pending teachers left, so
		// the banner and the Pending tab disappear and the view flips to Active, where the
		// now-approved teachers appear with an "Approved this session" badge.
		await expect.element(page.getByTestId('admin-users.hero')).not.toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: /Pending/ })).not.toBeInTheDocument();
		await expect.element(page.getByText('Active (4)')).toBeVisible();
		await expect
			.element(page.getByTestId('admin-users.card-user_p1'))
			.toHaveTextContent('Approved this session');
		await expect
			.element(page.getByTestId('admin-users.card-user_p2'))
			.toHaveTextContent('Approved this session');
	});

	it('displays the email below the user name instead of authId', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();
		await expect.element(page.getByText('a2@hwhs.tc.edu.tw')).toBeInTheDocument();
		await expect.element(page.getByText('auth-a2')).not.toBeInTheDocument();
	});

	it('renders a Google avatar image when the user.image field is present', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();
		const avatar = page.getByRole('img', { name: 'Active Teacher' });
		await expect.element(avatar).toBeInTheDocument();
		await expect.element(avatar).toHaveAttribute('alt', 'Active Teacher');
	});

	it('falls back to initials circle when no avatar image is available', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();
		await expect.element(page.getByTestId('admin-users.card-user_a1')).toHaveTextContent('CA');
	});

	it('strips CJK characters from names for display and sorting', async () => {
		const cjkUser = {
			_id: 'user_a3',
			name: 'Amy 王',
			authId: 'auth-a3',
			email: 'amy@hwhs.tc.edu.tw',
			role: 'teacher',
			status: 'active',
			createdAt: now - 100 * day
		};
		currentUsers = [activeAdmin, cjkUser, activeTeacher];
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();
		await expect.element(page.getByTestId('admin-users.card-user_a3')).toHaveTextContent('Amy');
		await expect.element(page.getByTestId('admin-users.card-user_a3')).not.toHaveTextContent('王');
	});

	it('keeps the remove-access action on Active cards but apart from the role dropdown', async () => {
		renderPage();
		await page.getByRole('tab', { name: /Active/ }).click();

		const removeBtn = page.getByTestId('admin-users.remove-access-user_a2');
		const roleTrigger = page.getByRole('button', { name: /select role for Active Teacher/i });
		await expect.element(removeBtn).toBeInTheDocument();
		await expect.element(roleTrigger).toBeInTheDocument();

		// The remove-access action is a whole-card control (top-right), not a sibling of the
		// role dropdown — the two no longer share the same container.
		expect(removeBtn.element().parentElement).not.toBe(roleTrigger.element().parentElement);
	});
});
