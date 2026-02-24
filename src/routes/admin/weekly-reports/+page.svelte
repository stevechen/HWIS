<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { browser } from '$app/environment';
	import { Download, X, Search, ArrowUp, ArrowDown } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';

	let { data }: { data: { demoMode?: boolean } } = $props();

	let isDemoMode = $state(false);
	$effect(() => {
		if (data.demoMode === true) {
			isDemoMode = true;
			return;
		}
		if (!browser) return;
		const url = new URL(window.location.href);
		isDemoMode = url.searchParams.get('demo') === 'true';
	});

	let dialogElement: HTMLDialogElement | undefined = $state();
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

	const demoReports = [
		{
			weekNumber: 3,
			fridayDate: 1737062400000,
			formattedDate: 'Jan 13 - Jan 17, 2025',
			studentCount: 3
		},
		{
			weekNumber: 2,
			fridayDate: 1736457600000,
			formattedDate: 'Jan 06 - Jan 10, 2025',
			studentCount: 5
		},
		{
			weekNumber: 1,
			fridayDate: 1735852800000,
			formattedDate: 'Dec 30 - Jan 03, 2025',
			studentCount: 4
		}
	];

	const demoStudentsWeek3 = [
		{
			studentId: 'STU001',
			englishName: 'John Doe',
			chineseName: '張三',
			grade: 10,
			pointsByCategory: {
				Creativity: 3,
				Activity: -1,
				Service: 2,
				Academic: 5,
				"Parents' Day": 1,
				'Other Issues': 0
			},
			totalPoints: 10
		},
		{
			studentId: 'STU002',
			englishName: 'Jane Doe',
			chineseName: '李四',
			grade: 11,
			pointsByCategory: {
				Creativity: 1,
				Activity: 2,
				Service: 0,
				Academic: 8,
				"Parents' Day": -1,
				'Other Issues': -2
			},
			totalPoints: 8
		},
		{
			studentId: 'STU003',
			englishName: 'Alex Smith',
			chineseName: '王五',
			grade: 9,
			pointsByCategory: {
				Creativity: 4,
				Activity: 1,
				Service: 6,
				Academic: 2,
				"Parents' Day": 0,
				'Other Issues': 1
			},
			totalPoints: 14
		}
	];

	const demoStudentsWeek2 = [
		{
			studentId: 'STU001',
			englishName: 'John Doe',
			chineseName: '張三',
			grade: 10,
			pointsByCategory: {
				Creativity: 2,
				Activity: 3,
				Service: 1,
				Academic: 4,
				"Parents' Day": 0,
				'Other Issues': -1
			},
			totalPoints: 9
		},
		{
			studentId: 'STU002',
			englishName: 'Jane Doe',
			chineseName: '李四',
			grade: 11,
			pointsByCategory: {
				Creativity: 5,
				Activity: 2,
				Service: 3,
				Academic: 6,
				"Parents' Day": 1,
				'Other Issues': 0
			},
			totalPoints: 17
		},
		{
			studentId: 'STU003',
			englishName: 'Alex Smith',
			chineseName: '王五',
			grade: 9,
			pointsByCategory: {
				Creativity: 1,
				Activity: 0,
				Service: 5,
				Academic: 3,
				"Parents' Day": -1,
				'Other Issues': 2
			},
			totalPoints: 10
		},
		{
			studentId: 'STU004',
			englishName: 'Emma Wilson',
			chineseName: '陳小明',
			grade: 10,
			pointsByCategory: {
				Creativity: 3,
				Activity: 4,
				Service: 2,
				Academic: 7,
				"Parents' Day": 2,
				'Other Issues': -1
			},
			totalPoints: 17
		},
		{
			studentId: 'STU005',
			englishName: 'Michael Brown',
			chineseName: '林小華',
			grade: 12,
			pointsByCategory: {
				Creativity: 4,
				Activity: 3,
				Service: 2,
				Academic: 8,
				"Parents' Day": 0,
				'Other Issues': 1
			},
			totalPoints: 18
		}
	];

	const demoStudentsWeek1 = [
		{
			studentId: 'STU002',
			englishName: 'Jane Doe',
			chineseName: '李四',
			grade: 11,
			pointsByCategory: {
				Creativity: 2,
				Activity: 1,
				Service: 0,
				Academic: 5,
				"Parents' Day": 0,
				'Other Issues': -2
			},
			totalPoints: 6
		},
		{
			studentId: 'STU003',
			englishName: 'Alex Smith',
			chineseName: '王五',
			grade: 9,
			pointsByCategory: {
				Creativity: 3,
				Activity: 2,
				Service: 4,
				Academic: 1,
				"Parents' Day": 1,
				'Other Issues': 0
			},
			totalPoints: 11
		},
		{
			studentId: 'STU004',
			englishName: 'Emma Wilson',
			chineseName: '陳小明',
			grade: 10,
			pointsByCategory: {
				Creativity: 1,
				Activity: 0,
				Service: 3,
				Academic: 4,
				"Parents' Day": 0,
				'Other Issues': -3
			},
			totalPoints: 5
		},
		{
			studentId: 'STU006',
			englishName: 'Sarah Davis',
			chineseName: '黃小美',
			grade: 9,
			pointsByCategory: {
				Creativity: 4,
				Activity: 3,
				Service: 2,
				Academic: 6,
				"Parents' Day": 1,
				'Other Issues': 0
			},
			totalPoints: 16
		}
	];

	let reportsQuery = useQuery(api.evaluations.getWeeklyReportsList, () => ({
		sinceTimestamp
	}));

	const detailQuery = $derived.by(() => {
		if (isDemoMode || !selectedReport) return undefined;
		return { fridayDate: selectedReport!.fridayDate };
	});

	const detailData = useQuery(api.evaluations.getWeeklyReportDetail, () =>
		isDemoMode || !selectedReport ? 'skip' : { fridayDate: selectedReport.fridayDate }
	);

	let reports = $derived(isDemoMode ? demoReports : reportsQuery.data || []);

	let allStudents = $derived(
		isDemoMode
			? selectedReport?.weekNumber === 3
				? demoStudentsWeek3
				: selectedReport?.weekNumber === 2
					? demoStudentsWeek2
					: demoStudentsWeek1
			: (detailData?.data ?? [])
	);

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

	const categories = [
		'Creativity',
		'Activity',
		'Service',
		'Academic',
		"Parents' Day",
		'Other Issues'
	];

	let categoryColumns = $derived(
		isDemoMode
			? categories
			: Array.from(
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
			if (browser && dialogElement) {
				dialogElement.showModal();
			}
		}
	}

	function closeDetail() {
		if (browser && dialogElement) {
			dialogElement.close();
		}
		selectedReport = null;
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
		const students = isDemoMode
			? selectedReport?.weekNumber === 3
				? demoStudentsWeek3
				: selectedReport?.weekNumber === 2
					? demoStudentsWeek2
					: demoStudentsWeek1
			: (detailData?.data ?? []);
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
	<main class="mx-auto px-4 sm:px-6 lg:px-8 py-6" aria-label="Weekly Reports">
		{#if isDemoMode}
			<div class="flex justify-end mb-4">
				<span class="bg-amber-100 px-2 py-1 rounded font-semibold text-amber-800 text-xs">
					Demo Mode
				</span>
			</div>
		{/if}
		{#if !isDemoMode && reportsQuery.isLoading}
			<div class="flex justify-center items-center py-12" role="status" aria-live="polite">
				<p class="text-muted-foreground">Loading reports...</p>
			</div>
		{:else if !isDemoMode && reportsQuery.error}
			<div class="flex justify-center items-center py-12" role="alert">
				<p class="text-red-500">Error loading reports: {reportsQuery.error.message}</p>
			</div>
		{:else if reports.length === 0}
			<div class="flex justify-center items-center py-12" role="status">
				<p class="text-muted-foreground">No weekly reports available yet.</p>
			</div>
		{:else}
			<div class="flex justify-center" role="region" aria-label="Weekly reports list">
				<div class="inline-block border rounded-md">
					<Table.Root>
						<Table.Header>
							<Table.Row class="bg-muted/50">
								<Table.Head class="font-semibold">Week</Table.Head>
								<Table.Head class="font-semibold">Date Range</Table.Head>
								<Table.Head class="font-semibold text-right">Students</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each reports as report (report.fridayDate.toString())}
								<Table.Row class="cursor-pointer" onclick={() => openReport(report)} tabindex={0}>
									<Table.Cell class="font-medium text-center">{report.weekNumber}</Table.Cell>
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

<dialog
	bind:this={dialogElement}
	class="top-1/2 left-1/2 fixed bg-background shadow-xl p-0 border-0 rounded-lg w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[85vh] -translate-x-1/2 -translate-y-1/2"
	onclose={() => {
		selectedReport = null;
	}}
	onclick={(e) => {
		if (e.target === dialogElement) {
			closeDetail();
		}
	}}
>
	{#if selectedReport}
		<div class="flex flex-col w-full max-w-5xl max-h-[85vh]">
			<header class="flex justify-between items-center bg-muted/50 px-4 py-3 border-b shrink-0">
				<h2 class="flex items-center gap-2 font-semibold text-lg">
					<span>Week {selectedReport.weekNumber} Report</span>
					<span class="text-muted-foreground">|</span>
					<span class="font-normal">{selectedReport.formattedDate}</span>
					<span class="text-muted-foreground">|</span>
					<span class="font-normal">{selectedReport.studentCount} students</span>
				</h2>
				<button
					onclick={closeDetail}
					class="hover:bg-muted ml-auto p-1 rounded text-muted-foreground hover:text-foreground"
					aria-label="Close"
				>
					<X class="w-5 h-5" />
				</button>
			</header>

			<div
				class="bg-muted/30 px-4 py-2 border-b shrink-0"
				role="toolbar"
				aria-label="Filter options"
			>
				<div class="flex items-center gap-3 w-full">
					<div class="hidden 2xl:block relative w-36 shrink-0">
						<Search class="top-1/2 left-2 absolute size-4 text-muted-foreground -translate-y-1/2" />
						<input
							type="text"
							placeholder="Filter ID..."
							bind:value={filterId}
							class="bg-background pr-2 pl-8 border rounded-md focus:outline-none focus:ring-1 focus:ring-ring w-full h-8 text-sm"
						/>
					</div>
					<NativeSelect.Root bind:value={filterGrade} aria-label="Filter by grade">
						<NativeSelect.Option value="">All Grades</NativeSelect.Option>
						{#each availableGrades as grade (grade)}
							<NativeSelect.Option value={String(grade)}>Grade {grade}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
					<div class="relative flex-1 min-w-0">
						<Search class="top-1/2 left-2 absolute size-4 text-muted-foreground -translate-y-1/2" />
						<input
							type="text"
							placeholder="Filter name (comma separated)..."
							bind:value={filterName}
							class="bg-background pr-2 pl-8 border rounded-md focus:outline-none focus:ring-1 focus:ring-ring w-full h-8 text-sm"
						/>
					</div>
				</div>
			</div>

			<div class="flex-1 overflow-auto" role="region" aria-label="Student details table">
				{#if !isDemoMode && detailData?.isLoading}
					<div class="flex justify-center items-center py-8" role="status" aria-live="polite">
						<p class="text-muted-foreground">Loading details...</p>
					</div>
				{:else if !isDemoMode && detailData?.error}
					<div class="flex justify-center items-center py-8" role="alert">
						<p class="text-red-500">Error loading details</p>
					</div>
				{:else if filteredStudents.length === 0}
					<div class="py-8 text-muted-foreground text-center" role="status">
						No students match the filters.
					</div>
				{:else}
					<div class="border rounded-md overflow-hidden">
						<div class="max-h-[calc(85vh-240px)] overflow-auto">
							<Table.Root class="w-full table-fixed">
								<Table.Header>
									<Table.Row class="bg-muted/50">
										<Table.Head
											class="hidden 2xl:table-cell top-0 z-10 sticky bg-muted/50 w-20 font-semibold"
										>
											<button
												class="flex items-center gap-1 w-full h-full"
												onclick={() => toggleSort('id')}
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
											class="top-0 z-10 sticky bg-muted/50 w-10 font-semibold text-center"
										>
											<button
												class="flex justify-center items-center gap-1 w-full h-full"
												onclick={() => toggleSort('grade')}
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
										<Table.Head class="top-0 z-10 sticky bg-muted/50 w-24 sm:w-32 font-semibold">
											<button
												class="flex items-center gap-1 w-full min-w-0 h-full"
												onclick={() => toggleSort('name')}
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
												class="top-0 z-10 sticky bg-muted/50 w-16 sm:w-20 md:w-24 font-semibold text-xs sm:text-sm text-center break-words leading-tight whitespace-normal"
												>{cat}</Table.Head
											>
										{/each}
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each filteredStudents as student (student.studentId)}
										<Table.Row>
											<Table.Cell class="hidden 2xl:table-cell w-20 font-mono text-sm"
												>{student.studentId}</Table.Cell
											>
											<Table.Cell class="w-10 text-center"
												>{(student as { grade: number }).grade}</Table.Cell
											>
											<Table.Cell
												class="w-24 sm:w-32 max-w-24 sm:max-w-32 break-words whitespace-normal"
											>
												{(student as { englishName: string }).englishName}</Table.Cell
											>
											{#each categoryColumns as cat (cat)}
												{@const points =
													(student as { pointsByCategory: Record<string, number> })
														.pointsByCategory[cat] || 0}
												<Table.Cell class="w-16 sm:w-4 md:w-24 text-center">
													<span
														class={[
															points > 0 && 'text-emerald-600',
															points === 0 && 'text-muted-foreground',
															points < 0 && 'text-red-600',
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

			<footer class="flex justify-between items-center bg-muted/30 px-4 py-3 border-t shrink-0">
				<p class="text-muted-foreground text-sm">
					{selectedReport.formattedDate} - Week {selectedReport.weekNumber}
				</p>
				<div class="flex gap-2">
					<Button variant="outline" onclick={exportToExcel} aria-label="Export report to CSV">
						<Download class="mr-2 size-4" />
						Export
					</Button>
					<Button variant="outline" onclick={closeDetail}>Close</Button>
				</div>
			</footer>
		</div>
	{/if}
</dialog>
