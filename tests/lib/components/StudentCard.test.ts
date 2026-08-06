import { page } from 'vitest/browser';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StudentCard from '$lib/components/StudentCard.svelte';
import type { MultiSelectState } from '$lib/utils/multiSelect.svelte';
import type { Id } from '$convex/_generated/dataModel';

const mockStudent = {
	_id: 'test-student-id' as Id<'students'>,
	englishName: 'Test Student',
	chineseName: '測試學生',
	studentId: 'STU001',
	status: 'Enrolled' as const,
	classDisplay: '10-1',
	house: 'Heracles' as const
};

const mockNotEnrolledStudent = {
	...mockStudent,
	status: 'Not Enrolled' as const
};

const mockMultiSelect = {
	selectionMode: false,
	selectedIds: new Set(),
	toggleSelect: vi.fn()
} as unknown as MultiSelectState;

describe('StudentCard', () => {
	describe('Rendering', () => {
		it('renders the student name', async () => {
			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'Heracles',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});
			await expect.element(page.getByText('Test Student')).toBeInTheDocument();
		});

		it('does not show Not Enrolled badge for enrolled students', async () => {
			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'Heracles',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});
			await expect.element(page.getByText('Not Enrolled')).not.toBeInTheDocument();
		});

		it('shows Not Enrolled badge for not enrolled students', async () => {
			render(StudentCard, {
				student: mockNotEnrolledStudent,
				sourceHouse: 'Heracles',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});
			await expect.element(page.getByText('Not Enrolled')).toBeInTheDocument();
		});
	});

	describe('Dark Theme Readability', () => {
		it('renders the student name with an explicit readable color class', async () => {
			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'Heracles',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});

			const name = page.getByText('Test Student');
			await expect.element(name).toBeInTheDocument();
			expect(name.element().classList.contains('text-gray-900')).toBe(true);
		});

		it('renders the Not Enrolled badge with a readable muted color class', async () => {
			render(StudentCard, {
				student: mockNotEnrolledStudent,
				sourceHouse: 'Heracles',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});

			const badge = page.getByText('Not Enrolled');
			await expect.element(badge).toBeInTheDocument();
			expect(badge.element().classList.contains('text-gray-500')).toBe(true);
		});
	});

	describe('Selection Mode', () => {
		it('shows checkbox when in selection mode', async () => {
			const multiSelect = {
				selectionMode: true,
				selectedIds: new Set(),
				toggleSelect: vi.fn()
			} as unknown as MultiSelectState;

			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'Heracles',
				multiSelect,
				onOpenDialog: vi.fn()
			});
			await expect.element(page.getByRole('checkbox')).toBeInTheDocument();
		});

		it('hides checkbox when not in selection mode', async () => {
			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'Heracles',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});
			await expect.element(page.getByRole('checkbox')).not.toBeInTheDocument();
		});

		it('shows move label when not in selection mode', async () => {
			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'Heracles',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});
			await expect
				.element(page.getByLabelText('Move Test Student to another house'))
				.toBeInTheDocument();
		});

		it('shows select label when in selection mode', async () => {
			const multiSelect = {
				selectionMode: true,
				selectedIds: new Set(),
				toggleSelect: vi.fn()
			} as unknown as MultiSelectState;

			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'Heracles',
				multiSelect,
				onOpenDialog: vi.fn()
			});
			await expect.element(page.getByLabelText('Select Test Student')).toBeInTheDocument();
		});
	});

	describe('Orphaned Student', () => {
		it('shows move-to-a-house label for orphaned students', async () => {
			render(StudentCard, {
				student: mockStudent,
				sourceHouse: 'orphaned',
				multiSelect: mockMultiSelect,
				onOpenDialog: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Move Test Student to a house' }))
				.toBeInTheDocument();
		});
	});
});
