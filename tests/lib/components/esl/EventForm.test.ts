import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventForm from '$lib/components/esl/EventForm.svelte';

const HIDDEN_TYPES = [
	'start_school',
	'quiz',
	'exam',
	'passport_due',
	'recording_due',
	'g9_mock'
] as const;

const REQUIRED_TYPES = ['no_school', 'no_class', 'partial'] as const;

function renderForm() {
	const onsubmit = vi.fn();
	render(EventForm, {
		mode: 'create',
		term: 'S1',
		sibling: null,
		busy: false,
		serverError: null,
		onsubmit
	});
	return { onsubmit };
}

describe('EventForm note visibility (#211)', () => {
	it.each(HIDDEN_TYPES)('hides the note field for banner-only type %s', async (type) => {
		renderForm();
		await page.getByLabelText('Event type').selectOptions(type);
		await expect.element(page.getByLabelText('Note')).not.toBeInTheDocument();
	});

	it.each(REQUIRED_TYPES)('shows the note field as required for %s', async (type) => {
		renderForm();
		await page.getByLabelText('Event type').selectOptions(type);
		const note = page.getByLabelText('Note');
		await expect.element(note).toBeInTheDocument();
		await expect.element(note).toBeRequired();
	});

	it('shows the note field as optional for task', async () => {
		renderForm();
		await page.getByLabelText('Event type').selectOptions('task');
		const note = page.getByLabelText('Note');
		await expect.element(note).toBeInTheDocument();
		await expect.element(note).not.toBeRequired();
	});

	it('omits the note from submit for a banner-only type', async () => {
		const { onsubmit } = renderForm();
		await page.getByLabelText('Event type').selectOptions('task');
		await page.getByLabelText('Note').fill('should be dropped');
		await page.getByLabelText('Event type').selectOptions('exam');
		await page.getByLabelText('Date').fill('2025-10-16');
		await page.getByRole('button', { name: 'Add event' }).click();
		expect(onsubmit).toHaveBeenCalledTimes(1);
		expect(onsubmit.mock.calls[0]?.[0]).toMatchObject({ type: 'exam' });
		expect(onsubmit.mock.calls[0]?.[0]).not.toHaveProperty('note');
	});
});
