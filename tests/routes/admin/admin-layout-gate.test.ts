import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { buildViewerSession, type ViewerSessionConfig } from '../../mocks/route-mocks';

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
	useQuery: vi.fn(),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import AdminLayout from '$src/routes/admin/+layout.svelte';

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

const spinner = () => page.getByRole('status', { name: 'Loading' });

function renderAdminLayout() {
	return render(AdminLayout, {
		props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
	});
}

describe('admin layout auth gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows a spinner and does not bounce while the session is still loading', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isLoading: true } }));

		renderAdminLayout();

		await expect.element(spinner()).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('shows a spinner and does not bounce while not authenticated (session not settled)', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isAuthenticated: false } }));

		renderAdminLayout();

		await expect.element(spinner()).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('bounces to / once loaded and the user is not an admin', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher', status: 'active' }));

		renderAdminLayout();

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/');
		});
	});

	it('renders children once loaded and the user is an admin', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'admin', status: 'active' }));

		renderAdminLayout();

		await expect.element(page.getByText('ADMIN CONTENT')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});
});
