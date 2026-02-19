import { page } from 'vitest/browser';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const mockAuditLogs = [
	{
		_id: 'log-1',
		timestamp: Date.now(),
		action: 'student_created',
		performerId: 'user-1',
		performerName: 'Admin User',
		studentName: 'Student One',
		studentGrade: 10,
		studentId: 'S1001',
		targetId: 'student-1',
		actionLabel: 'Created',
		details: 'Created by admin',
		category: 'Academic',
		subCategory: 'Homework',
		points: 5
	}
];

vi.mock('convex-svelte', () => ({
	useQuery: vi.fn(() => ({
		data: mockAuditLogs,
		isLoading: false,
		error: null
	}))
}));

import AuditPage from '$src/routes/admin/audit/+page.svelte';

describe('Audit Admin Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.removeItem('audit-table-columns');
		localStorage.removeItem('audit-visible-columns');
	});

	it('renders filter controls and table', async () => {
		render(AuditPage);
		await expect.element(page.getByRole('button', { name: 'Columns control' })).toBeInTheDocument();
		await expect.element(page.getByPlaceholder('Student')).toBeInTheDocument();
		await expect.element(page.getByPlaceholder('Teacher')).toBeInTheDocument();
		await expect.element(page.getByRole('table', { name: 'Audit log table' })).toBeInTheDocument();
	});

	it('renders audit log content', async () => {
		render(AuditPage);
		await expect.element(page.getByText('Student One')).toBeInTheDocument();
		await expect.element(page.getByText('Admin User')).toBeInTheDocument();
		await expect.element(page.getByText('Created')).toBeInTheDocument();
	});

	it('shows empty filtered state and clear filters action', async () => {
		render(AuditPage);
		const studentFilter = page.getByRole('textbox', { name: 'Filter by student name' });
		await studentFilter.fill('does-not-exist');
		await expect.element(page.getByText('No matching audit logs found.')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Clear all filters' })).toBeInTheDocument();
	});
});
