import { page } from 'vite-plus/test/browser';
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import EvaluationsTimeline from '$lib/components/timeline/EvaluationsTimeline.svelte';
import type { EvaluationEntry } from '$lib/components/timeline/types';
import { createMockEvaluation, createMockEvaluationSet } from '../../../fixtures/evaluations';

describe('EvaluationsTimeline Component', () => {
	let mockEvaluations: EvaluationEntry[];

	beforeEach(() => {
		mockEvaluations = createMockEvaluationSet();
	});

	describe('Rendering', () => {
		it('renders all evaluations', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations });
			// Check that evaluation cards are rendered
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});

		it('shows title when provided', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, title: 'Student History' });
			await expect.element(page.getByText('Student History')).toBeInTheDocument();
		});

		it('shows student names when showStudentName is true', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, showStudentName: true });
			await expect.element(page.getByText('Alice Chen')).toBeInTheDocument();
		});

		it('hides student names when showStudentName is false', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, showStudentName: false });
			await expect.element(page.getByText('Alice Chen')).not.toBeInTheDocument();
		});

		it('shows teacher names when showTeacherName is true', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, showTeacherName: true });
			await expect.element(page.getByText('Ms. Johnson')).toBeInTheDocument();
		});
	});

	describe('Card Display', () => {
		it('shows plus sign for positive values', async () => {
			const positiveEval = createMockEvaluation({ value: 5 });
			await render(EvaluationsTimeline, { evaluations: [positiveEval] });
			await expect.element(page.getByText('+5')).toBeInTheDocument();
		});

		it('shows minus sign for negative values', async () => {
			const negativeEval = createMockEvaluation({ value: -3 });
			await render(EvaluationsTimeline, { evaluations: [negativeEval] });
			await expect.element(page.getByText('-3')).toBeInTheDocument();
		});

		it('shows grade-class label and IB badge when available', async () => {
			const entry = createMockEvaluation({ grade: 10, class: '2', isIB: true });
			await render(EvaluationsTimeline, { evaluations: [entry], showStudentName: true });
			await expect.element(page.getByText('G10-2')).toBeInTheDocument();
			await expect.element(page.getByText('IB')).toBeInTheDocument();
		});
	});

	describe('Controls', () => {
		it('shows sort button when showControls is true', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, showControls: true });
			await expect.element(page.getByRole('button', { name: 'Newest First' })).toBeInTheDocument();
		});

		it('hides controls when showControls is false', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, showControls: false });
			await expect
				.element(page.getByRole('button', { name: 'Newest First' }))
				.not.toBeInTheDocument();
		});

		it('shows details toggle button', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, showControls: true });
			await expect.element(page.getByRole('button', { name: 'Show Details' })).toBeInTheDocument();
		});

		it('shows unenrolled toggle when onToggleShowUnenrolled provided', async () => {
			await render(EvaluationsTimeline, {
				evaluations: mockEvaluations,
				showControls: true,
				onToggleShowUnenrolled: vi.fn()
			});
			await expect
				.element(page.getByRole('button', { name: 'Show unenrolled students' }))
				.toBeInTheDocument();
		});
	});

	describe('Filtering', () => {
		it('filters unenrolled students by default', async () => {
			const evalsWithUnenrolled = [
				...mockEvaluations,
				createMockEvaluation({
					_id: 'unenrolled-1',
					status: 'Not Enrolled',
					englishName: 'Unenrolled Student'
				})
			];
			await render(EvaluationsTimeline, {
				evaluations: evalsWithUnenrolled,
				showUnenrolled: false,
				showStudentName: true
			});
			await expect.element(page.getByText('Unenrolled Student')).not.toBeInTheDocument();
		});

		it('shows unenrolled students when showUnenrolled is true', async () => {
			const evalsWithUnenrolled = [
				...mockEvaluations,
				createMockEvaluation({
					_id: 'unenrolled-1',
					status: 'Not Enrolled',
					englishName: 'Unenrolled Student'
				})
			];
			await render(EvaluationsTimeline, {
				evaluations: evalsWithUnenrolled,
				showUnenrolled: true,
				showStudentName: true
			});
			await expect.element(page.getByText('Unenrolled Student')).toBeInTheDocument();
		});
	});

	describe('Interactions', () => {
		it('card click triggers onCardClick callback', async () => {
			const onCardClick = vi.fn();
			await render(EvaluationsTimeline, {
				evaluations: mockEvaluations,
				enableCardClick: true,
				onCardClick
			});
			const card = page.getByRole('button', { name: /Evaluation/ }).first();
			await card.click();
			expect(onCardClick).toHaveBeenCalled();
		});

		it('card renders as link when cardHref provided', async () => {
			await render(EvaluationsTimeline, {
				evaluations: mockEvaluations,
				enableCardClick: true,
				cardHref: (entry: EvaluationEntry) => `/evaluations/student/${entry.studentIdCode}`
			});
			const link = page.getByRole('link').first();
			await expect.element(link).toBeInTheDocument();
		});
	});

	describe('Empty State', () => {
		it('shows empty message when no evaluations', async () => {
			await render(EvaluationsTimeline, { evaluations: [] });
			await expect.element(page.getByText('No evaluations found.')).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('timeline region has aria-label', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations });
			await expect.element(page.getByRole('region', { name: 'Evaluations' })).toBeInTheDocument();
		});

		it('cards are keyboard focusable', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations });
			const card = page.getByRole('button', { name: /Evaluation/ }).first();
			await expect.element(card).toHaveAttribute('tabindex', '0');
		});

		it('cards have descriptive aria-labels', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations, showStudentName: true });
			const card = page.getByRole('button', { name: /Evaluation for/ }).first();
			await expect.element(card).toBeInTheDocument();
		});

		it('timeline divider has separator role', async () => {
			await render(EvaluationsTimeline, { evaluations: mockEvaluations });
			const separator = page.getByRole('separator');
			await expect.element(separator).toBeInTheDocument();
		});
	});
});
