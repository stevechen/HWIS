import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventForm from '$lib/components/esl/EventForm.svelte';

const base = {
	mode: 'create' as const,
	term: 'S1' as const,
	sibling: null,
	busy: false,
	serverError: null as string | null,
	onsubmit: vi.fn()
};

describe('EventForm', () => {
	it('renders the one form: type, label, target, date, and note', async () => {
		render(EventForm, { ...base, onsubmit: vi.fn() });
		await expect.element(page.getByRole('combobox', { name: 'Event type' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Label' })).toBeInTheDocument();
		await expect.element(page.getByRole('combobox', { name: 'Target' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Date' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Note' })).toBeInTheDocument();
	});

	it('hides range and period fields for single-date types', async () => {
		render(EventForm, { ...base, onsubmit: vi.fn() });
		await expect.element(page.getByRole('textbox', { name: 'End date' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('combobox', { name: 'Starts from period' }))
			.not.toBeInTheDocument();
	});

	it('shows the end-date field only for due-types', async () => {
		render(EventForm, { ...base, onsubmit: vi.fn() });
		await page.getByRole('combobox', { name: 'Event type' }).selectOptions('task_due');
		await expect.element(page.getByRole('textbox', { name: 'End date' })).toBeInTheDocument();
		await page.getByRole('combobox', { name: 'Event type' }).selectOptions('exam');
		await expect.element(page.getByRole('textbox', { name: 'End date' })).not.toBeInTheDocument();
	});

	it('shows 1–8 period bounds only for partial days', async () => {
		render(EventForm, { ...base, onsubmit: vi.fn() });
		await page.getByRole('combobox', { name: 'Event type' }).selectOptions('partial');
		const starts = page.getByRole('combobox', { name: 'Starts from period' });
		const ends = page.getByRole('combobox', { name: 'Ends at period' });
		await expect.element(starts).toBeInTheDocument();
		await expect.element(ends).toBeInTheDocument();
		await starts.selectOptions('3');
		await ends.selectOptions('4');
		await expect.element(starts.getByRole('option', { name: 'P8' })).toBeInTheDocument();
		await expect.element(starts.getByRole('option', { name: 'P9' })).not.toBeInTheDocument();
	});

	it('defaults the target to All', async () => {
		const onsubmit = vi.fn();
		render(EventForm, { ...base, onsubmit });
		await page.getByRole('textbox', { name: 'Label' }).fill('Passport check');
		await page.getByRole('textbox', { name: 'Date' }).fill('2025-10-06');
		await page.getByRole('button', { name: 'Add event' }).click();
		await expect.poll(() => onsubmit.mock.calls.length).toBe(1);
		expect(onsubmit.mock.calls[0]?.[0]).toMatchObject({ target: 'all' });
	});

	it('submits the entered exam row', async () => {
		const onsubmit = vi.fn();
		render(EventForm, { ...base, onsubmit });
		await page.getByRole('combobox', { name: 'Event type' }).selectOptions('exam');
		await page.getByRole('textbox', { name: 'Label' }).fill('Final exam');
		await page.getByRole('combobox', { name: 'Target' }).selectOptions('G9');
		await page.getByRole('textbox', { name: 'Date' }).fill('2026-01-20');
		await page.getByRole('textbox', { name: 'Note' }).fill('Morning session');
		await page.getByRole('button', { name: 'Add event' }).click();
		await expect.poll(() => onsubmit.mock.calls.length).toBe(1);
		expect(onsubmit).toHaveBeenCalledWith({
			type: 'exam',
			label: 'Final exam',
			target: 'G9',
			date: '2026-01-20',
			endDate: undefined,
			note: 'Morning session',
			startPeriod: undefined,
			endPeriod: undefined
		});
	});

	it('warns without refusing when an S1 exam crosses into S2', async () => {
		render(EventForm, {
			...base,
			onsubmit: vi.fn(),
			sibling: { year: '2025-2026', term: 'S2', startDate: '2026-02-09' }
		});
		await page.getByRole('combobox', { name: 'Event type' }).selectOptions('exam');
		await page.getByRole('textbox', { name: 'Date' }).fill('2026-02-10');
		await expect.element(page.getByTestId('event-form.warning')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add event' })).toBeEnabled();
	});

	it('shows the collision refusal from the server', async () => {
		render(EventForm, {
			...base,
			onsubmit: vi.fn(),
			serverError: '2026-01-20 already holds an exam (Final exam).'
		});
		await expect
			.element(page.getByText('2026-01-20 already holds an exam (Final exam).'))
			.toBeInTheDocument();
	});

	it('prefills every field in edit mode', async () => {
		render(EventForm, {
			...base,
			mode: 'edit',
			onsubmit: vi.fn(),
			initial: {
				type: 'quiz',
				label: 'CLIL quiz 2',
				target: 'CLIL',
				date: '2025-11-03',
				endDate: '2025-11-07',
				note: 'Week 9',
				startPeriod: undefined,
				endPeriod: undefined
			}
		});
		await expect.element(page.getByRole('textbox', { name: 'End date' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
	});
});
