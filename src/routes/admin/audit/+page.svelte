<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		Search,
		X,
		GripVertical,
		ChevronsUpDown,
		FileText,
		Columns
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import * as Input from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { browser } from '$app/environment';

	type ColumnKey =
		| 'timestamp'
		| 'studentId'
		| 'studentName'
		| 'studentGrade'
		| 'action'
		| 'performerId'
		| 'category'
		| 'subCategory'
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
		subCategory: string | null;
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
		{
			key: 'subCategory',
			label: 'Subcategory',
			sortable: false,
			defaultVisible: false,
			optional: true
		},
		{ key: 'points', label: 'Points', sortable: false, defaultVisible: false, optional: true },
		{ key: 'details', label: 'Details', sortable: false, defaultVisible: false, optional: true }
	];

	const currentUser = useQuery(api.users.viewer, {});
	const auditLogs = useQuery(api.audit.list, { limit: 100 });
	const auth = useAuth();

	let isTestMode = $state(false);

	$effect(() => {
		if (!browser) return;
		isTestMode = document.cookie.split('; ').some((row) => row.startsWith('hwis_test_auth='));
	});

	let filterName = $state('');
	let filterId = $state('');
	let filterGrade = $state('');
	let filterTeacher = $state('');

	let sortBy = $state<ColumnKey>('timestamp');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	let columns = $state<Column[]>(allColumns.filter((c) => c.defaultVisible));
	let allAvailableColumns = $state<Column[]>(allColumns);
	let draggedColumn = $state<ColumnKey | null>(null);
	let dateRange = $state<{
		start: Date | null;
		end: Date | null;
	}>({ start: null, end: null });
	let isColumnSelectorOpen = $state(false);

	const isStudentIdVisible = $derived(columns.some((col) => col.key === 'studentId'));
	const isStudentGradeVisible = $derived(columns.some((col) => col.key === 'studentGrade'));

	function loadSavedColumns() {
		if (!browser) return;
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
			} catch (e) {
				console.error('Failed to load visible columns:', e);
			}
		}
	}

	$effect(() => {
		loadSavedColumns();
	});

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
			case 'subCategory':
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
			case 'subCategory':
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
			case 'subCategory':
			case 'points':
				return 'hide-mobile';
			case 'action':
			case 'details':
				return 'hide-tablet';
			default:
				return '';
		}
	}

	$effect(() => {
		if (isTestMode) return;
		if (auth.isLoading) return;

		if (!auth.isAuthenticated) {
			void goto('/');
			return;
		}
	});

	$effect(() => {
		if (isTestMode) return;
		// Always check user role, even in test mode with auth cookie
		if (currentUser.isLoading === false) {
			if (currentUser.data?.role !== 'admin' && currentUser.data?.role !== 'super') {
				void goto('/');
			}
		}
	});
</script>

