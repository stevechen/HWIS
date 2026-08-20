<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Download, X, Search, ArrowUp, ArrowDown } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';

	let dialogOpen = $state(false);
	let selectedReport = $state<{
		weekNumber: number;
		fridayDate: number;
		formattedDate: string;
		studentCount: number;
	} | null>(null);

	let filterId = $state('');
	let filterName = $state('');
	let filterGrade = $state('');
	let sortColumn = $state<'id' | 'name' | 'grade'>('name');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	const weeklyLookbackMs = 52 * 7 * 24 * 60 * 60 * 1000;
	const sinceTimestamp = Date.now() - weeklyLookbackMs;

	let reportsQuery = useQuery(api.evaluations.getWeeklyReportsList, () => ({
		sinceTimestamp
	}));

	const detailData = useQuery(api.evaluations.getWeeklyReportDetail, () =>
		!selectedReport ? 'skip' : { fridayDate: selectedReport.fridayDate }
	);

	let reports = $derived(reportsQuery.data || []);

	let allStudents = $derived(detailData?.data ?? []);

	let availableGrades = $derived(
		Array.from(new Set(allStudents.map((s) => (s as { grade: number }).grade))).sort(
			(a, b) => (a as number) - (b as number)
		)
	);

	let filteredStudents = $derived.by(() => {
		let result: typeof allStudents = allStudents;

		if (filterId) {
			result = result.filter((s) =>
				(s as { studentId: string }).studentId.toLowerCase().includes(filterId.toLowerCase())
			);
		}
		if (filterName) {
			const nameParts = filterName
				.split(',')
				.map((n) => n.trim().toLowerCase())
				.filter(Boolean);
			if (nameParts.length > 0) {
				result = result.filter((s) => {
					const student = s as { englishName: string; chineseName: string };
					const englishLower = student.englishName.toLowerCase();
					const chineseLower = student.chineseName;
					return nameParts.some(
						(part) => englishLower.includes(part) || chineseLower.includes(part)
					);
				});
			}
		}
		if (filterGrade) {
			const gradeNum = parseInt(filterGrade, 10);
			if (!isNaN(gradeNum)) {
				result = result.filter((s) => (s as { grade: number }).grade === gradeNum);
			}
		}

		result = [...result].sort((a, b) => {
			const studentA = a as { studentId: string; englishName: string; grade: number };
			const studentB = b as { studentId: string; englishName: string; grade: number };
			let comparison = 0;
			if (sortColumn === 'id') {
				comparison = studentA.studentId.localeCompare(studentB.studentId);
			} else if (sortColumn === 'name') {
				comparison = studentA.englishName.localeCompare(studentB.englishName);
			} else if (sortColumn === 'grade') {
				comparison = studentA.grade - studentB.grade;
			}
			return sortDirection === 'asc' ? comparison : -comparison;
		});

		return result;
	});

	let categoryColumns = $derived(
		Array.from(
			new Set(
				allStudents.flatMap((s: { pointsByCategory: Record<string, number> }) =>
					Object.keys(s.pointsByCategory)
				)
			)
		).sort()
	);

	function openReport(report: typeof selectedReport) {
		if (report) {
			selectedReport = report;
			filterId = '';
			filterName = '';
			filterGrade = '';
			sortColumn = 'name';
			sortDirection = 'asc';
			dialogOpen = true;
		}
	}

	$effect(() => {
		if (!dialogOpen) {
			selectedReport = null;
		}
	});

	function closeDetail() {
		dialogOpen = false;
	}

	function toggleSort(column: typeof sortColumn) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function exportToExcel() {
		const students = detailData?.data ?? [];
		if (!students.length) return;

		const headers = ['Student ID', 'English Name', 'Chinese Name', 'Grade', 'Total Points'];

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Set is used for non-reactive CSV generation
		const categoryHeaders = new Set<string>();
		students.forEach((s) => {
			const student = s as { pointsByCategory: Record<string, number> };
			Object.keys(student.pointsByCategory).forEach((cat) => categoryHeaders.add(cat));
		});
		const sortedCategories = Array.from(categoryHeaders).sort();

		const csvHeaders = [...headers, ...sortedCategories];
		const csvRows = students.map((s) => {
			const student = s as {
				studentId: string;
				englishName: string;
				chineseName: string;
				grade: number;
				totalPoints: number;
				pointsByCategory: Record<string, number>;
			};
			const row = [
				student.studentId,
				student.englishName,
				student.chineseName,
				student.grade.toString(),
				student.totalPoints.toString()
			];
			sortedCategories.forEach((cat: string) => {
				const points = student.pointsByCategory[cat] || 0;
				row.push(points.toString());
			});
			return row.join(',');
		});

		const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);
		link.setAttribute('href', url);
		link.setAttribute(
			'download',
			`weekly-report-${selectedReport?.weekNumber ?? 'demo'}-${selectedReport?.formattedDate ?? 'demo'}.csv`
		);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
