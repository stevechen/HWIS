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

export function draggable(node: HTMLElement, options: { data: DragData; label?: string }) {
	node.draggable = false;
	node.style.touchAction = 'none';
	node.style.userSelect = 'none';
	node.style.cursor = 'grab';

	function onDown(e: PointerEvent) {
		e.preventDefault();
		node.setPointerCapture(e.pointerId);
		node.classList.add('is-dragging');
		dragState.currentDrag = options.data;
		showGhost(options.label ?? '', e.clientX, e.clientY);
	}

	function onMove(e: PointerEvent) {
		if (!dragState.currentDrag) return;
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
		if (!dragState.currentDrag) return;

		const zone = findZone(e.clientX, e.clientY);
		if (zone && zone.accept(dragState.currentDrag)) {
			zone.onDrop(dragState.currentDrag);
		}

		node.classList.remove('is-dragging');
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
		clearZoneHighlight();
		hideGhost();
	}

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', onUp);

	return {
		destroy() {
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onUp);
		},
		update(next: { data: DragData; label?: string }) {
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
