import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => {
	const mockStudents = [
		{ _id: 's001', grade: 12, status: 'Enrolled' },
		{ _id: 's002', grade: 11, status: 'Enrolled' }
	];

	const mockUser = {
		data: { role: 'admin' },
		loading: false,
		error: null
	};

	return {
		useQuery: vi.fn((_api: unknown) => {
			const apiStr = JSON.stringify(_api);
			if (apiStr.includes('viewer')) {
				return mockUser;
			}
			if (apiStr.includes('students')) {
				return { data: mockStudents, loading: false, error: null };
			}
			return { data: null, loading: false, error: null };
		}),
		useConvexClient: vi.fn(() => ({
			mutation: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue({})
		}))
	};
});

import AcademicPage from '$src/routes/admin/academic/+page.svelte';

describe('Academic Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders page title as heading', async () => {
		render(AcademicPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('heading', { name: 'Year-End Reset' })).toBeInTheDocument();
	});

	it('shows back button', async () => {
		render(AcademicPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByRole('button', { name: 'Back' })).toBeInTheDocument();
	});

	it('renders promote students description', async () => {
		render(AcademicPage, { props: { data: { testRole: 'admin' } } });
		await expect.element(page.getByText('Promote all enrolled students')).toBeInTheDocument();
	});
});
