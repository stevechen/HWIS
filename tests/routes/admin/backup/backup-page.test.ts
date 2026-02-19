import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue([]);

let mockBackups:
	| Array<{
			_id: string;
			filename: string;
			createdAt: number;
			data: { students?: unknown[] };
	  }>
	| undefined = [];
let mockIsLoading = false;

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockBackups,
		isLoading: mockIsLoading,
		error: null
	})),
	useConvexClient: vi.fn(() => ({
		mutation: mockMutation,
		query: mockQuery
	}))
}));

import BackupPage from '$src/routes/admin/backup/+page.svelte';

describe('Backup Admin Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBackups = [];
		mockIsLoading = false;
	});

	it('renders core backup sections and action buttons', async () => {
		render(BackupPage);

		await expect.element(page.getByText('Backup History')).toBeInTheDocument();
		await expect.element(page.getByText('Danger Zone')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Force Backup Now' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Clear All Data' })).toBeInTheDocument();
	});

	it('shows empty state when no backups exist', async () => {
		mockBackups = [];
		render(BackupPage);
		await expect.element(page.getByText('No backups found.')).toBeInTheDocument();
	});

	it('renders backup history rows with download and restore actions', async () => {
		mockBackups = [
			{
				_id: 'backup-1',
				filename: 'backup-2026-02-18.json',
				createdAt: Date.now(),
				data: { students: [{}, {}] }
			}
		];

		render(BackupPage);

		await expect.element(page.getByText('backup-2026-02-18.json')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /download/i })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /restore/i })).toBeInTheDocument();
	});
});
