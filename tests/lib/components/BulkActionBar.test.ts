import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BulkActionBar from '$lib/components/BulkActionBar.svelte';

describe('BulkActionBar', () => {
	it('does not render when selectedCount is 0', async () => {
		render(BulkActionBar, {
			selectedCount: 0,
			actions: [],
			onDone: vi.fn()
		});
		await expect.element(page.getByRole('toolbar')).not.toBeInTheDocument();
	});

	it('renders when selectedCount is greater than 0', async () => {
		render(BulkActionBar, {
			selectedCount: 3,
			actions: [],
			onDone: vi.fn()
		});
		await expect.element(page.getByRole('toolbar')).toBeInTheDocument();
	});

	it('shows the correct count with singular text', async () => {
		render(BulkActionBar, {
			selectedCount: 1,
			actions: [{ label: 'Test', action: vi.fn() }],
			onDone: vi.fn()
		});
		await expect.element(page.getByText('Move 1 student to:')).toBeInTheDocument();
	});

	it('shows the correct count with plural text', async () => {
		render(BulkActionBar, {
			selectedCount: 5,
			actions: [{ label: 'Test', action: vi.fn() }],
			onDone: vi.fn()
		});
		await expect.element(page.getByText('Move 5 students to:')).toBeInTheDocument();
	});

	it('renders action buttons', async () => {
		render(BulkActionBar, {
			selectedCount: 2,
			actions: [
				{ label: 'Move to Heracles', action: vi.fn() },
				{ label: 'Move to Wukong', action: vi.fn() }
			],
			onDone: vi.fn()
		});
		await expect
			.element(page.getByRole('button', { name: 'Move to Heracles' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Move to Wukong' })).toBeInTheDocument();
	});

	it('fires onDone when Cancel button is clicked', async () => {
		const onDone = vi.fn();
		render(BulkActionBar, {
			selectedCount: 2,
			actions: [],
			onDone
		});
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(onDone).toHaveBeenCalledOnce();
	});

	it('fires action callback when action button is clicked', async () => {
		const action = vi.fn();
		render(BulkActionBar, {
			selectedCount: 2,
			actions: [{ label: 'Archive', action }],
			onDone: vi.fn()
		});
		await page.getByRole('button', { name: 'Archive' }).click();
		expect(action).toHaveBeenCalledOnce();
	});
});
