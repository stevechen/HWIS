import { SvelteMap } from 'svelte/reactivity';

export interface DragData {
	id: string;
	[key: string]: unknown;
}

interface DropZoneEntry {
	id: string;
	element: HTMLElement;
	accept: (data: DragData) => boolean;
	onDrop: (data: DragData) => void;
}

export const dragState = $state<{
	currentDrag: DragData | null;
	activeDropZoneId: string | null;
}>({
	currentDrag: null,
	activeDropZoneId: null
});

const zones = new SvelteMap<string, DropZoneEntry>();
let lastHoveredId: string | null = null;

function style(el: HTMLElement, styles: Record<string, string>) {
	for (const [key, val] of Object.entries(styles)) {
		el.style.setProperty(key, val);
	}
}

let ghost: HTMLElement | null = null;

function showGhost(text: string, x: number, y: number) {
	ghost = document.createElement('div');
	ghost.textContent = text;
	style(ghost, {
		position: 'fixed',
		zIndex: '99999',
		pointerEvents: 'none',
		padding: '4px 12px',
		background: 'rgba(59, 130, 246, 0.9)',
		color: 'white',
		borderRadius: '4px',
		fontSize: '13px',
		whiteSpace: 'nowrap',
		boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
		transform: 'translate(-50%, -50%)'
	});
	moveGhost(x, y);
	document.body.appendChild(ghost);
}

function moveGhost(x: number, y: number) {
	if (ghost) {
		ghost.style.left = `${x}px`;
		ghost.style.top = `${y}px`;
	}
}

function hideGhost() {
	if (ghost?.parentNode) ghost.parentNode.removeChild(ghost);
	ghost = null;
}

function findZone(x: number, y: number): DropZoneEntry | null {
	const els = document.elementsFromPoint(x, y);
	for (const el of els) {
		const id = (el as HTMLElement).dataset.dropZoneId;
		if (id && zones.has(id)) {
			return zones.get(id)!;
		}
	}
	return null;
}

function clearZoneHighlight() {
	if (lastHoveredId) {
		zones.get(lastHoveredId)?.element.classList.remove('drag-over');
		lastHoveredId = null;
	}
}

