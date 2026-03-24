import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ScoreTallyBar from '$lib/components/timeline/ScoreTallyBar.svelte';
import type { EvaluationEntry } from '$lib/components/timeline/types.js';

describe('ScoreTallyBar Component', () => {
	describe('Rendering', () => {
		it('renders nothing when evaluations array is empty', async () => {
			const evaluations: EvaluationEntry[] = [];
			render(ScoreTallyBar, { evaluations });
			// Should render nothing when there are no evaluations
			await expect.element(page.getByText('+0')).not.toBeInTheDocument();
		});

		it('renders nothing when all evaluations have zero value', async () => {
			const evaluations: EvaluationEntry[] = [{ _id: '1', value: 0, timestamp: Date.now() }];
			render(ScoreTallyBar, { evaluations });
			await expect.element(page.getByText('+0')).not.toBeInTheDocument();
		});

		it('renders positive score when evaluations have positive values', async () => {
			const evaluations: EvaluationEntry[] = [{ _id: '1', value: 5, timestamp: Date.now() }];
			render(ScoreTallyBar, { evaluations });
			await expect.element(page.getByText('+5')).toBeInTheDocument();
		});

		it('renders negative score when evaluations have negative values', async () => {
			const evaluations: EvaluationEntry[] = [{ _id: '1', value: -3, timestamp: Date.now() }];
			render(ScoreTallyBar, { evaluations });
			await expect.element(page.getByText('-3')).toBeInTheDocument();
		});

		it('renders both positive and negative scores', async () => {
			const evaluations: EvaluationEntry[] = [
				{ _id: '1', value: 5, timestamp: Date.now() },
				{ _id: '2', value: -3, timestamp: Date.now() }
			];
			render(ScoreTallyBar, { evaluations });
			await expect.element(page.getByText('+5')).toBeInTheDocument();
			await expect.element(page.getByText('-3')).toBeInTheDocument();
		});

		it('calculates total correctly for multiple evaluations', async () => {
			const evaluations: EvaluationEntry[] = [
				{ _id: '1', value: 5, timestamp: Date.now() },
				{ _id: '2', value: -3, timestamp: Date.now() },
				{ _id: '3', value: 10, timestamp: Date.now() },
				{ _id: '4', value: -2, timestamp: Date.now() }
			];
			render(ScoreTallyBar, { evaluations });
			// Total: +15 positive, -5 negative
			await expect.element(page.getByText('+15')).toBeInTheDocument();
			await expect.element(page.getByText('-5')).toBeInTheDocument();
		});
	});

	describe('Visual bars', () => {
		it('renders positive bar for positive evaluations', async () => {
			const evaluations: EvaluationEntry[] = [{ _id: '1', value: 5, timestamp: Date.now() }];
			const { container } = render(ScoreTallyBar, { evaluations });
			const positiveBar = container.querySelector(
				'.rounded-r-full.bg-green-500'
			) as HTMLElement | null;
			await expect.element(positiveBar).toBeInTheDocument();
		});

		it('renders negative bar for negative evaluations', async () => {
			const evaluations: EvaluationEntry[] = [{ _id: '1', value: -5, timestamp: Date.now() }];
			const { container } = render(ScoreTallyBar, { evaluations });
			const negativeBar = container.querySelector(
				'.rounded-l-full.bg-red-500'
			) as HTMLElement | null;
			await expect.element(negativeBar).toBeInTheDocument();
		});
	});
});