</script>

<div class="bg-background min-h-screen">
	<main
		class="mx-auto px-4 py-6 sm:px-6 lg:px-8"
		aria-label="Weekly Reports"
		data-testid="weekly-reports.root"
	>
		{#if reportsQuery.isLoading}
			<div
				class="flex items-center justify-center py-12"
				role="status"
				aria-live="polite"
				data-testid="weekly-reports.loading"
			>
				<p class="text-muted-foreground">Loading reports...</p>
			</div>
		{:else if reportsQuery.error}
			<div
				class="flex items-center justify-center py-12"
				role="alert"
				data-testid="weekly-reports.error"
			>
				<p class="text-red-500">
					Error loading reports: {import.meta.env.DEV
						? reportsQuery.error.message
						: 'An error occurred'}
				</p>
			</div>
		{:else if reports.length === 0}
			<div
				class="flex items-center justify-center py-12"
				role="status"
				data-testid="weekly-reports.empty"
			>
				<p class="text-muted-foreground">No weekly reports available yet.</p>
			</div>
		{:else}
			<div
				class="flex justify-center"
				role="region"
				aria-label="Weekly reports list"
				data-testid="weekly-reports.list"
			>
				<div class="inline-block rounded-md border" data-testid="weekly-reports.table-container">
					<Table.Root data-testid="weekly-reports.table">
						<Table.Header>
							<Table.Row class="bg-muted/50">
								<Table.Head class="font-semibold">Week</Table.Head>
								<Table.Head class="font-semibold">Date Range</Table.Head>
								<Table.Head class="text-right font-semibold">Students</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each reports as report (report.fridayDate.toString())}
								<Table.Row
									class="cursor-pointer"
									onclick={() => openReport(report)}
									tabindex={0}
									data-testid={`weekly-reports.row.${report.fridayDate}`}
								>
									<Table.Cell class="text-center font-medium">{report.weekNumber}</Table.Cell>
									<Table.Cell>{report.formattedDate}</Table.Cell>
									<Table.Cell class="text-right">{report.studentCount}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			</div>
		{/if}
	</main>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="bg-black/50" data-testid="weekly-reports.dialog.backdrop" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 max-h-[85vh] w-[calc(100vw-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-lg border-0 p-0 shadow-xl sm:w-[calc(100vw-2rem)]"
			data-testid="weekly-reports.dialog"
			showCloseButton={false}
		>
			{#if selectedReport}
				<div
					class="flex max-h-[85vh] w-full max-w-5xl flex-col"
					data-testid="weekly-reports.dialog.content"
				>
					<header
						class="bg-muted/50 flex shrink-0 items-center justify-between border-b px-4 py-3"
						data-testid="weekly-reports.dialog.header"
					>
						<h2
							class="flex items-center gap-2 text-lg font-semibold"
							data-testid="weekly-reports.dialog.title"
						>
							<span>Week {selectedReport.weekNumber} Report</span>
							<span class="text-muted-foreground">|</span>
							<span class="font-normal">{selectedReport.formattedDate}</span>
							<span class="text-muted-foreground">|</span>
							<span class="font-normal">{selectedReport.studentCount} students</span>
						</h2>
						<button
							onclick={closeDetail}
							class="hover:bg-muted text-muted-foreground hover:text-foreground ml-auto rounded p-1"
							aria-label="Close"
							data-testid="weekly-reports.dialog.close-x"
						>
							<X class="h-5 w-5" />
						</button>
					</header>

					<div
						class="bg-muted/30 shrink-0 border-b px-4 py-2"
						role="toolbar"
						aria-label="Filter options"
						data-testid="weekly-reports.dialog.filter-toolbar"
					>
						<div class="flex w-full items-center gap-3">
							<div
								class="relative hidden w-36 shrink-0 2xl:block"
								data-testid="weekly-reports.dialog.filter-id-wrapper"
							>
								<Search
									class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2"
								/>
								<input
									type="text"
									placeholder="Filter ID..."
									bind:value={filterId}
									class="focus:ring-ring bg-background h-8 w-full rounded-md border pr-2 pl-8 text-sm focus:ring-1 focus:outline-none"
									data-testid="weekly-reports.dialog.filter-id"
								/>
							</div>
							<NativeSelect.Root
								bind:value={filterGrade}
								aria-label="Filter by grade"
								data-testid="weekly-reports.dialog.filter-grade"
							>
								<NativeSelect.Option value="">All Grades</NativeSelect.Option>
								{#each availableGrades as grade (grade)}
									<NativeSelect.Option value={String(grade)}>Grade {grade}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
							<div
								class="relative min-w-0 flex-1"
								data-testid="weekly-reports.dialog.filter-name-wrapper"
							>
								<Search
									class="text-muted-foreground absolute top-1/2 left-2 size-4 -translate-y-1/2"
								/>
								<input
									type="text"
									placeholder="Filter name (comma separated)..."
									bind:value={filterName}
									class="focus:ring-ring bg-background h-8 w-full rounded-md border pr-2 pl-8 text-sm focus:ring-1 focus:outline-none"
									data-testid="weekly-reports.dialog.filter-name"
								/>
							</div>
						</div>
					</div>

					<div
						class="flex-1 overflow-auto"
						role="region"
						aria-label="Student details table"
						data-testid="weekly-reports.dialog.student-table-region"
					>
						{#if detailData?.isLoading}
							<div
								class="flex items-center justify-center py-8"
								role="status"
								aria-live="polite"
								data-testid="weekly-reports.dialog.loading"
							>
								<p class="text-muted-foreground">Loading details...</p>
							</div>
						{:else if detailData?.error}
							<div
								class="flex items-center justify-center py-8"
								role="alert"
								data-testid="weekly-reports.dialog.error"
							>
								<p class="text-red-500">Error loading details</p>
							</div>
						{:else if filteredStudents.length === 0}
							<div
								class="text-muted-foreground py-8 text-center"
								role="status"
								data-testid="weekly-reports.dialog.empty"
							>
								No students match the filters.
							</div>
						{:else}
							<div
								class="overflow-hidden rounded-md border"
								data-testid="weekly-reports.dialog.student-table-wrapper"
							>
								<div class="max-h-[calc(85vh-240px)] overflow-auto">
									<Table.Root
										class="w-full table-fixed"
										data-testid="weekly-reports.dialog.student-table"
									>
										<Table.Header>
											<Table.Row class="bg-muted/50">
												<Table.Head
													class="bg-muted/50 sticky top-0 z-10 hidden w-20 font-semibold 2xl:table-cell"
												>
													<button
														class="flex h-full w-full items-center gap-1"
														onclick={() => toggleSort('id')}
														data-testid="weekly-reports.dialog.sort-id"
													>
														ID
														{#if sortColumn === 'id'}
															{#if sortDirection === 'asc'}
																<ArrowUp class="size-3" />
															{:else}
																<ArrowDown class="size-3" />
															{/if}
														{/if}
													</button>
												</Table.Head>
												<Table.Head
													class="bg-muted/50 sticky top-0 z-10 w-10 text-center font-semibold"
												>
													<button
														class="flex h-full w-full items-center justify-center gap-1"
														onclick={() => toggleSort('grade')}
														data-testid="weekly-reports.dialog.sort-grade"
													>
														<span>G</span>
														{#if sortColumn === 'grade'}
															{#if sortDirection === 'asc'}
																<ArrowUp class="size-3" />
															{:else}
																<ArrowDown class="size-3" />
															{/if}
														{/if}
													</button>
												</Table.Head>
												<Table.Head
													class="bg-muted/50 sticky top-0 z-10 w-24 font-semibold sm:w-32"
												>
													<button
														class="flex h-full w-full min-w-0 items-center gap-1"
														onclick={() => toggleSort('name')}
														data-testid="weekly-reports.dialog.sort-name"
													>
														<span class="truncate">Name</span>
														{#if sortColumn === 'name'}
															{#if sortDirection === 'asc'}
																<ArrowUp class="size-3" />
															{:else}
																<ArrowDown class="size-3" />
															{/if}
														{/if}
													</button>
												</Table.Head>
												{#each categoryColumns as cat (cat)}
													<Table.Head
														class="bg-muted/50 sticky top-0 z-10 w-16 text-center text-xs leading-tight font-semibold break-words whitespace-normal sm:w-20 sm:text-sm md:w-24"
														>{cat}</Table.Head
													>
												{/each}
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{#each filteredStudents as student (student.studentId)}
												<Table.Row>
													<Table.Cell class="hidden w-20 font-mono text-sm 2xl:table-cell"
														>{student.studentId}</Table.Cell
													>
													<Table.Cell class="w-10 text-center"
														>{(student as { grade: number }).grade}</Table.Cell
													>
													<Table.Cell
														class="w-24 max-w-24 break-words whitespace-normal sm:w-32 sm:max-w-32"
													>
														{(student as { englishName: string }).englishName}</Table.Cell
													>
													{#each categoryColumns as cat (cat)}
														{@const points =
															(student as { pointsByCategory: Record<string, number> })
																.pointsByCategory[cat] || 0}
														<Table.Cell class="w-16 text-center sm:w-4 md:w-24">
															<span
																class={[
																	points > 0 && 'text-emerald-600 dark:text-emerald-400',
																	points === 0 && 'text-muted-foreground',
																	points < 0 && 'text-red-600 dark:text-red-400',
																	'inline-flex w-full justify-center font-medium'
																]}
															>
																{(points === 0 && '--') || points}
															</span>
														</Table.Cell>
													{/each}
												</Table.Row>
											{/each}
										</Table.Body>
									</Table.Root>
								</div>
							</div>
						{/if}
					</div>

					<footer
						class="bg-muted/30 flex shrink-0 items-center justify-between border-t px-4 py-3"
						data-testid="weekly-reports.dialog.footer"
					>
						<p
							class="text-muted-foreground text-sm"
							data-testid="weekly-reports.dialog.footer-info"
						>
							{selectedReport.formattedDate} - Week {selectedReport.weekNumber}
						</p>
						<div class="flex gap-2">
							<Button
								variant="outline"
								onclick={exportToExcel}
								aria-label="Export report to CSV"
								data-testid="weekly-reports.dialog.export-button"
							>
								<Download class="mr-2 size-4" />
								Export
							</Button>
							<Button
								variant="outline"
								onclick={closeDetail}
								data-testid="weekly-reports.dialog.close-button">Close</Button
							>
						</div>
					</footer>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
