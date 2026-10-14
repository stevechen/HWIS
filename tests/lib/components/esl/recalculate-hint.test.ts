import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

import RecalculateHint from '$lib/components/esl/wizard/RecalculateHint.svelte';

describe('wizard RecalculateHint', () => {
	it('names the override and offers the recompute', async () => {
		render(RecalculateHint, { props: { onRecalculate: () => {} } });

		const hint = page.getByTestId('wizard.recalculate');
		await expect.element(hint).toBeInTheDocument();
		await expect.element(hint).toHaveTextContent(/manually set/i);
		await expect.element(page.getByRole('button', { name: 'Recalculate' })).toBeInTheDocument();
	});

	it('asks the owner of the field to recompute it', async () => {
		const onRecalculate = vi.fn();
		await render(RecalculateHint, { props: { onRecalculate } });

		await page.getByRole('button', { name: 'Recalculate' }).click();

		expect(onRecalculate).toHaveBeenCalledTimes(1);
	});

	it('takes the label and test id of the field it belongs to', async () => {
		render(RecalculateHint, {
			props: {
				onRecalculate: () => {},
				label: 'Recompute quiz dates',
				testId: 'wizard.step-4-recalculate'
			}
		});

		await expect
			.element(page.getByTestId('wizard.step-4-recalculate'))
			.toHaveTextContent(/manually set/i);
		await expect
			.element(page.getByRole('button', { name: 'Recompute quiz dates' }))
			.toBeInTheDocument();
	});
});
