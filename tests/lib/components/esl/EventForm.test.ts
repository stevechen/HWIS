import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EventForm from '$lib/components/esl/EventForm.svelte';
import { ESL_EVENT_TYPES } from '$convex/shared/esl';

const HIDDEN_TYPES = ['start_school', 'reminder', 'exam', 'g9_mock'] as const;

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

describe('EventForm note visibility (#211, #216)', () => {
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

	it('shows the note field as optional for task-kind reminders', async () => {
		renderForm();
		await page.getByLabelText('Event type').selectOptions('reminder');
		await page.getByLabelText('Reminder kind').selectOptions('task');
		const note = page.getByLabelText('Note');
		await expect.element(note).toBeInTheDocument();
		await expect.element(note).not.toBeRequired();
	});

	it('omits the note from submit for a banner-only type', async () => {
		const { onsubmit } = renderForm();
		await page.getByLabelText('Event type').selectOptions('reminder');
		await page.getByLabelText('Reminder kind').selectOptions('task');
		await page.getByLabelText('Note').fill('should be dropped');
		await page.getByLabelText('Event type').selectOptions('exam');
		await page.getByLabelText('Date').fill('2025-10-16');
		await page.getByRole('button', { name: 'Add event' }).click();
		expect(onsubmit).toHaveBeenCalledTimes(1);
		expect(onsubmit.mock.calls[0]?.[0]).toMatchObject({ type: 'exam' });
		expect(onsubmit.mock.calls[0]?.[0]).not.toHaveProperty('note');
	});
});

describe('EventForm target gating (#212, #216)', () => {
	it('offers every canonical event type in the dropdown', async () => {
		renderForm();
		const select = page.getByLabelText('Event type');
		for (const type of ESL_EVENT_TYPES) {
			await select.selectOptions(type);
			await expect.element(select).toHaveValue(type);
		}
	});

	it('locks the target to CLIL for quiz-kind reminders and snaps it on kind switch', async () => {
		const { onsubmit } = renderForm();
		await page.getByLabelText('Event type').selectOptions('reminder');
		await page.getByLabelText('Reminder kind').selectOptions('task');
		await page.getByLabelText('Target').selectOptions('G7');
		await page.getByLabelText('Reminder kind').selectOptions('quiz');
		const target = page.getByLabelText('Target');
		await expect.element(target).toBeDisabled();
		await expect.element(target).toHaveValue('CLIL');
		await page.getByLabelText('Date', { exact: true }).fill('2025-09-02');
		await page.getByRole('button', { name: 'Add event' }).click();
		expect(onsubmit.mock.calls[0]?.[0]).toMatchObject({
			type: 'reminder',
			reminderKind: 'quiz',
			target: 'CLIL'
		});
	});

	it('locks exams and no-school days to All; no-class is open', async () => {
		renderForm();
		for (const type of ['exam', 'no_school'] as const) {
			await page.getByLabelText('Event type').selectOptions(type);
			const target = page.getByLabelText('Target');
			await expect.element(target).toBeDisabled();
			await expect.element(target).toHaveValue('All');
		}
		// no-class is now open (Graduation defaults to G9, others to All)
		await page.getByLabelText('Event type').selectOptions('no_class');
		const target = page.getByLabelText('Target');
		await expect.element(target).not.toBeDisabled();
		// For open target types, the target shows as a select dropdown with 'All' as default
		await expect.element(target).toHaveValue('all');
	});

	it('leaves Start, Partial, and task-kind reminders on the full dropdown', async () => {
		renderForm();
		for (const type of ['start_school', 'partial'] as const) {
			await page.getByLabelText('Event type').selectOptions(type);
			const target = page.getByLabelText('Target');
			await expect.element(target).not.toBeDisabled();
			await target.selectOptions('H1');
			await expect.element(target).toHaveValue('H1');
		}
		await page.getByLabelText('Event type').selectOptions('reminder');
		await page.getByLabelText('Reminder kind').selectOptions('task');
		const target = page.getByLabelText('Target');
		await expect.element(target).not.toBeDisabled();
		await target.selectOptions('H1');
		await expect.element(target).toHaveValue('H1');
	});

	it('shows the Start title prefilled and read-only', async () => {
		renderForm();
		await page.getByLabelText('Event type').selectOptions('start_school');
		const title = page.getByLabelText('Title');
		await expect.element(title).toHaveValue('Start at P3');
		await expect.element(title).toBeDisabled();
	});

	it('names the teaching-day row count on the exam start date', async () => {
		renderForm();
		await page.getByLabelText('Event type').selectOptions('exam');
		await expect.element(page.getByText(/saves 2 teaching-day rows/)).toBeInTheDocument();
		await page.getByLabelText('Title').selectOptions('Final Exam');
		await expect.element(page.getByText(/saves 3 teaching-day rows/)).toBeInTheDocument();
	});
});
