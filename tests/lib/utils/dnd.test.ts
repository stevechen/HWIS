import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draggable, dropZone, dragState } from '$lib/utils/dnd.svelte';

// Ensure desktop viewport for drag-and-drop tests
const DESKTOP_WIDTH = 1024;
Object.defineProperty(window, 'innerWidth', { value: DESKTOP_WIDTH, configurable: true });

function createDragEvent(type: string, extra: Partial<DragEventInit> = {}): DragEvent {
	const dt = new DataTransfer();
	return new DragEvent(type, {
		bubbles: true,
		cancelable: true,
		dataTransfer: dt,
		...extra
	});
}

function setDragData(dt: DataTransfer, data: Record<string, unknown>) {
	dt.setData('application/json', JSON.stringify(data));
}

describe('draggable', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
	});

	function createEl(label = 'Test Student') {
		const el = document.createElement('div');
		el.style.width = '100px';
		el.style.height = '30px';
		document.body.appendChild(el);
		const action = draggable(el, {
			data: { id: 's1', name: label, sourceClassId: 'c1', sourceGrade: 7 },
			label
		});
		return { el, action };
	}

	it('sets draggable and cursor', () => {
		const { el } = createEl();
		expect(el.draggable).toBe(true);
		expect(el.style.cursor).toBe('grab');
	});

	it('sets dragState.currentDrag on dragstart', () => {
		const { el } = createEl('Alice');
		const evt = createDragEvent('dragstart');
		el.dispatchEvent(evt);

		expect(dragState.currentDrag).toEqual({
			id: 's1',
			name: 'Alice',
			sourceClassId: 'c1',
			sourceGrade: 7
		});
	});

	it('writes data to dataTransfer on dragstart', () => {
		const { el } = createEl('Alice');
		const evt = createDragEvent('dragstart');
		el.dispatchEvent(evt);

		const raw = evt.dataTransfer!.getData('application/json');
		const parsed = JSON.parse(raw);
		expect(parsed).toEqual({
			id: 's1',
			name: 'Alice',
			sourceClassId: 'c1',
			sourceGrade: 7
		});
	});

	it('sets dataTransfer properties on dragstart', () => {
		const { el } = createEl();
		const evt = createDragEvent('dragstart');
		el.dispatchEvent(evt);

		expect(dragState.currentDrag).toEqual({
			id: 's1',
			name: 'Test Student',
			sourceClassId: 'c1',
			sourceGrade: 7
		});
		const raw = evt.dataTransfer!.getData('application/json');
		expect(JSON.parse(raw)).toMatchObject({ id: 's1' });
	});

	it('creates a ghost div on dragstart when label is provided', () => {
		const { el } = createEl('Bob Smith');
		const evt = createDragEvent('dragstart');
		el.dispatchEvent(evt);

		const ghostDivs = Array.from(document.querySelectorAll('div')).filter(
			(d) => d.textContent === 'Bob Smith' && d.style.position === 'fixed'
		);
		expect(ghostDivs.length).toBe(1);
	});

	it('clears state on dragend', () => {
		const { el } = createEl('Alice');
		el.dispatchEvent(createDragEvent('dragstart'));
		el.dispatchEvent(createDragEvent('dragend'));

		expect(dragState.currentDrag).toBeNull();
		expect(dragState.activeDropZoneId).toBeNull();
	});

	it('returns early on mobile (window.innerWidth < 640)', () => {
		Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
		const { el } = createEl();
		el.dispatchEvent(createDragEvent('dragstart'));
		expect(dragState.currentDrag).toBeNull();
		Object.defineProperty(window, 'innerWidth', { value: DESKTOP_WIDTH, configurable: true });
	});

	it('destroy removes event listeners and reset draggable', () => {
		const { el, action } = createEl();
		action.destroy();
		el.dispatchEvent(createDragEvent('dragstart'));
		expect(dragState.currentDrag).toBeNull();
	});

	it('update replaces options', () => {
		const { el, action } = createEl('Alice');
		action.update({
			data: { id: 's2', name: 'Bob' },
			label: 'Bob'
		});
		const evt = createDragEvent('dragstart');
		el.dispatchEvent(evt);

		expect(dragState.currentDrag).toEqual({ id: 's2', name: 'Bob' });
	});
});

