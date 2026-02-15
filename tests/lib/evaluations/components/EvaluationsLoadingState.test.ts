import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EvaluationsLoadingState from '$lib/evaluations/components/EvaluationsLoadingState.svelte';

describe('EvaluationsLoadingState Component', () => {
	describe('Rendering', () => {
		it('shows default loading message', async () => {
			render(EvaluationsLoadingState);
			await expect.element(page.getByText('Loading evaluations...')).toBeInTheDocument();
		});

		it('shows custom message when provided', async () => {
			render(EvaluationsLoadingState, { message: 'Loading history...' });
			await expect.element(page.getByText('Loading history...')).toBeInTheDocument();
		});
	});
});
