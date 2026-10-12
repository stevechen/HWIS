import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SeedForm from '$lib/components/esl/SeedForm.svelte';

describe('SeedForm final-date default (#209)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function seedProps(overrides: Record<string, unknown> = {}) {
		return {
			term: 'S1' as const,
			busy: false,
			error: null,
			report: null,
			onseed: vi.fn(),
			...overrides
		};
	}

	it('leaves the final input empty when no default is given', async () => {
		render(SeedForm, seedProps());
		await expect.element(page.getByTestId('seed-form-final')).toHaveValue('');
	});

	it('prefills the final input from the suggested end-date default', async () => {
		render(SeedForm, seedProps({ finalDefault: '2026-02-02' }));
		await expect.element(page.getByTestId('seed-form-final')).toHaveValue('2026-02-02');
	});

	it('keeps an admin override and seeds it', async () => {
		const onseed = vi.fn();
		render(SeedForm, seedProps({ finalDefault: '2026-02-02', onseed }));
		await page.getByTestId('seed-form-final').fill('2026-01-20');
		(page.getByRole('button', { name: 'Seed drafts' }).element() as HTMLButtonElement).click();
		expect(onseed).toHaveBeenCalledOnce();
		expect(onseed.mock.calls[0]?.[0]).toMatchObject({ examStarts: { final: '2026-01-20' } });
	});

	it('shows the hint when one is given', async () => {
		render(
			SeedForm,
			seedProps({ finalHint: 'Suggested 2026-02-02 — 14 days before the CNY break.' })
		);
		await expect
			.element(page.getByTestId('seed-form.final-hint'))
			.toHaveTextContent(/14 days before/);
	});

	it('hides the hint when none is given', async () => {
		render(SeedForm, seedProps());
		await expect.element(page.getByTestId('seed-form.final-hint')).not.toBeInTheDocument();
	});
});
