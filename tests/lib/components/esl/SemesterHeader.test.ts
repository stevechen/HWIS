import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SemesterHeader from '$lib/components/esl/SemesterHeader.svelte';

describe('SemesterHeader', () => {
	it('names the semester and shows its status chip', async () => {
		render(SemesterHeader, {
			year: '2025-2026',
			term: 'S1',
			startDate: '2025-09-01',
			status: 'current',
			derivedEnd: '2026-01-20',
			endSourceLabel: 'Final exam'
		});
		await expect.element(page.getByRole('heading', { name: '2025-2026 S1' })).toBeInTheDocument();
		await expect.element(page.getByText('Current')).toBeInTheDocument();
	});

	it('shows the derived end with its source exam', async () => {
		render(SemesterHeader, {
			year: '2025-2026',
			term: 'S1',
			startDate: '2025-09-01',
			status: 'current',
			derivedEnd: '2026-01-20',
			endSourceLabel: 'Final exam'
		});
		await expect.element(page.getByText('Ends 2026-01-20, from Final exam')).toBeInTheDocument();
	});

	it('shows the finals-TBD banner while no exams exist', async () => {
		render(SemesterHeader, {
			year: '2025-2026',
			term: 'S1',
			startDate: '2025-09-01',
			status: 'current',
			derivedEnd: null,
			endSourceLabel: null
		});
		await expect.element(page.getByText(/Final exams TBD/)).toBeInTheDocument();
		await expect
			.element(page.getByText('Ends 2026-01-20, from Final exam'))
			.not.toBeInTheDocument();
	});
});
