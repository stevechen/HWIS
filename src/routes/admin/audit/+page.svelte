<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import {
		Search,
		X,
		GripVertical,
		ChevronsUpDown,
		FileText,
		Columns3 as Columns
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import * as Input from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import { browser } from '$app/environment';

	type ColumnKey =
		| 'timestamp'
		| 'studentId'
		| 'studentName'
		| 'studentGrade'
		| 'action'
		| 'performerId'
		| 'category'
		| 'points'
		| 'details';

	interface Column {
		key: ColumnKey;
		label: string;
		sortable: boolean;
		defaultVisible: boolean;
		optional: boolean;
	}

	interface AuditLog {
		_id: string;
		timestamp: number;
		action: string;
		performerId: string;
		performerName: string;
		studentName: string | null;
		studentGrade: number | null;
		studentId: string | null;
		targetId: string | null;
		actionLabel: string;
		details: string | null;
		category: string | null;
		points: number | null;
	}

	const STORAGE_KEY = 'audit-table-columns';
	const VISIBLE_COLUMNS_KEY = 'audit-visible-columns';

	const allColumns: Column[] = [
		{ key: 'timestamp', label: 'Time', sortable: true, defaultVisible: true, optional: true },
		{ key: 'studentId', label: 'ID', sortable: true, defaultVisible: false, optional: true },
		{ key: 'studentName', label: 'Student', sortable: true, defaultVisible: true, optional: false },
		{ key: 'studentGrade', label: 'Grade', sortable: true, defaultVisible: true, optional: true },
		{ key: 'action', label: 'Type', sortable: true, defaultVisible: true, optional: false },
		{ key: 'performerId', label: 'Teacher', sortable: true, defaultVisible: true, optional: false },
		{ key: 'category', label: 'Category', sortable: false, defaultVisible: true, optional: true },
		{ key: 'points', label: 'Points', sortable: false, defaultVisible: false, optional: true },
		{ key: 'details', label: 'Details', sortable: false, defaultVisible: false, optional: true }
	];

	const auditLogs = useQuery(api.audit.list, () => ({
		limit: 50
	}));

	let filterName = $state('');
	let filterId = $state('');
	let filterGrade = $state('');
	let filterTeacher = $state('');

	let sortBy = $state<ColumnKey>('timestamp');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	// Columns state - initialized with defaults
	// Will be updated from localStorage on client after hydration
	let columns = $state<Column[]>(allColumns.filter((c) => c.defaultVisible));

	// Track if columns have been loaded from localStorage
	let columnsLoaded = $state(false);

	// Derived values for visibility
	// Default to true during SSR to prevent hydration mismatch
	const isStudentIdVisible = $derived(
		!columnsLoaded || columns.some((col) => col.key === 'studentId')
	);
	const isStudentGradeVisible = $derived(
		!columnsLoaded || columns.some((col) => col.key === 'studentGrade')
	);

	// Load saved columns only on client - runs once after hydration
	$effect(() => {
		if (!browser || columnsLoaded) return;
		const saved = localStorage.getItem(VISIBLE_COLUMNS_KEY);
		if (saved) {
			try {
				const savedKeys = JSON.parse(saved) as ColumnKey[];
				const savedCols = savedKeys
					.map((key) => allColumns.find((col) => col.key === key))
					.filter((col): col is Column => col !== undefined);
				if (savedCols.length > 0) {
					columns = savedCols;
				}
			} catch {
				// Failed to load saved columns, use defaults
			}
		}
		columnsLoaded = true;
	});

	let allAvailableColumns = $state<Column[]>(allColumns);
	let draggedColumn = $state<ColumnKey | null>(null);
	let dateRange = $state<{
		start: Date | null;
		end: Date | null;
	}>({ start: null, end: null });
	let isColumnSelectorOpen = $state(false);

	function saveColumnOrder() {
		if (!browser) return;
		const order = columns.map((col) => col.key);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
		localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(order));
	}

	function isColumnVisible(key: ColumnKey): boolean {
		return columns.some((col) => col.key === key);
	}

	function toggleColumn(key: ColumnKey) {
		const col = allColumns.find((c) => c.key === key);
		if (!col || !col.optional) return;

		const isVisible = columns.some((c) => c.key === key);
		if (isVisible) {
			columns = columns.filter((c) => c.key !== key);
		} else {
			const newCol = allColumns.find((c) => c.key === key);
			if (newCol) {
				columns = [...columns, newCol];
			}
		}
		saveColumnOrder();
	}

	function handleDragStart(key: ColumnKey, e: DragEvent) {
		draggedColumn = key;
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', key);
	}

	function handleDragEnd() {
		draggedColumn = null;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragEnter(key: ColumnKey, e: DragEvent) {
		if (draggedColumn && draggedColumn !== key) {
			e.preventDefault();
		}
	}

	function handleDrop(key: ColumnKey, e: DragEvent) {
		e.preventDefault();

		if (!draggedColumn || draggedColumn === key) return;

		const draggedIndex = columns.findIndex((col) => col.key === draggedColumn);
		const dropIndex = columns.findIndex((col) => col.key === key);

		const newColumns = [...columns];
		const [removed] = newColumns.splice(draggedIndex, 1);
		newColumns.splice(dropIndex, 0, removed);

		columns = newColumns;
		draggedColumn = null;
		saveColumnOrder();
	}

	function resetColumnOrder() {
		columns = allColumns.filter((c) => c.defaultVisible);
		saveColumnOrder();
	}

	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		return `${date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
	}

	function getActionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (action.includes('delete') || action.includes('deactivate')) return 'destructive';
		if (action.includes('create') || action.includes('update')) return 'default';
		return 'secondary';
	}

	function clearFilters() {
		filterName = '';
		filterId = '';
		filterGrade = '';
		filterTeacher = '';
		dateRange = { start: null, end: null };
		sortBy = 'timestamp';
		sortDirection = 'desc';
	}

	function handleSort(field: ColumnKey) {
		if (sortBy === field) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = field;
			sortDirection = 'asc';
		}
	}

	function getFilteredLogs() {
		if (!auditLogs.data) return [];

		return auditLogs.data.filter((log: AuditLog) => {
			if (
				filterName &&
				log.studentName &&
				!log.studentName.toLowerCase().includes(filterName.toLowerCase())
			) {
				return false;
			}
			if (
				filterId &&
				log.targetId &&
				!log.targetId.toLowerCase().includes(filterId.toLowerCase())
			) {
				return false;
			}
			if (filterGrade) {
				if (log.studentGrade === null || log.studentGrade.toString() !== filterGrade) {
					return false;
				}
			}
			if (
				filterTeacher &&
				log.performerName &&
				!log.performerName.toLowerCase().includes(filterTeacher.toLowerCase())
			) {
				return false;
			}
			return true;
		});
	}

	function getSortedLogs() {
		const logs = getFilteredLogs();
		return logs.sort((a: AuditLog, b: AuditLog) => {
			let comparison = 0;

			switch (sortBy) {
				case 'timestamp':
					comparison = a.timestamp - b.timestamp;
					break;
				case 'studentId':
					comparison = (a.studentId || '').localeCompare(b.studentId || '');
					break;
				case 'studentName':
					comparison = (a.studentName || '').localeCompare(b.studentName || '');
					break;
				case 'studentGrade':
					comparison = (a.studentGrade || 0) - (b.studentGrade || 0);
					break;
				case 'action':
					comparison = (a.actionLabel || '').localeCompare(b.actionLabel || '');
					break;
				case 'performerId':
					comparison = (a.performerName || '').localeCompare(b.performerName || '');
					break;
				case 'details':
					comparison = (a.details || '').localeCompare(b.details || '');
					break;
			}
			return sortDirection === 'asc' ? comparison : -comparison;
		});
	}

	function hasActiveFilters() {
		return (
			filterName || filterId || filterGrade || filterTeacher || dateRange.start || dateRange.end
		);
	}

	function isDefaultOrder() {
		const defaultVisible = allColumns.filter((c) => c.defaultVisible);
		return columns.length === defaultVisible.length && columns.every((col) => col.defaultVisible);
	}

	function getColumnWidthClass(key: ColumnKey): string {
		switch (key) {
			case 'timestamp':
				return 'w-28';
			case 'studentId':
				return 'w-20';
			case 'studentName':
				return 'flex-1 min-w-45';
			case 'studentGrade':
				return 'w-16';
			case 'action':
				return 'w-24';
			case 'performerId':
				return 'flex-1 min-w-36';
			case 'category':
				return 'w-32';
			case 'points':
				return 'w-16';
			case 'details':
				return 'w-48';
			default:
				return '';
		}
	}

	function getHiddenClass(key: ColumnKey): string {
		switch (key) {
			case 'studentId':
			case 'points':
				return 'hide-mobile';
			case 'action':
			case 'details':
				return 'hide-tablet';
			default:
				return '';
		}
	}

	function getCellHiddenClass(key: ColumnKey): string {
		switch (key) {
			case 'studentId':
			case 'points':
				return 'hide-mobile';
			case 'action':
			case 'details':
				return 'hide-tablet';
			default:
				return '';
		}
	}
</script>

<div class="mx-auto py-8 max-w-[1400px] container">
	<div class="flex justify-end items-center gap-2 mb-6">
		{#if !isDefaultOrder()}
			<Button variant="outline" onclick={resetColumnOrder} class="mr-2" aria-label="Reset Columns">
				<GripVertical class="mr-2 size-4" />
				Reset Columns
			</Button>
		{/if}
		<Popover.Root bind:open={isColumnSelectorOpen}>
			<Popover.Trigger aria-label="Columns control">
				<Button variant="outline">
					<Columns class="mr-2 size-4" />
					Columns
				</Button>
			</Popover.Trigger>
			<Popover.Content class="p-0 w-56" align="end">
				<div class="flex items-center px-3 py-2 border-b">
					<span class="font-medium text-sm">Show Columns</span>
				</div>
				<div class="py-1 max-h-72 overflow-y-auto" role="menu" aria-label="Available columns">
					{#each allAvailableColumns.filter((c) => c.optional) as column (column.key)}
						<label
							class="flex items-center gap-2 hover:bg-accent px-3 py-1.5 text-sm cursor-pointer"
						>
							<input
								type="checkbox"
								checked={isColumnVisible(column.key)}
								onchange={() => toggleColumn(column.key)}
								class="border-gray-300 rounded size-4"
							/>
							<span>{column.label}</span>
						</label>
					{/each}
				</div>
			</Popover.Content>
		</Popover.Root>
	</div>

	<div class="mb-6">
		<div class="flex flex-wrap items-center gap-2">
			{#if isStudentIdVisible}
				<div class="relative md:flex items-center h-9">
					<Search class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
					<Input.Root
						class="pl-10 w-28"
						placeholder="ID"
						bind:value={filterId}
						aria-label="Filter by ID"
					/>
				</div>
			{/if}
			<div class="relative flex items-center h-9">
				<Search class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
				<Input.Root
					class="pl-10 w-48"
					placeholder="Student"
					bind:value={filterName}
					aria-label="Filter by student name"
				/>
			</div>
			{#if isStudentGradeVisible}
				<Select.Root type="single" value={filterGrade} onValueChange={(val) => (filterGrade = val)}>
					<Select.Trigger class="w-24">
						{filterGrade ? `G${filterGrade}` : 'Grade'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="9">G9</Select.Item>
						<Select.Item value="10">G10</Select.Item>
						<Select.Item value="11">G11</Select.Item>
						<Select.Item value="12">G12</Select.Item>
					</Select.Content>
				</Select.Root>
			{/if}
			<div class="relative flex items-center h-9">
				<Search class="top-1/2 left-3 absolute size-4 text-muted-foreground -translate-y-1/2" />
				<Input.Root
					class="pl-10 w-48"
					placeholder="Teacher"
					bind:value={filterTeacher}
					aria-label="Filter by teacher name"
				/>
			</div>
			{#if hasActiveFilters()}
				<Button variant="outline" onclick={clearFilters} aria-label="Clear all filters">
					<X class="mr-2 size-4" />
					Clear Filters
				</Button>
			{/if}
		</div>
	</div>

	<div class="bg-card shadow-sm border rounded-lg">
		{#if auditLogs.isLoading}
			<div class="flex flex-col justify-center items-center gap-4 p-16 text-muted-foreground">
				<div class="border-3 border-muted border-t-primary rounded-full w-8 h-8 animate-spin"></div>
				<p>Loading audit logs...</p>
			</div>
		{:else if auditLogs.data && auditLogs.data.length > 0}
			{#if getSortedLogs().length === 0}
				<div class="flex flex-col justify-center items-center gap-4 p-16 text-muted-foreground">
					<FileText class="opacity-50 w-8 h-8" />
					<p>No matching audit logs found.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<Table.Root aria-label="Audit log table">
						<Table.Header>
							<Table.Row>
								{#each allAvailableColumns as column (column.key)}
									{@const isVisible = columns.some((c) => c.key === column.key)}
									{#if isVisible}
										<Table.Head
											class="hover:bg-muted/50 cursor-pointer select-none {column.key ===
											'studentGrade'
												? 'text-center'
												: ''} {getColumnWidthClass(column.key)} {getHiddenClass(
												column.key
											)} bg-muted/30 border-b-2 font-semibold"
											draggable="true"
											ondragstart={(e) => handleDragStart(column.key, e)}
											ondragend={handleDragEnd}
											ondragover={handleDragOver}
											ondragenter={(e) => handleDragEnter(column.key, e)}
											ondrop={(e) => handleDrop(column.key, e)}
											onclick={() => column.sortable && handleSort(column.key)}
										>
											<div
												class="flex items-center gap-2 {column.key === 'studentGrade'
													? 'justify-center'
													: ''}"
											>
												<GripVertical class="size-4 text-muted-foreground cursor-move" />
												<span>{column.label}</span>
												{#if column.sortable}
													{#if sortBy === column.key}
														<ChevronsUpDown class="size-4" />
													{:else}
														<ChevronsUpDown class="invisible size-4" />
													{/if}
												{/if}
											</div>
										</Table.Head>
									{/if}
								{/each}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each getSortedLogs() as log (log._id)}
								<Table.Row class="hover:bg-muted/50">
									{#each allAvailableColumns as column (column.key)}
										{@const isVisible = columns.some((c) => c.key === column.key)}
										{#if isVisible}
											<Table.Cell
												class="{column.key === 'studentGrade'
													? 'text-center'
													: ''} {getColumnWidthClass(column.key)} {getCellHiddenClass(column.key)}"
											>
												{#if column.key === 'timestamp'}
													{formatTimestamp(log.timestamp)}
												{:else if column.key === 'studentId'}
													{log.studentId || '-'}
												{:else if column.key === 'studentName'}
													<div class="flex items-center gap-2">
														{#if log.studentGrade !== null}
															<Badge variant="outline" class="text-muted-foreground">
																G{log.studentGrade}
															</Badge>
														{/if}
														<span class="font-medium">{log.studentName || '-'}</span>
													</div>
												{:else if column.key === 'studentGrade'}
													{log.studentGrade !== null ? `G${log.studentGrade}` : '-'}
												{:else if column.key === 'action'}
													<Badge variant={getActionVariant(log.action)}>
														{log.actionLabel || log.action}
													</Badge>
												{:else if column.key === 'performerId'}
													<div class="flex items-center gap-2">
														<span>{log.performerName || '-'}</span>
													</div>
												{:else if column.key === 'category'}
													{log.category || '-'}
												{:else if column.key === 'points'}
													{log.points !== null ? log.points : '-'}
												{:else if column.key === 'details'}
													<span class="line-clamp-1" title={log.details || ''}>
														{log.details || '-'}
													</span>
												{:else}
													-
												{/if}
											</Table.Cell>
										{/if}
									{/each}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		{:else}
			<div class="flex flex-col justify-center items-center gap-4 p-16 text-muted-foreground">
				<FileText class="opacity-50 w-8 h-8" />
				<p>No audit logs found.</p>
			</div>
		{/if}
	</div>
</div>
