import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import EvaluationsControls from '$lib/evaluations/components/EvaluationsControls.svelte';

async function clickButton(name: string | RegExp) {
	const button = page.getByRole('button', { name });
	await expect.element(button).toBeVisible();
	await button.click();
}

describe('EvaluationsControls', () => {
	describe('Sort Button', () => {
		it('renders the sort button', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Newest First' })).toBeInTheDocument();
		});

		it('shows Newest First aria-label by default', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Newest First' })).toBeInTheDocument();
		});

		it('shows Oldest First aria-label when sortAscending is true', async () => {
			await render(EvaluationsControls, {
				sortAscending: true,
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Oldest First' })).toBeInTheDocument();
		});

		it('fires onToggleSort when clicked', async () => {
			const onToggleSort = vi.fn();
			await render(EvaluationsControls, {
				onToggleSort
			});
			await clickButton('Newest First');
			expect(onToggleSort).toHaveBeenCalled();
		});
	});

	describe('Unenrolled Toggle', () => {
		it('does not render unenrolled toggle when onToggleShowUnenrolled is not provided', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.not.toBeInTheDocument();
		});

		it('renders unenrolled toggle when onToggleShowUnenrolled is provided', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowUnenrolled: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.toBeInTheDocument();
		});

		it('shows Show unenrolled students aria-label by default', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowUnenrolled: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.toBeInTheDocument();
		});

		it('shows Hide unenrolled students aria-label when showUnenrolled is true', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowUnenrolled: vi.fn(),
				showUnenrolled: true
			});
			await expect
				.element(page.getByRole('button', { name: 'Hide unenrolled students' }))
				.toBeInTheDocument();
		});

		it('fires onToggleShowUnenrolled when clicked', async () => {
			const onToggleShowUnenrolled = vi.fn();
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowUnenrolled
			});
			await clickButton('Show unenrolled students');
			expect(onToggleShowUnenrolled).toHaveBeenCalled();
		});
	});

	describe('Details Toggle', () => {
		it('does not render details toggle when onToggleShowDetails is not provided', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show Details' }))
				.not.toBeInTheDocument();
		});

		it('renders details toggle when onToggleShowDetails is provided', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
		});

		it('shows Show Details aria-label by default', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
		});

		it('shows Hide Details aria-label when showDetails is true', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails: vi.fn(),
				showDetails: true
			});
			await expect.element(page.getByRole('button', { name: 'Hide Details' })).toBeInTheDocument();
		});

		it('fires onToggleShowDetails when clicked', async () => {
			const onToggleShowDetails = vi.fn();
			await render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails
			});
			await clickButton('Show Details');
			expect(onToggleShowDetails).toHaveBeenCalled();
		});
	});

	describe('Title', () => {
		it('does not render title when not provided', async () => {
			await render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('heading')).not.toBeInTheDocument();
		});

		it('renders title when provided', async () => {
			await render(EvaluationsControls, {
				title: 'My Evaluations',
				onToggleSort: vi.fn()
			});
			await expect
				.element(page.getByRole('heading', { name: 'My Evaluations' }))
				.toBeInTheDocument();
		});
	});
});
