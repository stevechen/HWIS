import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildViewerSession, type ViewerSessionConfig } from '../mocks/route-mocks';

const mockPagePath = { pathname: '/evaluations' };

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
	useQuery: vi.fn(),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	createSvelteAuthClient: vi.fn()
}));

vi.mock('$app/stores', async () => {
	const actual = await vi.importActual('$app/stores');
	return {
		...actual,
		page: {
			subscribe: vi.fn((callback) => {
				callback({ url: mockPagePath });
				return () => {};
			})
		}
	};
});

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

import Layout from '$src/routes/+layout.svelte';

describe('access control', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPagePath.pathname = '/evaluations';
	});

	it('active admin can access /admin - page content visible', async () => {
		mockPagePath.pathname = '/admin';
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'admin', status: 'active' }));

		render(Layout);
		// The Layout renders the header with title "Admin Dashboard" when on /admin
		await expect.element(page.getByText('Admin Dashboard')).toBeInTheDocument();
	});

	it('pending user sees modal on /evaluations', async () => {
		mockPagePath.pathname = '/evaluations';
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher', status: 'pending' }));

		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});

	it('pending user sees modal on /admin', async () => {
		mockPagePath.pathname = '/admin';
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher', status: 'pending' }));

		render(Layout);
		await expect.element(page.getByText('Access Restricted')).toBeVisible();
	});
});
