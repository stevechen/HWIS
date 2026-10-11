import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { makeViewerSession } from '../../mocks/route-mocks';
import { useViewer } from '$lib/viewer.svelte';
import EslPage from '$src/routes/esl/+page.svelte';

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({ data: null, isLoading: false })),
	useConvexClient: vi.fn(() => ({ mutation: vi.fn(), query: vi.fn() }))
}));

describe('esl dashboard page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders department title and section tiles for admins', async () => {
		vi.mocked(useViewer).mockReturnValue(
			makeViewerSession(
				{ role: 'teacher', status: 'active', departmentRoles: { esl: 'admin' } },
				{ status: 'active', isEslStaff: true, isEslAdmin: true }
			)
		);
		render(EslPage);

		await expect.element(page.getByTestId('esl-dashboard.title')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.schedule')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.calendar')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.slips')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.zipgrade')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.admin')).toBeInTheDocument();
	});

	it('hides the admin tile from non-admin staff', async () => {
		vi.mocked(useViewer).mockReturnValue(
			makeViewerSession(
				{ role: 'teacher', status: 'active', departmentRoles: { esl: 'teacher' } },
				{ status: 'active', isEslStaff: true, isEslAdmin: false }
			)
		);
		render(EslPage);

		await expect.element(page.getByTestId('esl-dashboard.schedule')).toBeInTheDocument();
		await expect.element(page.getByTestId('esl-dashboard.calendar')).toBeInTheDocument();
		await expect
			.element(page.getByTestId('esl-dashboard.admin'))
			.not.toBeInTheDocument({ timeout: 1000 });
	});
});
