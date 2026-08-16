import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Id } from '$convex/_generated/dataModel';
import type { RecentBatch } from '$convex/shared/recentActions';
import { WEEK_MS } from '$convex/shared/evaluation_week';

const mockMutation = vi.fn().mockResolvedValue(undefined);
let queryData: unknown = [];
const mockUseQuery: Mock<
	(...args: unknown[]) => { data: unknown; isLoading: boolean; error: null }
> = vi.fn(() => ({ data: queryData, isLoading: false, error: null }));

vi.mock('convex-svelte', () => ({
	useQuery: (...args: unknown[]) => mockUseQuery(...args),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: vi.fn()
	}))
}));

// Import after mocks
import BatchEditDialog from '$lib/evaluations/components/BatchEditDialog.svelte';
import BatchDeleteDialog from '$lib/evaluations/components/BatchDeleteDialog.svelte';
import PanelWithProfile from './panel-with-profile.svelte';

function makeProfile(editAnyEvaluation: boolean) {
	return {
		data: {
			user: { _id: 'teacher-1' },
			capabilities: {
				viewAnyEvaluation: false,
				viewOwnEvaluation: true,
				editOwnEvaluation: true,
				editAnyEvaluation
			}
		},
		isLoading: false,
		error: null
	};
}

const mockCategories = [
	{ _id: 'cat-academic', name: 'Academic' },
	{ _id: 'cat-behavior', name: 'Behavior' }
];

function makeBatch(overrides: Partial<RecentBatch> = {}): RecentBatch {
	const timestamp = Date.now();
	return {
		batchId: 'batch-1',
		createdAt: timestamp,
		evaluations: [
			{
				id: 'eval-1' as Id<'evaluations'>,
				studentId: 'stu-1' as Id<'students'>,
				englishName: 'Alice Chen',
				className: 'Grade 10 1',
				value: 1,
				categoryId: 'cat-academic' as Id<'point_categories'>,
				category: 'Academic',
				details: 'Good work',
				timestamp
			},
			{
				id: 'eval-2' as Id<'evaluations'>,
				studentId: 'stu-2' as Id<'students'>,
				englishName: 'Brian Wang',
				className: 'Grade 10 1',
				value: 1,
				categoryId: 'cat-academic' as Id<'point_categories'>,
				category: 'Academic',
				details: 'Good work',
				timestamp
			}
		],
		...overrides
	};
}

describe('RecentActionsPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryData = [];
	});

	it('renders nothing when there are no batches', async () => {
		render(PanelWithProfile, { props: { profile: makeProfile(false) } });
		await expect
			.element(page.getByRole('button', { name: 'Expand recent actions' }))
			.not.toBeInTheDocument();
	});

	it('renders a folded chip with the actionable count by default', async () => {
		queryData = [makeBatch(), makeBatch({ batchId: 'batch-2' })];
		render(PanelWithProfile, { props: { profile: makeProfile(false) } });

		await expect
			.element(page.getByRole('button', { name: 'Expand recent actions' }))
			.toBeInTheDocument();
		await expect.element(page.getByText('2 actions')).toBeInTheDocument();
	});

	it('expands into the Recent Actions card on click', async () => {
		queryData = [makeBatch()];
		render(PanelWithProfile, { props: { profile: makeProfile(false) } });

		await page.getByRole('button', { name: 'Expand recent actions' }).click();

		await expect.element(page.getByText('Recent Actions')).toBeInTheDocument();
		await expect.element(page.getByText('2 students')).toBeInTheDocument();
	});

	it('shows a mixed chip for a partially-edited batch', async () => {
		const batch = makeBatch();
		batch.evaluations[1] = { ...batch.evaluations[1], value: 2 };
		queryData = [batch];
		render(PanelWithProfile, { props: { profile: makeProfile(false) } });

		await page.getByRole('button', { name: 'Expand recent actions' }).click();

		await expect.element(page.getByText('mixed')).toBeInTheDocument();
		await expect.element(page.getByText('(edited)')).toBeInTheDocument();
	});

	it('hides locked batches for a non-super user', async () => {
		const locked = makeBatch({
			batchId: 'batch-locked',
			createdAt: Date.now() - 3 * WEEK_MS
		});
		const fresh = makeBatch({ batchId: 'batch-fresh' });
		queryData = [locked, fresh];
		render(PanelWithProfile, { props: { profile: makeProfile(false) } });

		await expect.element(page.getByText('1 action')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Expand recent actions' }).click();

		expect(page.getByRole('button', { name: 'Edit batch' }).all().length).toBe(1);
	});

	it('shows locked batches for a super user', async () => {
		const locked = makeBatch({
			batchId: 'batch-locked',
			createdAt: Date.now() - 3 * WEEK_MS
		});
		const fresh = makeBatch({ batchId: 'batch-fresh' });
		queryData = [locked, fresh];
		render(PanelWithProfile, { props: { profile: makeProfile(true) } });

		await expect.element(page.getByText('2 actions')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Expand recent actions' }).click();

		expect(page.getByRole('button', { name: 'Edit batch' }).all().length).toBe(2);
	});

	it('opens the batch edit dialog when a row is clicked', async () => {
		queryData = [makeBatch()];
		render(PanelWithProfile, { props: { profile: makeProfile(false) } });

		await page.getByRole('button', { name: 'Expand recent actions' }).click();
		await page.getByRole('button', { name: 'Edit batch' }).click();

		await expect.element(page.getByRole('dialog', { name: 'Edit Batch' })).toBeInTheDocument();
	});
});