describe('dropZone', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
	});

	function createZone(id = 'c2') {
		const el = document.createElement('div');
		el.style.width = '200px';
		el.style.height = '100px';
		document.body.appendChild(el);

		const accept = vi.fn((data: unknown) => {
			const d = data as { sourceGrade?: number };
			return d.sourceGrade === 7;
		});
		const onDrop = vi.fn();

		const action = dropZone(el, { id, accept, onDrop });
		return { el, action, accept, onDrop, id };
	}

	it('prevents default on dragover to allow drop', () => {
		const { el } = createZone();
		const evt = createDragEvent('dragover');
		el.dispatchEvent(evt);
		expect(evt.defaultPrevented).toBe(true);
	});

	it('adds drag-over class and sets activeDropZoneId on dragenter when accept returns true', () => {
		const { el } = createZone();
		dragState.currentDrag = { id: 's1', sourceGrade: 7 };

		const evt = createDragEvent('dragenter');
		el.dispatchEvent(evt);

		expect(el.classList.contains('drag-over')).toBe(true);
		expect(dragState.activeDropZoneId).toBe('c2');
	});

	it('does not add drag-over on dragenter when accept returns false', () => {
		const { el } = createZone();
		dragState.currentDrag = { id: 's1', sourceGrade: 10 };

		const evt = createDragEvent('dragenter');
		el.dispatchEvent(evt);

		expect(el.classList.contains('drag-over')).toBe(false);
		expect(dragState.activeDropZoneId).toBeNull();
	});

	it('removes drag-over on dragleave', () => {
		const { el } = createZone();
		dragState.currentDrag = { id: 's1', sourceGrade: 7 };
		dragState.activeDropZoneId = 'c2';

		el.dispatchEvent(createDragEvent('dragenter'));
		expect(el.classList.contains('drag-over')).toBe(true);

		el.dispatchEvent(createDragEvent('dragleave'));
		expect(el.classList.contains('drag-over')).toBe(false);
		expect(dragState.activeDropZoneId).toBeNull();
	});

	it('does not clear activeDropZoneId on dragleave if another zone is active', () => {
		const { el } = createZone('c2');
		dragState.currentDrag = { id: 's1', sourceGrade: 7 };
		dragState.activeDropZoneId = 'c3'; // different zone active

		const evt = createDragEvent('dragleave');
		el.dispatchEvent(evt);

		expect(el.classList.contains('drag-over')).toBe(false);
		expect(dragState.activeDropZoneId).toBe('c3');
	});

	it('calls onDrop with parsed data on drop when accept returns true', () => {
		const { el, accept } = createZone('c2');
		dragState.currentDrag = { id: 's1', sourceGrade: 7 };

		const evt = createDragEvent('drop', { cancelable: true });
		setDragData(evt.dataTransfer!, { id: 's1', sourceGrade: 7 });
		el.dispatchEvent(evt);

		expect(accept).toHaveBeenCalled();
		expect(evt.defaultPrevented).toBe(true);
	});

	it('invokes currentOnReject on drop when accept returns false', () => {
		const { el } = createZone('c2');
		const onReject = vi.fn();
		const { el: sourceEl, action } = (() => {
			const el2 = document.createElement('div');
			document.body.appendChild(el2);
			const a = draggable(el2, {
				data: { id: 's1', name: 'Alice', sourceGrade: 10 },
				onReject
			});
			return { el: el2, action: a };
		})();

		dragState.currentDrag = { id: 's1', sourceGrade: 10 };
		sourceEl.dispatchEvent(createDragEvent('dragstart'));

		const dropEvt = createDragEvent('drop', { cancelable: true });
		setDragData(dropEvt.dataTransfer!, { id: 's1', sourceGrade: 10 });
		el.dispatchEvent(dropEvt);

		expect(onReject).toHaveBeenCalledWith({ id: 's1', sourceGrade: 10 }, 'c2');
		action.destroy();
	});

	it('cleans up state after drop', () => {
		const { el } = createZone('c2');
		dragState.currentDrag = { id: 's1', sourceGrade: 7 };
		dragState.activeDropZoneId = 'c2';

		const evt = createDragEvent('drop', { cancelable: true });
		setDragData(evt.dataTransfer!, { id: 's1', sourceGrade: 7 });
		el.dispatchEvent(evt);

		expect(dragState.currentDrag).toBeNull();
		expect(dragState.activeDropZoneId).toBeNull();
		expect(el.classList.contains('drag-over')).toBe(false);
	});

	it('destroy removes event listeners', () => {
		const { el, action } = createZone('c2');
		action.destroy();

		// dragenter should not trigger class addition
		dragState.currentDrag = { id: 's1', sourceGrade: 7 };
		el.dispatchEvent(createDragEvent('dragenter'));
		expect(el.classList.contains('drag-over')).toBe(false);
	});

	it('update replaces options', () => {
		const { el, action } = createZone('c2');
		const newAccept = vi.fn(() => false);
		const newOnDrop = vi.fn();
		action.update({ id: 'c3', accept: newAccept, onDrop: newOnDrop });

		dragState.currentDrag = { id: 's1', sourceGrade: 7 };
		el.dispatchEvent(createDragEvent('dragenter'));

		// newAccept should be called (returns false, so no highlight)
		expect(newAccept).toHaveBeenCalledWith({ id: 's1', sourceGrade: 7 });
		expect(el.classList.contains('drag-over')).toBe(false);
	});
});

describe('draggable + dropZone integration', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
	});

	it('completes a full drag-and-drop flow with valid accept', () => {
		const source = document.createElement('div');
		source.style.width = '100px';
		source.style.height = '30px';
		document.body.appendChild(source);

		draggable(source, {
			data: { id: 's1', name: 'Alice', sourceClassId: 'c1', sourceGrade: 7 },
			label: 'Alice'
		});

		const zoneEl = document.createElement('div');
		zoneEl.style.width = '200px';
		zoneEl.style.height = '100px';
		document.body.appendChild(zoneEl);

		const onDrop = vi.fn();
		const accept = vi.fn((data: unknown) => {
			const d = data as { sourceGrade?: number };
			return d.sourceGrade === 7;
		});
		dropZone(zoneEl, { id: 'c2', accept, onDrop });

		// Simulate full drag and drop
		const dragEvt = createDragEvent('dragstart');
		source.dispatchEvent(dragEvt);
		setDragData(dragEvt.dataTransfer!, {
			id: 's1',
			name: 'Alice',
			sourceClassId: 'c1',
			sourceGrade: 7
		});

		zoneEl.dispatchEvent(createDragEvent('dragenter'));

		const dropEvt = createDragEvent('drop', { cancelable: true });
		const raw = dragEvt.dataTransfer!.getData('application/json');
		dropEvt.dataTransfer!.setData('application/json', raw);
		zoneEl.dispatchEvent(dropEvt);

		expect(accept).toHaveBeenCalled();
		expect(onDrop).toHaveBeenCalledWith({
			id: 's1',
			name: 'Alice',
			sourceClassId: 'c1',
			sourceGrade: 7
		});
	});
});
