import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { buildViewerSession, type ViewerSessionConfig } from '../../../mocks/route-mocks';

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/esl/admin') }
}));

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
	useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
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

function renderLayout() {
	return render(EslAdminLayout, {
		props: { children: createRawSnippet(() => ({ render: () => '<span>ADMIN CONTENT</span>' })) }
	});
}

describe('esl admin layout auth gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('waits on the spinner and does not bounce while the session is loading', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isLoading: true } }));

		renderLayout();

		await expect.element(page.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
		await vi.waitFor(() => expect(gotoMock).not.toHaveBeenCalled());
	});

	it('bounces an ESL teacher away — the admin area needs the department admin role', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'teacher', status: 'active', departmentRoles: { esl: 'teacher' } })
		);

		renderLayout();

		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/'));
		await expect.element(page.getByTestId('esl-admin.nav')).not.toBeInTheDocument();
	});

	it('bounces an International-only admin away', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'admin', status: 'active', departmentRoles: { international: 'admin' } })
		);

		renderLayout();

		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/'));
	});

	it('bounces a pending ESL admin away — an inactive account is not admitted', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'teacher', status: 'pending', departmentRoles: { esl: 'admin' } })
		);

		renderLayout();

		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/'));
	});

	it('renders the admin shell and children for an ESL admin', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'teacher', status: 'active', departmentRoles: { esl: 'admin' } })
		);

		renderLayout();

		await expect.element(page.getByTestId('esl-admin.nav')).toBeInTheDocument();
		await expect.element(page.getByText('ADMIN CONTENT')).toBeInTheDocument();
		await vi.waitFor(() => expect(gotoMock).not.toHaveBeenCalled());
	});

	it('renders the admin shell for a super user', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'super', status: 'active' }));

		renderLayout();

		await expect.element(page.getByTestId('esl-admin.nav')).toBeInTheDocument();
		await expect.element(page.getByText('ADMIN CONTENT')).toBeInTheDocument();
	});

	it('links every administration section', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'teacher', status: 'active', departmentRoles: { esl: 'admin' } })
		);

		renderLayout();

		await expect.element(page.getByTestId('esl-admin.nav.overview')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-admin.nav.cohorts')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-admin.nav.students')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-admin.nav.users')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-admin.nav.back')).toBeInTheDocument();
	});
});
