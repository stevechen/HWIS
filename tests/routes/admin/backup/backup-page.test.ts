import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { sanitizeFilename } from '$lib/utils/backup';
import { api } from '$convex/_generated/api';

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

	it('super admin sees rename and delete buttons for all backups, including system', async () => {
		mockViewer = {
			viewer: { _id: 'user-super-1', role: 'super', name: 'Carol' },
			isAdmin: true,
			status: 'active'
		};
		mockBackups = [
			{
				_id: 'backup-system',
				name: 'System Snapshot',
				filename: 'backup-system.json',
				source: 'system_safety',
				createdAt: Date.now(),
				data: { students: [] }
			},
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

		// Super can rename/delete system backups and other admins' backups
		await expect.element(page.getByText('System: Safety')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /rename/i }).first()).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /delete/i }).first()).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /rename/i }).nth(1)).toBeInTheDocument();
		// Super can also download all backups, including system
		await expect
			.element(page.getByRole('button', { name: /download/i }).first())
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /download/i }).nth(1))
			.toBeInTheDocument();
	});

	it('owner admin sees rename and delete buttons for own backup', async () => {
		mockBackups = [
			{
				_id: 'backup-own',
				name: 'My Backup',
				filename: 'backup-own.json',
				creatorId: 'user-admin-1',
				creatorName: 'Alice',
				creatorRole: 'admin',
				source: 'manual',
				createdAt: Date.now(),
				data: { students: [] }
			}
		];

		render(BackupPage);

		await expect.element(page.getByText('My Backup')).toBeInTheDocument();
		await expect.element(page.getByText('You', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /rename/i })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /delete/i })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /download/i })).toBeInTheDocument();
	});

	it('downloads a backup using a sanitized filename derived from the display name', async () => {
		mockBackups = [
			{
				_id: 'backup-own',
				name: 'Quarterly / Final: Report?',
				filename: 'backup-own.json',
				creatorId: 'user-admin-1',
				creatorName: 'Alice',
				creatorRole: 'admin',
				source: 'manual',
				createdAt: Date.now(),
				data: { students: [] }
			}
		];

		const createdAnchors: HTMLAnchorElement[] = [];
		const originalCreate = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
			const el = originalCreate(tag);
			if (tag === 'a') createdAnchors.push(el as HTMLAnchorElement);
			return el;
		});

		render(BackupPage);

		await page.getByRole('button', { name: /download/i }).click();

		expect(createdAnchors.length).toBeGreaterThan(0);
		expect(createdAnchors[0].download).toBe(
			`${sanitizeFilename('Quarterly / Final: Report?')}.json`
		);
	});

	it('sanitizeFilename replaces unsafe characters with underscores', async () => {
		expect(sanitizeFilename('My/Backup: Name?.json')).toBe('My_Backup__Name_.json');
		expect(sanitizeFilename('plain-name_1.txt')).toBe('plain-name_1.txt');
	});

	it('non-super admin does not see the Migrate Legacy Backups action', async () => {
		render(BackupPage);

		await expect
			.element(page.getByRole('button', { name: 'Migrate Legacy Backups' }))
			.not.toBeInTheDocument();
	});

	it('super admin can open and run the Migrate Legacy Backups action', async () => {
		mockViewer = {
			viewer: { _id: 'user-super-1', role: 'super', name: 'Carol' },
			isAdmin: true,
			status: 'active'
		};
		mockMutation.mockResolvedValue({ message: 'Migrated 0 legacy backup(s)' });

		render(BackupPage);

		const migrateButton = page.getByRole('button', { name: 'Migrate Legacy Backups' });
		await expect.element(migrateButton).toBeInTheDocument();
		await migrateButton.click();

		await expect
			.element(page.getByRole('heading', { name: 'Migrate Legacy Backups' }))
			.toBeVisible();
		await page.getByRole('button', { name: 'Run Migration' }).click();

		expect(mockMutation).toHaveBeenCalledWith(api.backup.migrateLegacyBackups, {});
		await expect.element(page.getByText('Migrated 0 legacy backup(s)')).toBeVisible();
	});
});
