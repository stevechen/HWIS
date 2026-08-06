import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MoveDialog from '$lib/components/MoveDialog.svelte';

describe('MoveDialog', () => {
	it('does not render when open is false', async () => {
		render(MoveDialog, {
			open: false,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: []
		});
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('renders when open is true', async () => {
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: []
		});
		await expect.element(page.getByRole('dialog')).toBeInTheDocument();
	});

	it('renders the title', async () => {
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: []
		});
		await expect.element(page.getByRole('heading', { name: 'Move Student' })).toBeInTheDocument();
	});

	it('renders the title with an explicit readable color class', async () => {
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: []
		});
		const title = page.getByRole('heading', { name: 'Move Student' });
		await expect.element(title).toBeInTheDocument();
		expect(title.element().classList.contains('text-gray-900')).toBe(true);
	});

	it('renders the subtitle when provided', async () => {
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			subtitle: 'Select a house to move to',
			targets: []
		});
		await expect.element(page.getByText('Select a house to move to')).toBeInTheDocument();
	});

	it('does not render subtitle when not provided', async () => {
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: []
		});
		await expect.element(page.getByText('Select a house to move to')).not.toBeInTheDocument();
	});

	it('renders target buttons', async () => {
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: [
				{ label: 'Heracles', action: vi.fn(), color: 'text-blue-600' },
				{ label: 'Wukong', action: vi.fn(), color: 'text-red-600' }
			]
		});
		await expect.element(page.getByRole('button', { name: 'Heracles' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Wukong' })).toBeInTheDocument();
	});

	it('fires target action when target button is clicked', async () => {
		const action = vi.fn();
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: [{ label: 'Heracles', action }]
		});
		await page.getByRole('button', { name: 'Heracles' }).click();
		expect(action).toHaveBeenCalled();
	});

	it('renders cancel button', async () => {
		render(MoveDialog, {
			open: true,
			onClose: vi.fn(),
			title: 'Move Student',
			targets: []
		});
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('fires onClose when cancel button is clicked', async () => {
		const onClose = vi.fn();
		render(MoveDialog, {
			open: true,
			onClose,
			title: 'Move Student',
			targets: []
		});
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(onClose).toHaveBeenCalled();
	});
});
