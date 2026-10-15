import { page } from 'vitest/browser';
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SemesterStatusChip from '$lib/components/esl/SemesterStatusChip.svelte';

describe('SemesterStatusChip', () => {
	it('reads Upcoming for a semester before its start', async () => {
		render(SemesterStatusChip, { status: 'upcoming' });
		await expect.element(page.getByText('Upcoming')).toBeInTheDocument();
	});

	it('reads Current for a live semester', async () => {
		render(SemesterStatusChip, { status: 'current' });
		await expect.element(page.getByText('Current')).toBeInTheDocument();
	});

	it('reads Closed for a finished semester', async () => {
		render(SemesterStatusChip, { status: 'closed' });
		await expect.element(page.getByText('Closed')).toBeInTheDocument();
	});
});