describe('BatchEditDialog', () => {
	const batch = makeBatch();

	beforeEach(() => {
		vi.clearAllMocks();
		queryData = mockCategories;
	});

	it('opens with every student checked', async () => {
		render(BatchEditDialog, { open: true, batch, onClose: vi.fn() });

		await expect.element(page.getByRole('dialog', { name: 'Edit Batch' })).toBeInTheDocument();
		await expect.element(page.getByText('Alice Chen')).toBeInTheDocument();
		await expect.element(page.getByText('Brian Wang')).toBeInTheDocument();
		await expect.element(page.getByText('2 selected')).toBeInTheDocument();
	});

	it('is hidden when open is false', async () => {
		render(BatchEditDialog, { open: false, batch, onClose: vi.fn() });
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('save calls updateMany with all checked ids', async () => {
		render(BatchEditDialog, { open: true, batch, onClose: vi.fn() });

		await page.getByRole('button', { name: 'Save Changes' }).click();

		expect(mockMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				ids: ['eval-1', 'eval-2'],
				value: 1,
				categoryId: 'cat-academic',
				details: 'Good work'
			})
		);
	});

	it('unchecking a student removes them from save and delete', async () => {
		render(BatchEditDialog, { open: true, batch, onClose: vi.fn() });

		await page.getByRole('checkbox', { name: /Alice Chen/ }).click();

		await expect.element(page.getByText('1 selected')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Delete selected (1)' }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: 'Save Changes' }).click();
		expect(mockMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ ids: ['eval-2'] })
		);
	});

	it('delete selected calls removeMany with the checked ids', async () => {
		render(BatchEditDialog, { open: true, batch, onClose: vi.fn() });

		await page.getByRole('checkbox', { name: /Brian Wang/ }).click();
		await page.getByRole('button', { name: 'Delete selected (1)' }).click();

		expect(mockMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ ids: ['eval-1'] })
		);
	});

	it('disables save and delete when nothing is checked', async () => {
		render(BatchEditDialog, { open: true, batch, onClose: vi.fn() });

		await page.getByRole('checkbox', { name: /Alice Chen/ }).click();
		await page.getByRole('checkbox', { name: /Brian Wang/ }).click();

		await expect.element(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Delete selected (0)' })).toBeDisabled();
		expect(mockMutation).not.toHaveBeenCalled();
	});

	it('shows the mixed-batch notice', async () => {
		const mixedBatch = makeBatch();
		mixedBatch.evaluations[1] = { ...mixedBatch.evaluations[1], value: 2 };
		render(BatchEditDialog, { open: true, batch: mixedBatch, onClose: vi.fn() });

		await expect.element(page.getByText(/already partially edited/)).toBeInTheDocument();
	});
});

describe('BatchDeleteDialog', () => {
	const batch = makeBatch();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows the count in the confirmation', async () => {
		render(BatchDeleteDialog, { open: true, batch });
		await expect.element(page.getByText('Delete 2 evaluations?')).toBeInTheDocument();
	});

	it('delete calls removeMany with every id in the batch', async () => {
		render(BatchDeleteDialog, { open: true, batch });

		await page.getByRole('button', { name: 'Delete' }).click();

		expect(mockMutation).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ ids: ['eval-1', 'eval-2'] })
		);
	});
});
