export interface DragData {
	id: string;
	[key: string]: unknown;
}

export const dragState = $state<{
	currentDrag: DragData | null;
	activeDropZoneId: string | null;
}>({
	currentDrag: null,
	activeDropZoneId: null
});

let currentOnReject: ((data: DragData, zoneId: string) => void) | null = null;

function createGhost(label: string) {
	const ghost = document.createElement('div');
	ghost.textContent = label;
	Object.assign(ghost.style, {
		position: 'fixed',
		zIndex: '99999',
		pointerEvents: 'none',
		padding: '4px 12px',
		background: 'rgba(59, 130, 246, 0.9)',
		color: 'white',
		borderRadius: '4px',
		fontSize: '13px',
		whiteSpace: 'nowrap',
		boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
	});
	return ghost;
}

function clearDragOver() {
	for (const el of document.querySelectorAll('.drag-over')) {
		el.classList.remove('drag-over');
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
	node.draggable = true;
	node.style.cursor = 'grab';

	if (window.innerWidth < 640) {
		return { destroy() {}, update() {} };
	}

	function onDragStart(e: DragEvent) {
		dragState.currentDrag = options.data;
		dragState.activeDropZoneId = null;
		currentOnReject = options.onReject ?? null;
		e.dataTransfer!.setData('application/json', JSON.stringify(options.data));
		e.dataTransfer!.effectAllowed = 'move';

		if (options.label) {
			const ghost = createGhost(options.label);
			document.body.appendChild(ghost);
			e.dataTransfer!.setDragImage(ghost, 0, 0);
			setTimeout(() => ghost.remove(), 0);
		}
	}

	function onDragEnd() {
		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
		currentOnReject = null;
		clearDragOver();
	}

	node.addEventListener('dragstart', onDragStart);
	node.addEventListener('dragend', onDragEnd);

	return {
		destroy() {
			node.removeEventListener('dragstart', onDragStart);
			node.removeEventListener('dragend', onDragEnd);
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
	function onDragOver(e: DragEvent) {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
	}

	function onDragEnter() {
		const data = dragState.currentDrag;
		if (data && options.accept(data)) {
			node.classList.add('drag-over');
			dragState.activeDropZoneId = options.id;
		}
	}

	function onDragLeave() {
		node.classList.remove('drag-over');
		if (dragState.activeDropZoneId === options.id) {
			dragState.activeDropZoneId = null;
		}
	}

	function onDropFn(e: DragEvent) {
		e.preventDefault();
		node.classList.remove('drag-over');
		dragState.activeDropZoneId = null;

		try {
			const raw = e.dataTransfer!.getData('application/json');
			const data = JSON.parse(raw) as DragData;
			if (options.accept(data)) {
				options.onDrop(data);
			} else if (currentOnReject) {
				currentOnReject(data, options.id);
			}
		} catch {
			// Invalid data
		}

		dragState.currentDrag = null;
		dragState.activeDropZoneId = null;
		currentOnReject = null;
		clearDragOver();
	}

	node.addEventListener('dragover', onDragOver);
	node.addEventListener('dragenter', onDragEnter);
	node.addEventListener('dragleave', onDragLeave);
	node.addEventListener('drop', onDropFn);

	return {
		destroy() {
			node.removeEventListener('dragover', onDragOver);
			node.removeEventListener('dragenter', onDragEnter);
			node.removeEventListener('dragleave', onDragLeave);
			node.removeEventListener('drop', onDropFn);
		},
		update(next: {
			id: string;
			accept: (data: DragData) => boolean;
			onDrop: (data: DragData) => void;
		}) {
			options = next;
		}
	};
}
