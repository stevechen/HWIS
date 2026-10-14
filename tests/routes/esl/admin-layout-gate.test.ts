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

import EslAdminLayout from '$src/routes/esl/admin/+layout.svelte';

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

const spinner = () => page.getByRole('status', { name: 'Loading' });

function renderEslAdminLayout() {
	return render(EslAdminLayout, {
		props: {
			children: createRawSnippet(() => ({ render: () => '<span>ESL ADMIN CONTENT</span>' }))
		}
	});
}

// The wizard lives at /esl/admin/semesters/new/wizard, so this layout is the
// gate that keeps it admin-only (it mirrors the backend's `requireEslAdmin`).
describe('esl admin layout auth gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows a spinner and does not bounce while the session is still loading', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isLoading: true } }));

		await renderEslAdminLayout();

		await expect.element(spinner()).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('bounces to / for a teacher with no ESL role at all', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher', status: 'active' }));

		await renderEslAdminLayout();

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/');
		});
		await expect.element(page.getByText('ESL ADMIN CONTENT')).not.toBeInTheDocument();
	});

	it('bounces to / for an ESL teacher who is not an ESL admin', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'teacher', status: 'active', departmentRoles: { esl: 'teacher' } })
		);

		await renderEslAdminLayout();

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/');
		});
		await expect.element(page.getByText('ESL ADMIN CONTENT')).not.toBeInTheDocument();
	});

	it('renders the admin shell and the wizard page for an ESL admin', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'teacher', status: 'active', departmentRoles: { esl: 'admin' } })
		);

		await renderEslAdminLayout();

		await expect.element(page.getByText('ESL ADMIN CONTENT')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-admin.nav')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('renders the admin shell for a super user', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'super', status: 'active', departmentRoles: { esl: 'admin' } })
		);

		await renderEslAdminLayout();

		await expect.element(page.getByText('ESL ADMIN CONTENT')).toBeInTheDocument();
	});
});
