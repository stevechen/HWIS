import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draggable, dropZone, dragState } from '$lib/utils/dnd.svelte';

function createDraggableElement(label = 'Test Student') {
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

function createDropZoneElement(id = 'c2') {
	const el = document.createElement('div');
	el.style.width = '200px';
	el.style.height = '100px';
	document.body.appendChild(el);

	const accept = vi.fn((data: unknown) => {
		const d = data as { sourceGrade?: number };
		return d.sourceGrade === 7;
	});
	const onDrop = vi.fn();

	const action = dropZone(el, {
		id,
		accept,
		onDrop
	});

	return { el, action, accept, onDrop, id };
}

function triggerPointerEvent(
	target: HTMLElement,
	type: string,
	clientX: number,
	clientY: number,
	pointerId = 1
) {
	const event = new PointerEvent(type, {
		clientX,
		clientY,
		pointerId,
		bubbles: true,
		cancelable: true
	});
	target.dispatchEvent(event);
	return event;
}

// Skip mobile-like environments where draggable is disabled
const isDesktop = () => window.innerWidth >= 768;

describe('draggable - ghost prevention on hover', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
	});

	it('should NOT create ghost element on pointer move without prior pointer down', () => {
		if (!isDesktop()) return;

		const { el } = createDraggableElement('Alice');

		// Move pointer over element without pressing down
		triggerPointerEvent(el, 'pointermove', 200, 150);

		// Ghost should not exist
		const ghost = document.body.querySelector('div:last-child');
		expect(ghost?.textContent).not.toBe('Alice');
		expect(dragState.currentDrag).toBeNull();
	});

	it('should NOT create ghost on pointer down without moving past threshold', () => {
		if (!isDesktop()) return;

		const { el } = createDraggableElement('Alice');

		triggerPointerEvent(el, 'pointerdown', 100, 100);
		triggerPointerEvent(el, 'pointermove', 102, 101); // Only 2px moved

		const ghost = document.body.querySelector('div:last-child');
		expect(ghost?.textContent).not.toBe('Alice');
		expect(dragState.currentDrag).toBeNull();
	});

	it('should create ghost on pointer down then move past threshold', () => {
		if (!isDesktop()) return;

		const { el } = createDraggableElement('Alice');

		triggerPointerEvent(el, 'pointerdown', 100, 100);
		triggerPointerEvent(el, 'pointermove', 120, 100); // 20px moved > 5px threshold

		const ghost = document.body.querySelector('div:last-child');
		expect(ghost?.textContent).toBe('Alice');
		expect(dragState.currentDrag).not.toBeNull();
	});

	it('should hide ghost on pointer up after drag', () => {
		if (!isDesktop()) return;

		const { el } = createDraggableElement('Alice');

		triggerPointerEvent(el, 'pointerdown', 100, 100);
		triggerPointerEvent(el, 'pointermove', 120, 100);
		triggerPointerEvent(el, 'pointerup', 120, 100);

		const ghost = document.body.querySelector('div:last-child');
		expect(ghost?.textContent).not.toBe('Alice');
	});

	it('should create ghost with the correct label text', () => {
		if (!isDesktop()) return;

		const { el } = createDraggableElement('Bob Smith');

		triggerPointerEvent(el, 'pointerdown', 100, 100);
		triggerPointerEvent(el, 'pointermove', 120, 100);

		const ghost = document.body.querySelector('div:last-child');
		expect(ghost?.textContent).toBe('Bob Smith');
	});
});

describe('dropZone - integrates with draggable', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
	});

	it('should accept valid drop and call onDrop', () => {
		if (!isDesktop()) return;

		const draggableEl = document.createElement('div');
		draggableEl.style.width = '100px';
		draggableEl.style.height = '30px';
		document.body.appendChild(draggableEl);

		draggable(draggableEl, {
			data: { id: 's1', name: 'Alice', sourceClassId: 'c1', sourceGrade: 7 },
			label: 'Alice'
		});

		const { el: zoneEl, onDrop } = createDropZoneElement('c2');

		// Start drag on draggable element
		triggerPointerEvent(draggableEl, 'pointerdown', 100, 100);
		triggerPointerEvent(draggableEl, 'pointermove', 120, 100);

		// Drop on zone element
		const zoneRect = zoneEl.getBoundingClientRect();
		triggerPointerEvent(zoneEl, 'pointerup', zoneRect.left + 10, zoneRect.top + 10);

		// Wait a frame for async cleanup
		expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', name: 'Alice' }));
	});
});
