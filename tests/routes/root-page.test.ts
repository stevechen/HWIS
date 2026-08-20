import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildViewerSession, type ViewerSessionConfig } from '../mocks/route-mocks';

const { mutationMock } = vi.hoisted(() => ({
	mutationMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('convex-svelte', () => ({
	setupConvex: vi.fn(),
	useQuery: vi.fn(),
	useConvexClient: vi.fn(() => ({
		mutation: mutationMock,
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/auth-client', () => ({
	authClient: {
		useSession: vi.fn(() => ({
			subscribe(run: (value: { isPending: boolean; data: unknown }) => void) {
				run({ isPending: false, data: null });
				return () => {};
			}
		})),
		signOut: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

const gotoMock = vi.fn();

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import RootPage from '$src/routes/+page.svelte';

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

function renderRootPage() {
	return render(RootPage);
}

function settledAuthenticated() {
	return buildViewerSession({ role: 'teacher', status: 'active' });
}

describe('Root Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows sign-in card when logged out', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isAuthenticated: false } }));

		renderRootPage();
		await expect.element(page.getByText('Please sign in to continue')).toBeInTheDocument();
	});

	it('renders nothing while the profile query is loading (no intermediate screen)', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isLoading: true } }));

		renderRootPage();
		await expect.element(page.getByText('HWIS')).not.toBeInTheDocument();
		await expect.element(page.getByText('Loading...')).not.toBeInTheDocument();
	});

	it('shows pending approval state for an unapproved profile', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher', status: 'pending' }));

		renderRootPage();
		await expect.element(page.getByText('Account Pending Approval')).toBeInTheDocument();
	});

	it('renders nothing and redirects for an approved admin (no intermediate screen)', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'admin', status: 'active' }));

		renderRootPage();

		await expect.element(page.getByText('HWIS')).not.toBeInTheDocument();
		await expect.element(page.getByText('Loading...')).not.toBeInTheDocument();
		await expect.element(page.getByText('Account Pending Approval')).not.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/admin');
		});
	});

	it('redirects an active student to their own evaluations page', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({
				role: 'student',
				status: 'active',
				enrollmentStatus: 'Enrolled',
				studentId: '888001'
			})
		);

		renderRootPage();

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/evaluations/student/888001');
		});
	});

	it('does not ensure a user profile while not authenticated', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isAuthenticated: false } }));

		renderRootPage();

		expect(mutationMock).not.toHaveBeenCalled();
	});

	it('does not ensure a user profile while the session is still loading', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ auth: { isLoading: true } }));

		renderRootPage();

		expect(mutationMock).not.toHaveBeenCalled();
	});

	it('ensures a user profile once the Convex token is confirmed (new user, no profile yet)', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(
			viewerFor({ role: undefined, status: undefined, profileExists: false })
		);

		renderRootPage();

		await vi.waitFor(() => {
			expect(mutationMock).toHaveBeenCalled();
		});
	});

	it('does not re-ensure a user profile for an existing user (profileExists true)', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(settledAuthenticated());

		renderRootPage();

		expect(mutationMock).not.toHaveBeenCalled();
	});
});
