import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockProfile = {
	user: { _id: 'user_t1', role: 'admin', status: 'active', authId: 'teacher-1' },
	actor: { kind: 'staff', subject: { role: 'admin', status: 'active' } },
	capabilities: {
		editAnyEvaluation: true,
		editOwnEvaluation: true,
		viewAnyEvaluation: true,
		viewOwnEvaluation: true
	}
};

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: [],
		isLoading: false,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('$lib/auth-profile', () => ({
	useAuthProfile: vi.fn(() => ({ data: mockProfile, isLoading: false, error: undefined })),
	AUTH_PROFILE_KEY: 'auth-profile',
	setAuthProfile: vi.fn()
}));

import EvaluationsPage from '$src/routes/evaluations/+page.svelte';

describe('Evaluations List', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { useAuthProfile } = await import('$lib/auth-profile');
		vi.mocked(useAuthProfile).mockReturnValue({
			data: mockProfile,
			isLoading: false,
			error: undefined
		} as unknown as ReturnType<typeof useAuthProfile>);
	});

	it('shows empty state when no evaluations', async () => {
		render(EvaluationsPage);
		await expect.element(page.getByText('No evaluations found')).toBeInTheDocument();
	});

	it('renders error state when the evaluations query fails', async () => {
		const { useQuery } = await import('convex-svelte');
		vi.mocked(useQuery).mockReturnValue({
			data: null,
			isLoading: false,
			error: new Error('Failed to load')
		} as unknown as ReturnType<typeof useQuery>);

		render(EvaluationsPage);
		await expect.element(page.getByText(/Error loading evaluations/)).toBeInTheDocument();
	});
});
