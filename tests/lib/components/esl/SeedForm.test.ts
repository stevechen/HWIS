import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SeedForm from '$lib/components/esl/SeedForm.svelte';

describe('SeedForm', () => {
	it('asks for exam starts and the S1 lunar date', async () => {
		render(SeedForm, { term: 'S1', busy: false, error: null, report: null, onseed: vi.fn() });
		await expect.element(page.getByRole('textbox', { name: 'Exam 1 starts' })).toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Exam 2 starts' })).toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Final exam starts' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Moon Festival date' }))
			.toBeInTheDocument();
	});

	it('asks for the S2 anchors instead: ceremony, spring break, dragon boat', async () => {
		render(SeedForm, { term: 'S2', busy: false, error: null, report: null, onseed: vi.fn() });
		await expect
			.element(page.getByRole('textbox', { name: 'Graduation ceremony date' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Spring break starts' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Dragon Boat Festival date' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('textbox', { name: 'Moon Festival date' }))
			.not.toBeInTheDocument();
	});

	it('maps S1 dates to the seed payload', async () => {
		const onseed = vi.fn();
		render(SeedForm, { term: 'S1', busy: false, error: null, report: null, onseed });
		await page.getByRole('textbox', { name: 'Exam 1 starts' }).fill('2025-11-24');
		await page.getByRole('textbox', { name: 'Final exam starts' }).fill('2026-01-19');
		await page.getByRole('textbox', { name: 'Moon Festival date' }).fill('2025-10-06');
		await page.getByRole('button', { name: 'Seed drafts' }).click();
		await expect.poll(() => onseed.mock.calls.length).toBe(1);
		expect(onseed).toHaveBeenCalledWith({
			examStarts: { exam1: '2025-11-24', final: '2026-01-19' },
			moonFestivalDate: '2025-10-06'
		});
	});

	it('shows the refusal and the seed report', async () => {
		render(SeedForm, {
			term: 'S1',
			busy: false,
			error: 'This semester already holds events.',
			report: {
				createdCount: 12,
				makeup: [{ forDate: '2025-10-06', makeupDate: '2025-10-03', label: 'Moon Festival' }],
				makeupSkipped: [],
				unresolvedLunar: []
			},
			onseed: vi.fn()
		});
		await expect.element(page.getByText('This semester already holds events.')).toBeInTheDocument();
		await expect.element(page.getByText(/Seeded 12 draft rows/)).toBeInTheDocument();
		await expect.element(page.getByText(/Makeup for Moon Festival/)).toBeInTheDocument();
	});
});