<div class="container mx-auto max-w-[1400px] py-8">
	<header class="mb-8 flex items-start justify-between">
		<div class="flex items-start gap-6">
			<Button variant="outline" onclick={() => void goto('/admin')}>
				<ArrowLeft class="mr-2 h-4 w-4" />
				Back to Admin
			</Button>
			<div>
				<h1 class="text-foreground mb-1 text-2xl font-semibold">Audit Log</h1>
				<p class="text-muted-foreground">View all system activity and changes.</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if !isDefaultOrder()}
				<Button
					variant="outline"
					onclick={resetColumnOrder}
					class="mr-2"
					aria-label="Reset Columns"
				>
					<GripVertical class="mr-2 h-4 w-4" />
					Reset Columns
				</Button>
			{/if}
			<Popover.Root bind:open={isColumnSelectorOpen}>
				<Popover.Trigger>
					<Button variant="outline" aria-label="Columns">
						<Columns class="mr-2 h-4 w-4" />
						Columns
					</Button>
				</Popover.Trigger>
				<Popover.Content class="w-56 p-0" align="end">
					<div class="flex items-center border-b px-3 py-2">
						<span class="text-sm font-medium">Show Columns</span>
					</div>
					<div class="max-h-72 overflow-y-auto py-1">
						{#each allAvailableColumns.filter((c) => c.optional) as column (column.key)}
							<label
								class="hover:bg-accent flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm"
							>
								<input
									type="checkbox"
									checked={isColumnVisible(column.key)}
									onchange={() => toggleColumn(column.key)}
									class="h-4 w-4 rounded border-gray-300"
								/>
								<span>{column.label}</span>
							</label>
						{/each}
					</div>
				</Popover.Content>
			</Popover.Root>
			<ThemeToggle />
		</div>
	</header>

	<div class="mb-6">
		<div class="flex flex-wrap items-center gap-2">
			{#if isStudentIdVisible}
				<div class="relative h-9 items-center md:flex">
					<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
					<Input.Root
						class="w-28 pl-10"
						placeholder="ID"
						bind:value={filterId}
						aria-label="Filter by ID"
					/>
				</div>
			{/if}
			<div class="relative flex h-9 items-center">
				<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<Input.Root
					class="w-48 pl-10"
					placeholder="Student"
					bind:value={filterName}
					aria-label="Filter by student name"
				/>
			</div>
			{#if isStudentGradeVisible}
				<Select.Root
					type="single"
					value={filterGrade}
					onValueChange={(val) => (filterGrade = val)}
				>
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
			<div class="relative flex h-9 items-center">
				<Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<Input.Root
					class="w-48 pl-10"
					placeholder="Teacher"
					bind:value={filterTeacher}
					aria-label="Filter by teacher name"
				/>
			</div>
			{#if hasActiveFilters()}
				<Button variant="outline" onclick={clearFilters} aria-label="Clear all filters">
					<X class="mr-2 h-4 w-4" />
					Clear Filters
				</Button>
			{/if}
		</div>
	</div>

	<div class="bg-card rounded-lg border shadow-sm">
		{#if auditLogs.isLoading}
			<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
				<div class="border-muted border-t-primary h-8 w-8 animate-spin rounded-full border-3"></div>
				<p>Loading audit logs...</p>
			</div>
		{:else if auditLogs.data && auditLogs.data.length > 0}
			{#if getSortedLogs().length === 0}
				<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
					<FileText class="h-8 w-8 opacity-50" />
					<p>No matching audit logs found.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								{#each columns as column (column.key)}
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
											<GripVertical class="text-muted-foreground h-4 w-4 cursor-move" />
											<span>{column.label}</span>
											{#if column.sortable}
												{#if sortBy === column.key}
													<ChevronsUpDown class="h-4 w-4" />
												{:else}
													<ChevronsUpDown class="invisible h-4 w-4" />
												{/if}
											{/if}
										</div>
									</Table.Head>
								{/each}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each getSortedLogs() as log (log._id)}
								<Table.Row class="hover:bg-muted/50">
									{#each columns as column (column.key)}
										<Table.Cell
											class="{column.key === 'studentGrade'
												? 'text-center'
												: ''} {getCellHiddenClass(column.key)}"
										>
											{#if column.key === 'timestamp'}
												{formatTimestamp(log.timestamp)}
											{:else if column.key === 'studentId'}
												{log.studentId || '-'}
											{:else if column.key === 'studentName'}
												{log.studentName || '-'}
											{:else if column.key === 'studentGrade'}
												{log.studentGrade !== null ? `G${log.studentGrade}` : '-'}
											{:else if column.key === 'action'}
												<Badge variant={getActionVariant(log.action)}>{log.actionLabel}</Badge>
											{:else if column.key === 'performerId'}
												{log.performerName || '-'}
											{:else if column.key === 'category'}
												<span class="flex flex-col">
													<span>{log.category || '-'}</span>
													{#if log.subCategory}
														<span class="text-muted-foreground text-xs">{log.subCategory}</span>
													{/if}
												</span>
											{:else if column.key === 'subCategory'}
												{log.subCategory || '-'}
											{:else if column.key === 'points'}
												<span class="font-medium">{log.points ?? '-'}</span>
											{:else if column.key === 'details'}
												<span class="text-muted-foreground block max-w-52 truncate">
													{log.details || '-'}
												</span>
											{/if}
										</Table.Cell>
									{/each}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		{:else}
			<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
				<FileText class="h-8 w-8 opacity-50" />
				<p>No audit logs found.</p>
			</div>
		{/if}
	</div>
</div>
