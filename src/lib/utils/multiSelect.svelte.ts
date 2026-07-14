import { SvelteSet } from 'svelte/reactivity';

export function createMultiSelectState() {
	let selectionMode = $state(false);
	const selectedIds = new SvelteSet<string>();

	const selectedCount = $derived(selectedIds.size);

	function toggleSelectionMode() {
		selectionMode = !selectionMode;
		if (!selectionMode) {
			selectedIds.clear();
		}
	}

	function toggleSelect(id: string) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
		} else {
			selectedIds.add(id);
		}
	}

	function clearSelection() {
		selectedIds.clear();
	}

	function exitSelectionMode() {
		selectedIds.clear();
		selectionMode = false;
	}

	return {
		get selectionMode() {
			return selectionMode;
		},
		get selectedIds() {
			return selectedIds;
		},
		get selectedCount() {
			return selectedCount;
		},
		toggleSelectionMode,
		toggleSelect,
		clearSelection,
		exitSelectionMode
	};
}

export type MultiSelectState = ReturnType<typeof createMultiSelectState>;
