import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: {
			houses: {
				Heracles: [],
				Wukong: [],
				Ixbalam: [],
				Setna: []
			},
			orphaned: []
		},
		isLoading: false,
		isStale: false,
		error: undefined
	})),
	useConvexClient: vi.fn(() => ({
		mutation: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue({})
	}))
}));

vi.mock('@mmailaender/convex-better-auth-svelte/svelte', () => ({
	useAuth: vi.fn(() => ({
		isLoading: false,
		isAuthenticated: true,
		data: { user: { name: 'Test Admin', role: 'admin' } }
	}))
}));

import HousesPage from '$src/routes/admin/houses/+page.svelte';

describe('Houses Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Structure', () => {
		it('renders four house regions', async () => {
			render(HousesPage);

			await expect
				.element(page.getByRole('region', { name: 'Heracles House' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('region', { name: 'Wukong House' })).toBeInTheDocument();
			await expect.element(page.getByRole('region', { name: 'Ixbalam House' })).toBeInTheDocument();
			await expect.element(page.getByRole('region', { name: 'Setna House' })).toBeInTheDocument();
		});

		it('renders house names in headers', async () => {
			render(HousesPage);

			await expect.element(page.getByText('Heracles')).toBeInTheDocument();
			await expect.element(page.getByText('Wukong')).toBeInTheDocument();
			await expect.element(page.getByText('Ixbalam')).toBeInTheDocument();
			await expect.element(page.getByText('Setna')).toBeInTheDocument();
		});

		it('renders unassigned students section', async () => {
			render(HousesPage);

			await expect
				.element(page.getByRole('region', { name: 'Unassigned Students' }))
				.toBeInTheDocument();
		});
	});

	describe('Accordion', () => {
		it('collapses and expands student list when house header is clicked', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: {
					houses: {
						Heracles: [
							{
								_id: 's1',
								englishName: 'Alice',
								chineseName: '',
								studentId: 'S001',
								status: 'Enrolled',
								house: 'Heracles',
								classDisplay: '7-1'
							}
						],
						Wukong: [],
						Ixbalam: [],
						Setna: []
					},
					orphaned: []
				},
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			const student = page.getByText('Alice');
			await expect.element(student).toBeInTheDocument();

			const region = page.getByRole('region', { name: 'Heracles House' });
			await region.getByRole('button').first().click();
			await expect.element(student).not.toBeInTheDocument();

			await region.getByRole('button').first().click();
			await expect.element(student).toBeInTheDocument();
		});

		it('collapses and expands orphaned section when unassigned header is clicked', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: {
					houses: { Heracles: [], Wukong: [], Ixbalam: [], Setna: [] },
					orphaned: [
						{
							_id: 's2',
							englishName: 'Bob',
							chineseName: '',
							studentId: 'S002',
							status: 'Enrolled',
							classDisplay: '7-1'
						}
					]
				},
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			const student = page.getByText('Bob');
			await expect.element(student).toBeInTheDocument();

			const region = page.getByRole('region', { name: 'Unassigned Students' });
			await region.getByRole('button').first().click();
			await expect.element(student).not.toBeInTheDocument();

			await region.getByRole('button').first().click();
			await expect.element(student).toBeInTheDocument();
		});
	});

	describe('Move Dialog', () => {
		it('opens dialog when student is clicked and closes on Cancel', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: {
					houses: {
						Heracles: [
							{
								_id: 's1',
								englishName: 'Alice',
								chineseName: '',
								studentId: 'S001',
								status: 'Enrolled',
								house: 'Heracles',
								classDisplay: '7-1'
							}
						],
						Wukong: [],
						Ixbalam: [],
						Setna: []
					},
					orphaned: []
				},
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await page.getByRole('button', { name: 'Move Alice to another house' }).click();

			await expect.element(page.getByText('Move Alice')).toBeInTheDocument();
			await expect.element(page.getByText('Currently in Heracles')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect.element(page.getByText('Move Alice')).not.toBeInTheDocument();
		});

		it('opens dialog for unassigned students', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: {
					houses: { Heracles: [], Wukong: [], Ixbalam: [], Setna: [] },
					orphaned: [
						{
							_id: 's2',
							englishName: 'Bob',
							chineseName: '',
							studentId: 'S002',
							status: 'Enrolled',
							classDisplay: '7-1'
						}
					]
				},
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await page.getByRole('button', { name: /Move Bob/ }).click();

			await expect.element(page.getByText('Move Bob')).toBeInTheDocument();
			await expect.element(page.getByText('Currently in Unassigned')).toBeInTheDocument();

			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect.element(page.getByText('Move Bob')).not.toBeInTheDocument();
		});
	});

	describe('Multi-Select', () => {
		it('renders Select button', async () => {
			render(HousesPage);

			await expect.element(page.getByRole('button', { name: 'Select' })).toBeInTheDocument();
		});

		it('enters selection mode when Select is clicked', async () => {
			render(HousesPage);

			await page.getByRole('button', { name: 'Select' }).click();
			await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
		});

		it('selects and deselects a student in selection mode', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: {
					houses: {
						Heracles: [
							{
								_id: 's1',
								englishName: 'Alice',
								chineseName: '',
								studentId: 'S001',
								status: 'Enrolled',
								house: 'Heracles',
								classDisplay: '7-1'
							}
						],
						Wukong: [],
						Ixbalam: [],
						Setna: []
					},
					orphaned: []
				},
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await page.getByRole('button', { name: 'Select' }).click();

			// Click student to select
			await page.getByRole('button', { name: /Select Alice/ }).click();

			// Bulk action bar should appear
			await expect.element(page.getByRole('toolbar')).toBeInTheDocument();
			await expect.element(page.getByText('Move 1 student to:')).toBeInTheDocument();

			// Click again to deselect
			await page.getByRole('button', { name: /Select Alice/ }).click();
			await expect.element(page.getByText('Move 1 student to:')).not.toBeInTheDocument();
		});

		it('exits selection mode when Done is clicked', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: {
					houses: {
						Heracles: [
							{
								_id: 's1',
								englishName: 'Alice',
								chineseName: '',
								studentId: 'S001',
								status: 'Enrolled',
								house: 'Heracles',
								classDisplay: '7-1'
							}
						],
						Wukong: [],
						Ixbalam: [],
						Setna: []
					},
					orphaned: []
				},
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await page.getByRole('button', { name: 'Select' }).click();
			await page.getByRole('button', { name: /Select Alice/ }).click();
			await expect.element(page.getByText('Move 1 student to:')).toBeInTheDocument();

			// Exit selection mode
			await page.getByRole('button', { name: 'Cancel' }).click();

			await expect.element(page.getByRole('toolbar')).not.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Select' })).toBeInTheDocument();
		});

		it('renders house action buttons in BulkActionBar when students are selected', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: {
					houses: {
						Heracles: [
							{
								_id: 's1',
								englishName: 'Alice',
								chineseName: '',
								studentId: 'S001',
								status: 'Enrolled',
								house: 'Heracles',
								classDisplay: '7-1'
							}
						],
						Wukong: [],
						Ixbalam: [],
						Setna: []
					},
					orphaned: []
				},
				isLoading: false,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await page.getByRole('button', { name: 'Select' }).click();
			await page.getByRole('button', { name: /Select Alice/ }).click();

			// Bulk action bar should appear
			await expect.element(page.getByRole('toolbar')).toBeInTheDocument();

			// Source house (Heracles) should NOT appear as a target
			await expect
				.element(page.getByRole('button', { name: 'Heracles', exact: true }))
				.not.toBeInTheDocument();

			// Other houses should appear as targets
			await expect
				.element(page.getByRole('button', { name: 'Wukong', exact: true }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Ixbalam', exact: true }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Setna', exact: true }))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('button', { name: 'Unassigned', exact: true }))
				.toBeInTheDocument();
		});
	});

	describe('Loading State', () => {
		it('renders loading message when data is loading', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: null,
				isLoading: true,
				isStale: false,
				error: undefined
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await expect.element(page.getByText('Loading houses...')).toBeInTheDocument();
		});
	});

	describe('Error State', () => {
		it('renders error message when query fails', async () => {
			const { useQuery } = await import('convex-svelte');
			vi.mocked(useQuery).mockReturnValue({
				data: null,
				isLoading: false,
				isStale: false,
				error: new Error('Failed to load')
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any);

			render(HousesPage);

			await expect.element(page.getByText('Error loading houses')).toBeInTheDocument();
		});
	});
});
