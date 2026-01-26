import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => {
	const mockUser = {
		data: { role: 'admin' },
		loading: false,
		error: null
	};

	return {
		useQuery: vi.fn(() => mockUser),
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

import BackupPage from '$src/routes/admin/backup/+page.svelte';

describe('Backup Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(BackupPage, { props: { data: { testRole: 'admin' } } });
		await expect
			.element(page.getByRole('heading', { name: 'Backup Management' }))
			.toBeInTheDocument();
	});

	it('shows back to admin button', async () => {
		render(BackupPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('renders clear all data button', async () => {
		render(BackupPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Clear All Data' })).toBeInTheDocument();
	});

	it('has force backup button', async () => {
		render(BackupPage, { props: { data: { testRole: 'admin' } } });
		await expect
			.element(page.getByRole('button', { name: 'Force Backup Now' }))
			.toBeInTheDocument();
	});

	it('shows database backup description', async () => {
		render(BackupPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByText('database')).toBeInTheDocument();
	});

	it('shows theme toggle button', async () => {
		render(BackupPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
	});
});
