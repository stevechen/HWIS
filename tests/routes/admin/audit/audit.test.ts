import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockLogs = [
	{
		_id: 'log001',
		timestamp: Date.now() - 3600000,
		action: 'student.create',
		userId: 'user001',
		userName: 'Admin User',
		details: { studentName: 'John Smith' }
	}
];

const mockUser = {
	data: { role: 'admin' },
	loading: false,
	error: null
};

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn((_api: unknown) => {
		const apiStr = JSON.stringify(_api);
		if (apiStr.includes('viewer')) {
			return mockUser;
		}
		if (apiStr.includes('audit')) {
			return { data: mockLogs, loading: false, error: null };
		}
		return { data: null, loading: false, error: null };
	}),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin' } }
	}))
}));

import AuditPage from '$src/routes/admin/audit/+page.svelte';

describe('Audit Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(AuditPage);
		await expect.element(page.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
	});

	it('shows back to admin button', async () => {
		render(AuditPage);
		await expect.element(page.getByRole('button', { name: 'Back to Admin' })).toBeInTheDocument();
	});

	it('renders page structure', async () => {
		render(AuditPage);
		await expect.element(page.getByRole('heading', { name: 'Audit' })).toBeInTheDocument();
	});

	it('shows theme toggle button', async () => {
		render(AuditPage);
		await expect.element(page.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
	});
});