export function draggable(
	node: HTMLElement,
	options: {
		data: DragData;
		label?: string;
		onReject?: (data: DragData, zoneId: string) => void;
	}
) {
	node.draggable = false;
	node.style.cursor = 'grab';

	if (window.innerWidth < 768) {
		return { destroy() {}, update() {} };
	}

	const DRAG_THRESHOLD = 5;
	let capturedPointerId: number | null = null;
	let dragActivated = false;
	let startX = 0;
	let startY = 0;
	let pendingDragEnd = false;
	let isPointerDown = false;

	function releaseCapture() {
		if (capturedPointerId != null) {
			try {
				node.releasePointerCapture(capturedPointerId);
			} catch {
				// Ignore if capture wasn't active
			}
			capturedPointerId = null;
		}
	}

	function preventTextSelection() {
		document.body.style.userSelect = 'none';
		document.body.style.webkitUserSelect = 'none';
	}

	function restoreTextSelection() {
		document.body.style.userSelect = '';
		document.body.style.webkitUserSelect = '';
	}

	function resetTouchStyles() {
		node.style.touchAction = '';
		node.style.userSelect = '';
		restoreTextSelection();
	}

	function activateDrag(pointerId: number, x: number, y: number) {
		dragActivated = true;
		node.style.touchAction = 'none';
		node.style.userSelect = 'none';
		preventTextSelection();
		capturedPointerId = pointerId;
		node.setPointerCapture(pointerId);
		node.classList.add('is-dragging');
		dragState.currentDrag = options.data;
		showGhost(options.label ?? '', x, y);
		addWindowListeners();
	}

	function cleanup() {
		dragActivated = false;
		isPointerDown = false;
		node.classList.remove('is-dragging');
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
		clearZoneHighlight();
		hideGhost();
		releaseCapture();
		removeWindowListeners();
		resetTouchStyles();
	}

	function onWindowUp(e: PointerEvent) {
		if (!dragActivated || capturedPointerId == null) return;
		if (e.pointerId !== capturedPointerId) return;

		pendingDragEnd = true;

		const zone = findZone(e.clientX, e.clientY);
		if (zone) {
			if (zone.accept(dragState.currentDrag)) {
				zone.onDrop(dragState.currentDrag);
			} else if (options.onReject) {
				options.onReject(dragState.currentDrag, zone.id);
			}
		}

		cleanup();
	}

	function onWindowCancel(e: PointerEvent) {
		if (!dragActivated || capturedPointerId == null) return;
		if (e.pointerId !== capturedPointerId) return;
		cleanup();
	}

	function addWindowListeners() {
		window.addEventListener('pointerup', onWindowUp);
		window.addEventListener('pointercancel', onWindowCancel);
	}

	function removeWindowListeners() {
		window.removeEventListener('pointerup', onWindowUp);
		window.removeEventListener('pointercancel', onWindowCancel);
	}

	function onDown(e: PointerEvent) {
		// Don't prevent default — allow scroll to start naturally
		// Clean up any stale state from a previous interrupted drag
		if (dragState.currentDrag || dragActivated) {
			cleanup();
		}
		isPointerDown = true;
		pendingDragEnd = false;
		startX = e.clientX;
		startY = e.clientY;
		dragActivated = false;
	}

	function onMove(e: PointerEvent) {
		if (!isPointerDown) return;

		if (!dragActivated) {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist < DRAG_THRESHOLD) return;

			e.preventDefault();
			activateDrag(e.pointerId, e.clientX, e.clientY);
			return;
		}

		e.preventDefault();
		moveGhost(e.clientX, e.clientY);

		const zone = findZone(e.clientX, e.clientY);
		const zoneId = zone?.id ?? null;

		if (zoneId !== lastHoveredId) {
			clearZoneHighlight();
			if (zone && zone.accept(dragState.currentDrag)) {
				zone.element.classList.add('drag-over');
				lastHoveredId = zoneId;
			}
		}

		dragState.activeDropZoneId = zoneId;
	}

	function onUp(e: PointerEvent) {
		if (!dragActivated) {
			isPointerDown = false;
			// Was a tap/scroll, not a drag — nothing to clean up
			return;
		}

		pendingDragEnd = true;

		const zone = findZone(e.clientX, e.clientY);
		if (zone) {
			if (zone.accept(dragState.currentDrag)) {
				zone.onDrop(dragState.currentDrag);
			} else if (options.onReject) {
				options.onReject(dragState.currentDrag, zone.id);
			}
		}

		cleanup();
	}

	function onCancel() {
		if (!dragActivated) return;
		cleanup();
	}

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', onUp);
	node.addEventListener('pointercancel', onCancel);

	const onClick = (e: MouseEvent) => {
		if (pendingDragEnd) {
			e.stopPropagation();
			e.preventDefault();
			pendingDragEnd = false;
		}
	};
	node.addEventListener('click', onClick, true);

	return {
		destroy() {
			removeWindowListeners();
			releaseCapture();
			resetTouchStyles();
			node.removeEventListener('click', onClick, true);
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onUp);
			node.removeEventListener('pointercancel', onCancel);
		},
		update(next: {
			data: DragData;
			label?: string;
			onReject?: (data: DragData, zoneId: string) => void;
		}) {
			options = next;
		}
	};
}

export function dropZone(
	node: HTMLElement,
	options: {
		id: string;
		accept: (data: DragData) => boolean;
		onDrop: (data: DragData) => void;
	}
) {
	if (window.innerWidth < 768) {
		return { destroy() {}, update() {} };
	}

	node.dataset.dropZoneId = options.id;
	zones.set(options.id, {
		id: options.id,
		element: node,
		accept: options.accept,
		onDrop: options.onDrop
	});

	return {
		destroy() {
			zones.delete(options.id);
			node.classList.remove('drag-over');
		},
		update(next: {
			id: string;
			accept: (data: DragData) => boolean;
			onDrop: (data: DragData) => void;
		}) {
			zones.delete(options.id);
			options = next;
			node.dataset.dropZoneId = options.id;
			zones.set(options.id, {
				id: options.id,
				element: node,
				accept: options.accept,
				onDrop: options.onDrop
			});
		}
	};
}
