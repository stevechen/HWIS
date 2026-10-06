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
	// The layout renders the backup-stale banner, which calls `useQuery`. Returned
	// as an object rather than a bare mock fn so `freshness.data` is readable;
	// `data: undefined` means "nothing to show", which is the normal healthy case.
	useQuery: vi.fn(() => ({ data: undefined })),
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

// The stale-backup banner is the primary alarm for issue #151: if backups stop
// succeeding and nobody opens the dashboard logs, an admin must still see it on
// any admin page and mention it. These tests pin the three states it must tell
// apart — healthy, stale with an age, and never-succeeded.
describe('admin layout backup-stale banner', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function renderWithFreshness(
		freshness: { ok: boolean; reason?: 'never' | 'stale'; ageMs?: number | null },
		filename: string | null = null
	) {
		const { useViewer } = await import('$lib/viewer.svelte');
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'admin', status: 'active' }));
		vi.mocked(useQuery).mockReturnValue({
			data: { freshness, filename }
		} as ReturnType<typeof useQuery>);

		renderAdminLayout();
	}

	it('shows no banner when the last backup is fresh', async () => {
		await renderWithFreshness({ ok: true, reason: undefined, ageMs: 3_600_000 });

		await expect.element(page.getByText('ADMIN CONTENT')).toBeInTheDocument();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('warns with the elapsed time when the backup is stale', async () => {
		await renderWithFreshness(
			{ ok: false, reason: 'stale', ageMs: 72 * 60 * 60 * 1000 },
			'backup-prod-2026-10-01.json'
		);

		await expect.element(page.getByRole('alert')).toBeInTheDocument();
		await expect.element(page.getByText(/Daily backup is stale/)).toBeInTheDocument();
		await expect.element(page.getByText(/3 days ago/)).toBeInTheDocument();
	});

	it('distinguishes never-happened from stale', async () => {
		await renderWithFreshness({ ok: false, reason: 'never', ageMs: null });

		await expect.element(page.getByText('No backup has ever been recorded')).toBeInTheDocument();
		await expect.element(page.getByText(/Daily backup is stale/)).not.toBeInTheDocument();
	});

	it('shows the banner to an ordinary admin, not only a super user', async () => {
		// The human-notice mechanism depends on this: a super-only banner would
		// need the one person who owns the credential to be the one looking.
		const { useViewer } = await import('$lib/viewer.svelte');
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'admin', status: 'active' }));
		vi.mocked(useQuery).mockReturnValue({
			data: { freshness: { ok: false, reason: 'stale', ageMs: 72 * 60 * 60 * 1000 } }
		} as ReturnType<typeof useQuery>);

		renderAdminLayout();

		await expect.element(page.getByRole('alert')).toBeInTheDocument();
	});
});
