import { untrack } from 'svelte';

export type FilterSummaryState = {
	showSummary: boolean;
	filterActive: boolean;
};

export type FilterSummaryAction =
	| { type: 'filterChanged'; active: boolean }
	| { type: 'hideSummary' };

export function filterSummaryReducer(
	state: FilterSummaryState,
	action: FilterSummaryAction
): FilterSummaryState {
	switch (action.type) {
		case 'filterChanged':
			return { showSummary: action.active, filterActive: action.active };
		case 'hideSummary':
			return { ...state, showSummary: false };
		default:
			return state;
	}
}

// Filter summary state with auto-hide timeout (side effects outside reducer)
export function createFilterSummaryState() {
	let state = $state<FilterSummaryState>({ showSummary: false, filterActive: false });
	let summaryTimeout: ReturnType<typeof setTimeout> | null = null;

	function dispatch(action: FilterSummaryAction): void {
		// Untracked: `updateSummary` is called from `$effect`s that react to the
		// filter inputs. Reading `state` there would also make the effect depend
		// on the state it writes, looping forever (effect_update_depth_exceeded).
		state = untrack(() => filterSummaryReducer(state, action));

		if (action.type === 'filterChanged') {
			if (summaryTimeout) {
				clearTimeout(summaryTimeout);
			}
			if (action.active) {
				summaryTimeout = setTimeout(() => {
					dispatch({ type: 'hideSummary' });
				}, 3000);
			} else {
				summaryTimeout = null;
			}
		}
	}

	function updateSummary(hasFilter: boolean): void {
		dispatch({ type: 'filterChanged', active: hasFilter });
	}

	function cleanup(): void {
		if (summaryTimeout) {
			clearTimeout(summaryTimeout);
			summaryTimeout = null;
		}
	}

	return {
		get showSummary() {
			return state.showSummary;
		},
		get filterActive() {
			return state.filterActive;
		},
		updateSummary,
		cleanup,
		dispatch
	};
}

// Evaluation display state (sort, details toggle)
export function createEvaluationDisplayState() {
	let sortAscending = $state(false);
	let showDetails = $state(false);

	return {
		get sortAscending() {
			return sortAscending;
		},
		set sortAscending(value: boolean) {
			sortAscending = value;
		},
		get showDetails() {
			return showDetails;
		},
		set showDetails(value: boolean) {
			showDetails = value;
		}
	};
}
