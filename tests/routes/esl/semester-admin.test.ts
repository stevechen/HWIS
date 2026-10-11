import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildViewerSession } from '../../mocks/route-mocks';

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

const gotoMock = vi.fn();

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: undefined, isLoading: false, error: null })),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({}),
		action: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import SemesterAdminPage from '$src/routes/esl/admin/semesters/[semesterId]/+page.svelte';

function viewerFor(config: { role?: string; departmentRoles?: { esl?: string } }) {
	return buildViewerSession({ ...config, status: 'active' });
}

describe('esl semester admin page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders semester title and back link', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ departmentRoles: { esl: 'admin' } }));

		render(SemesterAdminPage, { props: { data: { semesterId: 'sem_123' } } });

		await expect.element(page.getByTestId('esl-semester-admin.title')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-semester-admin.back-link')).toBeInTheDocument();
	});

	it('shows dataset 14718 link', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ departmentRoles: { esl: 'admin' } }));

		render(SemesterAdminPage, { props: { data: { semesterId: 'sem_123' } } });

		const datasetLink = page.getByTestId('esl-semester-admin.dataset-link');
		await expect.element(datasetLink).toBeInTheDocument();
		await expect.element(datasetLink).toHaveAttribute('href', 'https://data.gov.tw/dataset/14718');
	});

	it('renders CSV file input and upload button', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ departmentRoles: { esl: 'admin' } }));

		render(SemesterAdminPage, { props: { data: { semesterId: 'sem_123' } } });

		await expect.element(page.getByLabel('CSV File')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /upload calendar/i }))
			.toBeInTheDocument();
	});

	it('shows expected CSV format information', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ departmentRoles: { esl: 'admin' } }));

		render(SemesterAdminPage, { props: { data: { semesterId: 'sem_123' } } });

		await expect.element(page.getByText(/西元日期,星期,是否放假,備註/)).toBeInTheDocument();
		await expect.element(page.getByText(/YYYYMMDD/)).toBeInTheDocument();
		await expect.element(page.getByText(/是否放假=2/)).toBeInTheDocument();
	});

	it('bounces to / when user has no ESL access', async () => {
		const { useViewer } = await import('$lib/viewer.svelte');
		vi.mocked(useViewer).mockReturnValue(viewerFor({ role: 'teacher' }));

		render(SemesterAdminPage, { props: { data: { semesterId: 'sem_123' } } });

		await vi.waitFor(() => {
			expect(gotoMock).toHaveBeenCalledWith('/');
		});
	});
});
