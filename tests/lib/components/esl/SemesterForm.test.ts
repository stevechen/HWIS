import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SemesterForm from '$lib/components/esl/SemesterForm.svelte';

describe('SemesterForm', () => {
	it('renders year, term, and start-date fields with a create button', async () => {
		render(SemesterForm, { busy: false, error: null, onsubmit: vi.fn() });
		await expect.element(page.getByRole('textbox', { name: 'School year' })).toBeInTheDocument();
		await expect.element(page.getByRole('combobox', { name: 'Term' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Start date' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Create semester' })).toBeInTheDocument();
	});

	it('submits the entered year, term, and start date', async () => {
		const onsubmit = vi.fn();
		render(SemesterForm, { busy: false, error: null, onsubmit });
		await page.getByRole('textbox', { name: 'School year' }).fill('2025-2026');
		await page.getByRole('combobox', { name: 'Term' }).selectOptions('S2');
		await page.getByRole('textbox', { name: 'Start date' }).fill('2026-02-09');
		await page.getByRole('button', { name: 'Create semester' }).click();
		await expect.poll(() => onsubmit.mock.calls.length).toBe(1);
		expect(onsubmit).toHaveBeenCalledWith({
			year: '2025-2026',
			term: 'S2',
			startDate: '2026-02-09'
		});
	});

	it('shows the refusal message when the term already exists', async () => {
		render(SemesterForm, {
			busy: false,
			error: '2025-2026 S1 already exists.',
			onsubmit: vi.fn()
		});
		await expect.element(page.getByText('2025-2026 S1 already exists.')).toBeInTheDocument();
	});

	it('disables the button while the save is in flight', async () => {
		render(SemesterForm, { busy: true, error: null, onsubmit: vi.fn() });
		await expect.element(page.getByRole('button', { name: 'Create semester' })).toBeDisabled();
	});
});
