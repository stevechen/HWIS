import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	createFilterSummaryState,
	createEvaluationDisplayState
} from '$lib/evaluations/stores.svelte';

describe('createFilterSummaryState', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('initializes with showSummary false', () => {
		const state = createFilterSummaryState();
		expect(state.showSummary).toBe(false);
	});

	it('shows summary when filter is active', () => {
		const state = createFilterSummaryState();
		state.updateSummary(true);
		expect(state.showSummary).toBe(true);
	});

	it('hides summary when filter is cleared', () => {
		const state = createFilterSummaryState();
		state.updateSummary(true);
		expect(state.showSummary).toBe(true);
		state.updateSummary(false);
		expect(state.showSummary).toBe(false);
	});

	it('auto-hides after 3 seconds', () => {
		const state = createFilterSummaryState();
		state.updateSummary(true);
		expect(state.showSummary).toBe(true);

		vi.advanceTimersByTime(3000);
		expect(state.showSummary).toBe(false);
	});

	it('resets timer on subsequent updates', () => {
		const state = createFilterSummaryState();
		state.updateSummary(true);
		vi.advanceTimersByTime(2000);
		state.updateSummary(true); // Reset timer

		vi.advanceTimersByTime(2000); // Would have hidden, but timer reset
		expect(state.showSummary).toBe(true);

		vi.advanceTimersByTime(1000); // Now 3s since last update
		expect(state.showSummary).toBe(false);
	});

	it('cleanup clears timeout', () => {
		const state = createFilterSummaryState();
		state.updateSummary(true);
		state.cleanup();
		vi.advanceTimersByTime(5000);
		// Should not throw or cause issues
		expect(state.showSummary).toBe(true); // Still true because timeout was cleared
	});

	it('multiple updates do not create multiple timeouts', () => {
		const state = createFilterSummaryState();
		state.updateSummary(true);
		state.updateSummary(true);
		state.updateSummary(true);

		vi.advanceTimersByTime(3000);
		expect(state.showSummary).toBe(false);
	});
});

describe('createEvaluationDisplayState', () => {
	it('initializes with default values', () => {
		const state = createEvaluationDisplayState();
		expect(state.sortAscending).toBe(false);
		expect(state.showDetails).toBe(false);
	});

	it('allows updating sortAscending', () => {
		const state = createEvaluationDisplayState();
		expect(state.sortAscending).toBe(false);
		state.sortAscending = true;
		expect(state.sortAscending).toBe(true);
	});

	it('allows updating showDetails', () => {
		const state = createEvaluationDisplayState();
		expect(state.showDetails).toBe(false);
		state.showDetails = true;
		expect(state.showDetails).toBe(true);
	});

	it('can toggle sortAscending multiple times', () => {
		const state = createEvaluationDisplayState();
		state.sortAscending = true;
		expect(state.sortAscending).toBe(true);
		state.sortAscending = false;
		expect(state.sortAscending).toBe(false);
		state.sortAscending = true;
		expect(state.sortAscending).toBe(true);
	});

	it('can toggle showDetails multiple times', () => {
		const state = createEvaluationDisplayState();
		state.showDetails = true;
		expect(state.showDetails).toBe(true);
		state.showDetails = false;
		expect(state.showDetails).toBe(false);
	});
});
