// Filter summary state with auto-hide timeout
export function createFilterSummaryState() {
	let showSummary = $state(false);
	// Use regular variable (not $state) for timeout handle to avoid reactive tracking
	let summaryTimeout: ReturnType<typeof setTimeout> | null = null;

	function updateSummary(hasFilter: boolean): void {
		if (hasFilter) {
			showSummary = true;
			if (summaryTimeout) clearTimeout(summaryTimeout);
			summaryTimeout = setTimeout(() => {
				showSummary = false;
			}, 3000);
		} else {
			showSummary = false;
			if (summaryTimeout) {
				clearTimeout(summaryTimeout);
				summaryTimeout = null;
			}
		}
	}

	function cleanup(): void {
		if (summaryTimeout) {
			clearTimeout(summaryTimeout);
		}
	}

	return {
		get showSummary() {
			return showSummary;
		},
		updateSummary,
		cleanup
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
