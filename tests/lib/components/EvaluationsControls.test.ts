import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EvaluationsControls from '$lib/evaluations/components/EvaluationsControls.svelte';

async function clickButton(name: string | RegExp) {
	const button = page.getByRole('button', { name });
	await expect.element(button).toBeVisible();
	const element = await button.element();
	await element.click();
}

describe('EvaluationsControls', () => {
	describe('Sort Button', () => {
		it('renders the sort button', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Newest First' })).toBeInTheDocument();
		});

		it('shows Newest First aria-label by default', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Newest First' })).toBeInTheDocument();
		});

		it('shows Oldest First aria-label when sortAscending is true', async () => {
			render(EvaluationsControls, {
				sortAscending: true,
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Oldest First' })).toBeInTheDocument();
		});

		it('fires onToggleSort when clicked', async () => {
			const onToggleSort = vi.fn();
			render(EvaluationsControls, {
				onToggleSort
			});
			await clickButton('Newest First');
			expect(onToggleSort).toHaveBeenCalled();
		});
	});

	describe('Unenrolled Toggle', () => {
		it('does not render unenrolled toggle when onToggleShowUnenrolled is not provided', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.not.toBeInTheDocument();
		});

		it('renders unenrolled toggle when onToggleShowUnenrolled is provided', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowUnenrolled: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.toBeInTheDocument();
		});

		it('shows Show unenrolled students aria-label by default', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowUnenrolled: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.toBeInTheDocument();
		});

		it('shows Hide unenrolled students aria-label when showUnenrolled is true', async () => {
			render(EvaluationsControls, {
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
			render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowUnenrolled
			});
			await clickButton('Show unenrolled students');
			expect(onToggleShowUnenrolled).toHaveBeenCalled();
		});
	});

	describe('Details Toggle', () => {
		it('does not render details toggle when onToggleShowDetails is not provided', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show Details' }))
				.not.toBeInTheDocument();
		});

		it('renders details toggle when onToggleShowDetails is provided', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
		});

		it('shows Show Details aria-label by default', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails: vi.fn()
			});
			await expect.element(page.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
		});

		it('shows Hide Details aria-label when showDetails is true', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails: vi.fn(),
				showDetails: true
			});
			await expect.element(page.getByRole('button', { name: 'Hide Details' })).toBeInTheDocument();
		});

		it('fires onToggleShowDetails when clicked', async () => {
			const onToggleShowDetails = vi.fn();
			render(EvaluationsControls, {
				onToggleSort: vi.fn(),
				onToggleShowDetails
			});
			await clickButton('Show Details');
			expect(onToggleShowDetails).toHaveBeenCalled();
		});
	});

	describe('Title', () => {
		it('does not render title when not provided', async () => {
			render(EvaluationsControls, {
				onToggleSort: vi.fn()
			});
			await expect.element(page.getByRole('heading')).not.toBeInTheDocument();
		});

		it('renders title when provided', async () => {
			render(EvaluationsControls, {
				title: 'My Evaluations',
				onToggleSort: vi.fn()
			});
			await expect
				.element(page.getByRole('heading', { name: 'My Evaluations' }))
				.toBeInTheDocument();
		});
	});
});
