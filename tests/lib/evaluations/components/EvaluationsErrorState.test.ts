import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EvaluationsErrorState from '$lib/evaluations/components/EvaluationsErrorState.svelte';

describe('EvaluationsErrorState Component', () => {
	describe('Rendering', () => {
		it('shows error message', async () => {
			render(EvaluationsErrorState, { message: 'Network error occurred' });
			await expect.element(page.getByText('Network error occurred')).toBeInTheDocument();
		});

		it('shows error prefix text', async () => {
			render(EvaluationsErrorState, { message: 'Test error' });
			await expect.element(page.getByText(/Error loading evaluations:/)).toBeInTheDocument();
		});
	});
});
