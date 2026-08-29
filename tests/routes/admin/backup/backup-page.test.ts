import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockMutation = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue([]);

let mockBackups:
	| Array<{
			_id: string;
			name?: string;
			filename: string;
			creatorId?: string;
			creatorName?: string;
			creatorRole?: 'super' | 'admin' | 'teacher' | 'student';
			source?: string;
			createdAt: number;
			data: { students?: unknown[] };
	  }>
	| undefined = [];
let mockIsLoading = false;
let mockViewer = {
	viewer: { _id: 'user-admin-1', role: 'admin', name: 'Alice' },
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

import BackupPage from '$src/routes/admin/backup/+page.svelte';

describe('Backup Admin Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBackups = [];
		mockIsLoading = false;
		mockViewer = {
			viewer: { _id: 'user-admin-1', role: 'admin', name: 'Alice' },
			isAdmin: true,
			status: 'active'
		};
	});

	it('renders core backup sections and action buttons', async () => {
		render(BackupPage);

		await expect.element(page.getByText('Backup History')).toBeInTheDocument();
		await expect.element(page.getByText('Restore from File')).toBeInTheDocument();
		await expect.element(page.getByText('Danger Zone')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Force Backup Now' }))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Choose Backup File' }))
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Clear All Data' })).toBeInTheDocument();
	});

	it('shows empty state when no backups exist', async () => {
		mockBackups = [];
		render(BackupPage);
		await expect.element(page.getByText('No backups found.')).toBeInTheDocument();
	});

	it('renders backup history rows with custom name and badges', async () => {
		mockBackups = [
			{
				_id: 'backup-1',
				name: 'My Fall Backup',
				filename: 'backup-2026-02-18.json',
				creatorId: 'user-admin-1',
				creatorName: 'Alice',
				creatorRole: 'admin',
				source: 'manual',
				createdAt: Date.now(),
				data: { students: [{}, {}] }
			},
			{
				_id: 'backup-2',
				name: 'Migration 2026',
				filename: 'backup-2026-06-01.json',
				source: 'system_migration',
				createdAt: Date.now(),
				data: { students: [{}] }
			}
		];

		render(BackupPage);

		await expect.element(page.getByText('My Fall Backup')).toBeInTheDocument();
		await expect.element(page.getByText('You', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('System: Migration')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /download/i }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /restore/i }).first())
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /rename/i }).first()).toBeInTheDocument();
	});

	it('renders role-prefixed badges for other admins and super users', async () => {
		mockBackups = [
			{
				_id: 'backup-admin',
				name: 'Bob Backup',
				filename: 'backup-bob.json',
				creatorId: 'user-admin-2',
				creatorName: 'Bob',
				creatorRole: 'admin',
				source: 'manual',
				createdAt: Date.now(),
				data: { students: [] }
			},
			{
				_id: 'backup-super',
				name: 'Carol Backup',
				filename: 'backup-carol.json',
				creatorId: 'user-super-1',
				creatorName: 'Carol',
				creatorRole: 'super',
				source: 'manual',
				createdAt: Date.now(),
				data: { students: [] }
			}
		];

		render(BackupPage);

		await expect.element(page.getByText('Bob Backup')).toBeInTheDocument();
		await expect.element(page.getByText('Admin: Bob', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Carol Backup')).toBeInTheDocument();
		await expect.element(page.getByText('Super: Carol', { exact: true })).toBeInTheDocument();
		// Owner (Alice) is neither, so rename/delete buttons must be hidden for these backups
		await expect.element(page.getByRole('button', { name: /rename/i })).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /download/i })).not.toBeInTheDocument();
	});

	it('hides rename and delete buttons for non-owner admin on other user backups', async () => {
		mockBackups = [
			{
				_id: 'backup-other',
				name: 'Bob Backup',
				filename: 'backup-bob.json',
				creatorId: 'user-admin-2',
				creatorName: 'Bob',
				creatorRole: 'admin',
				source: 'manual',
				createdAt: Date.now(),
				data: { students: [] }
			}
		];

		render(BackupPage);

		await expect.element(page.getByText('Bob Backup')).toBeInTheDocument();
		await expect.element(page.getByText('Admin: Bob', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /restore/i })).toBeInTheDocument();
		// Rename and Delete should NOT be present for non-owner
		await expect.element(page.getByRole('button', { name: /rename/i })).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /download/i })).not.toBeInTheDocument();
	});
});
