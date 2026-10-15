import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { buildViewerSession, type ViewerSessionConfig } from '../../mocks/route-mocks';

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

const gotoMock = vi.fn();

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

import EslLayout from '$src/routes/esl/+layout.svelte';

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

function renderEslLayout() {
	return render(EslLayout, {
		props: { children: createRawSnippet(() => ({ render: () => '<span>ESL CONTENT</span>' })) }
	});
}

describe('esl layout auth gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows a spinner and does not bounce while the session is still loading', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isLoading: true } }));

		renderEslLayout();

		await expect.element(page.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('bounces to / once loaded and the user has no ESL access (international-only)', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher', status: 'active' }));

		renderEslLayout();

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/');
		});
	});

	it('renders the ESL shell and children for an ESL admin', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: 'teacher', status: 'active', departmentRoles: { esl: 'admin' } })
		);

		renderEslLayout();

		await expect.element(page.getByTestId('esl.nav')).toBeInTheDocument();
		await expect.element(page.getByText('ESL CONTENT')).toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).not.toHaveBeenCalled();
		});
	});

	it('renders department navigation for an ESL teacher (no admin link)', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({
				role: 'teacher',
				status: 'active',
				departmentRoles: { international: 'teacher', esl: 'teacher' }
			})
		);

		renderEslLayout();

		await expect.element(page.getByTestId('esl.nav.schedule')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl.nav.calendar')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl.nav.slips')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl.nav.zipgrade')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl.nav.admin')).not.toBeInTheDocument();
	});

	it('renders the ESL shell for a super user', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({
				role: 'super',
				status: 'active',
				departmentRoles: { esl: 'admin', international: 'admin' }
			})
		);

		renderEslLayout();

		await expect.element(page.getByTestId('esl.nav')).toBeInTheDocument();
		await expect.element(page.getByText('ESL CONTENT')).toBeInTheDocument();
	});
});
