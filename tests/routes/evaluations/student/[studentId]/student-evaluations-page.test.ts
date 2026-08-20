import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createMockEvaluationSet } from '../../../../fixtures/evaluations';
import {
	buildViewerSession,
	makeViewerSession,
	type ViewerSessionConfig
} from '../../../../mocks/route-mocks';

const mockEvalData = createMockEvaluationSet();

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockEvalData,
		isLoading: false,
		isStale: false,
		error: undefined
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn()
}));

import StudentEvaluationsPage from '$src/routes/evaluations/student/[studentId]/+page.svelte';
import type { Id } from '$convex/_generated/dataModel';
import { useViewer } from '$lib/viewer.svelte';

function viewerFor(config: ViewerSessionConfig) {
	return buildViewerSession(config);
}

function adminSession() {
	return viewerFor({ role: 'admin', status: 'active' });
}

function loadingSession() {
	return viewerFor({ auth: { isLoading: true } });
}

function studentSession(enrollmentStatus: 'Enrolled' | 'Not Enrolled' = 'Enrolled') {
	const config: ViewerSessionConfig = {
		role: 'student',
		status: 'active',
		enrollmentStatus,
		studentId: '888001',
		name: 'Student One'
	};
	if (enrollmentStatus === 'Not Enrolled') {
		// The real module emits an anonymous actor for a not-enrolled student
		// (pending status). The page's Access Denied branch is defensive dead
		// code in production, so reach it only via an explicit override.
		return makeViewerSession(config, {
			isStudent: true,
			isEnrolled: false,
			actor: {
				kind: 'student',
				studentId: 'student-001' as Id<'students'>,
				enrollmentStatus
			}
		});
	}
	return viewerFor(config);
}

describe('Student Evaluations Page — query gating while profile is loading', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useViewer).mockReturnValue(loadingSession());
	});

	it('does not render the page content while the session is loading', async () => {
		vi.mocked(useViewer).mockReturnValue(loadingSession());

		render(StudentEvaluationsPage, { props: { data: {} } });

		await expect.element(page.getByText('Loading user data...')).toBeInTheDocument();
		await expect.element(page.getByRole('region', { name: 'Evaluations' })).not.toBeInTheDocument();
	});

	it('renders the timeline for an enrolled student', async () => {
		vi.mocked(useViewer).mockReturnValue(studentSession('Enrolled'));

		render(StudentEvaluationsPage, { props: { data: {} } });

		await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
	});

	it('shows the access denied screen for a not-enrolled student', async () => {
		vi.mocked(useViewer).mockReturnValue(studentSession('Not Enrolled'));

		render(StudentEvaluationsPage, { props: { data: {} } });

		await expect.element(page.getByRole('heading', { name: /Access Denied/i })).toBeInTheDocument();
	});

	it('renders the timeline for an admin viewer', async () => {
		vi.mocked(useViewer).mockReturnValue(adminSession());

		render(StudentEvaluationsPage, { props: { data: {} } });

		await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
	});

	it('does not render a loading state once the session has settled', async () => {
		vi.mocked(useViewer).mockReturnValue(studentSession('Enrolled'));

		render(StudentEvaluationsPage, { props: { data: {} } });

		await expect.element(page.getByText('Loading...')).not.toBeInTheDocument();
	});
});
