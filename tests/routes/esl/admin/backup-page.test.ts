import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue([]);

type MockBackup = {
	_id: string;
	name?: string;
	filename: string;
	department?: 'international' | 'esl';
	creatorId?: string;
	creatorName?: string;
	creatorRole?: 'super' | 'admin' | 'teacher';
	source?: string;
	createdAt: number;
	data: { students?: unknown[] };
};

let mockBackups: MockBackup[] = [];
let mockIsLoading = false;
let mockViewer = {
	viewer: { _id: 'user-esl-admin', role: 'admin', name: 'Eve ESL' },
	isAdmin: true,
	status: 'active'
};

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

vi.mock('$lib/viewer.svelte', () => ({
	useViewer: vi.fn(() => mockViewer)
}));

import { api } from '$convex/_generated/api';
import BackupHarness from './backup.harness.svelte';

function eslBackup(overrides: Partial<MockBackup> = {}): MockBackup {
	return {
		_id: 'backup-esl',
		name: 'ESL Snapshot',
		filename: 'backup-esl.json',
		department: 'esl',
		creatorId: 'user-esl-admin',
		creatorName: 'Eve ESL',
		creatorRole: 'admin',
		source: 'manual',
		createdAt: Date.now(),
		data: { students: [] },
		...overrides
	};
}

describe('ESL admin backup page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutation.mockResolvedValue(undefined);
		mockBackups = [];
		mockIsLoading = false;
		mockViewer = {
			viewer: { _id: 'user-esl-admin', role: 'admin', name: 'Eve ESL' },
			isAdmin: true,
			status: 'active'
		};
	});

	it('renders the ESL backup manager without the HWIS-only file and danger sections', async () => {
		await render(BackupHarness);

		await expect.element(page.getByText('Backup History')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Force Backup Now' }))
			.toBeInTheDocument();
		// File restore and clear-all are HWIS-only until the ESL restore path (#246).
		await expect.element(page.getByText('Restore from File')).not.toBeInTheDocument();
		await expect.element(page.getByText('Danger Zone')).not.toBeInTheDocument();
	});

	it('lists only ESL backups and hides International rows', async () => {
		mockBackups = [
			eslBackup({ _id: 'backup-esl', name: 'ESL Snapshot' }),
			eslBackup({
				_id: 'backup-intl',
				name: 'International Snapshot',
				department: 'international'
			}),
			eslBackup({ _id: 'backup-legacy', name: 'Legacy Snapshot', department: undefined })
		];

		await render(BackupHarness);

		await expect.element(page.getByText('ESL Snapshot')).toBeInTheDocument();
		await expect.element(page.getByText('International Snapshot')).not.toBeInTheDocument();
		// A legacy row with no department reads as International.
		await expect.element(page.getByText('Legacy Snapshot')).not.toBeInTheDocument();
	});

	it('shows an ESL department badge on the backup row', async () => {
		mockBackups = [eslBackup()];

		await render(BackupHarness);

		await expect.element(page.getByText('ESL', { exact: true })).toBeInTheDocument();
	});

	it('creates an ESL backup by passing department: esl', async () => {
		await render(BackupHarness);

		await page.getByRole('button', { name: 'Force Backup Now' }).click();
		await page.getByRole('button', { name: 'Confirm' }).click();

		await vi.waitFor(() =>
			expect(mockMutation).toHaveBeenCalledWith(
				api.backup.createBackup,
				expect.objectContaining({ department: 'esl' })
			)
		);
	});
});
