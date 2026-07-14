import { describe, it, expect, beforeEach } from 'vitest';
import { createMultiSelectState } from '$lib/utils/multiSelect.svelte';

describe('createMultiSelectState', () => {
	let multiSelect: ReturnType<typeof createMultiSelectState>;

	beforeEach(() => {
		multiSelect = createMultiSelectState();
	});

	it('starts with selection mode off and no selections', () => {
		expect(multiSelect.selectionMode).toBe(false);
		expect(multiSelect.selectedCount).toBe(0);
		expect(multiSelect.selectedIds.size).toBe(0);
	});

	it('toggles selection mode on and off', () => {
		multiSelect.toggleSelectionMode();
		expect(multiSelect.selectionMode).toBe(true);

		multiSelect.toggleSelectionMode();
		expect(multiSelect.selectionMode).toBe(false);
	});

	it('clears selections when exiting selection mode', () => {
		multiSelect.toggleSelectionMode();
		multiSelect.toggleSelect('s1');
		multiSelect.toggleSelect('s2');
		expect(multiSelect.selectedCount).toBe(2);

		multiSelect.toggleSelectionMode();
		expect(multiSelect.selectionMode).toBe(false);
		expect(multiSelect.selectedCount).toBe(0);
	});

	it('toggleSelect adds and removes a single id', () => {
		multiSelect.toggleSelectionMode();

		multiSelect.toggleSelect('s1');
		expect(multiSelect.selectedIds.has('s1')).toBe(true);
		expect(multiSelect.selectedCount).toBe(1);

		multiSelect.toggleSelect('s1');
		expect(multiSelect.selectedIds.has('s1')).toBe(false);
		expect(multiSelect.selectedCount).toBe(0);
	});

	it('toggleSelect handles multiple ids independently', () => {
		multiSelect.toggleSelectionMode();

		multiSelect.toggleSelect('s1');
		multiSelect.toggleSelect('s2');
		multiSelect.toggleSelect('s3');
		expect(multiSelect.selectedCount).toBe(3);

		multiSelect.toggleSelect('s2');
		expect(multiSelect.selectedCount).toBe(2);
		expect(multiSelect.selectedIds.has('s1')).toBe(true);
		expect(multiSelect.selectedIds.has('s2')).toBe(false);
		expect(multiSelect.selectedIds.has('s3')).toBe(true);
	});

	it('clearSelection removes all ids but stays in selection mode', () => {
		multiSelect.toggleSelectionMode();
		multiSelect.toggleSelect('s1');
		multiSelect.toggleSelect('s2');

		multiSelect.clearSelection();

		expect(multiSelect.selectedCount).toBe(0);
		expect(multiSelect.selectionMode).toBe(true);
	});

	it('exitSelectionMode clears all and exits selection mode', () => {
		multiSelect.toggleSelectionMode();
		multiSelect.toggleSelect('s1');
		multiSelect.toggleSelect('s2');

		multiSelect.exitSelectionMode();

		expect(multiSelect.selectedCount).toBe(0);
		expect(multiSelect.selectionMode).toBe(false);
	});

	it('selectedCount is derived correctly from selectedIds', () => {
		multiSelect.toggleSelectionMode();

		expect(multiSelect.selectedCount).toBe(0);

		multiSelect.toggleSelect('a');
		expect(multiSelect.selectedCount).toBe(1);

		multiSelect.toggleSelect('b');
		expect(multiSelect.selectedCount).toBe(2);

		multiSelect.toggleSelect('a');
		expect(multiSelect.selectedCount).toBe(1);
	});
});
