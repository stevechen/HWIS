<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { Download, X, Search, ArrowUp, ArrowDown } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Table from '$lib/components/ui/table';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';

	const apiAny = api as {
		evaluations: {
			getWeeklyReportsList: (...args: unknown[]) => unknown;
			getWeeklyReportDetail: (...args: unknown[]) => unknown;
		};
	};

	let { data }: { data: { demoMode?: boolean; testRole?: string } } = $props();

	const isTestMode = $derived(!!data.testRole);

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

	let reportsQuery = useQuery(apiAny.evaluations.getWeeklyReportsList, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	const detailQuery = useQuery(apiAny.evaluations.getWeeklyReportDetail, () => ({
		fridayDate: selectedReport?.fridayDate ?? 0,
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	let reports = $derived(isDemoMode ? demoReports : reportsQuery.data || []);

	let allStudents = $derived(
		isDemoMode
			? selectedReport?.weekNumber === 3
				? demoStudentsWeek3
				: selectedReport?.weekNumber === 2
					? demoStudentsWeek2
					: demoStudentsWeek1
			: detailQuery?.data || []
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
			: detailQuery?.data || [];
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
	<header class="bg-card border-b shadow-sm">
		<div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<Button variant="outline" onclick={() => goto('/admin')}>← Back to Admin</Button>
					<h1 class="text-foreground text-2xl font-bold">Weekly Reports</h1>
					{#if isDemoMode}
						<span class="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
							>Demo Mode</span
						>
					{/if}
				</div>
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto px-4 py-6 sm:px-6 lg:px-8" aria-label="Weekly Reports">
		{#if !isDemoMode && reportsQuery.isLoading}
			<div class="flex items-center justify-center py-12" role="status" aria-live="polite">
				<p class="text-muted-foreground">Loading reports...</p>
			</div>
		{:else if !isDemoMode && reportsQuery.error}
			<div class="flex items-center justify-center py-12" role="alert">
				<p class="text-red-500">Error loading reports: {reportsQuery.error.message}</p>
			</div>
		{:else if reports.length === 0}
			<div class="flex items-center justify-center py-12" role="status">
				<p class="text-muted-foreground">No weekly reports available yet.</p>
			</div>
		{:else}
			<div class="flex justify-center" role="region" aria-label="Weekly reports list">
				<div class="inline-block rounded-md border">
					<Table.Root>
						<Table.Header>
							<Table.Row class="bg-muted/50">
								<Table.Head class="font-semibold">Week</Table.Head>
								<Table.Head class="font-semibold">Date Range</Table.Head>
								<Table.Head class="text-right font-semibold">Students</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each reports as report (report.fridayDate.toString())}
								<Table.Row class="cursor-pointer" onclick={() => openReport(report)} tabindex="0">
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

<dialog
	bind:this={dialogElement}
	class="bg-background fixed top-1/2 left-1/2 max-h-[85vh] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-lg border-0 p-0 shadow-xl"
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
		<div class="flex max-h-[85vh] w-full max-w-5xl flex-col">
			<header class="bg-muted/50 flex shrink-0 items-center justify-between border-b px-4 py-3">
				<h2 class="flex items-center gap-2 text-lg font-semibold">
					<span>Week {selectedReport.weekNumber} Report</span>
					<span class="text-muted-foreground">|</span>
					<span class="font-normal">{selectedReport.formattedDate}</span>
					<span class="text-muted-foreground">|</span>
					<span class="font-normal">{selectedReport.studentCount} students</span>
				</h2>
				<button
					onclick={closeDetail}
					class="text-muted-foreground hover:text-foreground hover:bg-muted ml-auto rounded p-1"
					aria-label="Close"
				>
					<X class="h-5 w-5" />
				</button>
			</header>

			<div
				class="bg-muted/30 shrink-0 border-b px-4 py-2"
				role="toolbar"
				aria-label="Filter options"
			>
				<div class="flex w-full items-center gap-3">
					<div class="relative hidden w-36 shrink-0 2xl:block">
						<Search
							class="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2"
						/>
						<input
							type="text"
							placeholder="Filter ID..."
							bind:value={filterId}
							class="bg-background focus:ring-ring h-8 w-full rounded-md border pr-2 pl-8 text-sm focus:ring-1 focus:outline-none"
						/>
					</div>
					<NativeSelect.Root bind:value={filterGrade} aria-label="Filter by grade">
						<NativeSelect.Option value="">All Grades</NativeSelect.Option>
						{#each availableGrades as grade (grade)}
							<NativeSelect.Option value={String(grade)}>Grade {grade}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
					<div class="relative min-w-0 flex-1">
						<Search
							class="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2"
						/>
						<input
							type="text"
							placeholder="Filter name (comma separated)..."
							bind:value={filterName}
							class="bg-background focus:ring-ring h-8 w-full rounded-md border pr-2 pl-8 text-sm focus:ring-1 focus:outline-none"
						/>
					</div>
				</div>
			</div>

			<div class="flex-1 overflow-auto" role="region" aria-label="Student details table">
				{#if !isDemoMode && detailQuery?.isLoading}
					<div class="flex items-center justify-center py-8" role="status" aria-live="polite">
						<p class="text-muted-foreground">Loading details...</p>
					</div>
				{:else if !isDemoMode && detailQuery?.error}
					<div class="flex items-center justify-center py-8" role="alert">
						<p class="text-red-500">Error loading details</p>
					</div>
				{:else if filteredStudents.length === 0}
					<div class="text-muted-foreground py-8 text-center" role="status">
						No students match the filters.
					</div>
				{:else}
					<div class="overflow-hidden rounded-md border">
						<div class="max-h-[calc(85vh-240px)] overflow-auto">
							<Table.Root class="w-full table-fixed">
								<Table.Header>
									<Table.Row class="bg-muted/50">
										<Table.Head
											class="bg-muted/50 sticky top-0 z-10 hidden w-20 font-semibold 2xl:table-cell"
										>
											<button
												class="flex h-full w-full items-center gap-1"
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
											class="bg-muted/50 sticky top-0 z-10 w-10 text-center font-semibold"
										>
											<button
												class="flex h-full w-full items-center justify-center gap-1"
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
										<Table.Head class="bg-muted/50 sticky top-0 z-10 w-32 font-semibold">
											<button
												class="flex h-full w-full items-center gap-1"
												onclick={() => toggleSort('name')}
											>
												Name
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
												class="bg-muted/50 sticky top-0 z-10 w-24 text-center font-semibold"
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
											<Table.Cell class="w-32"
												>{(student as { englishName: string }).englishName}</Table.Cell
											>
											{#each categoryColumns as cat (cat)}
												{@const points =
													(student as { pointsByCategory: Record<string, number> })
														.pointsByCategory[cat] || 0}
												<Table.Cell class="w-24 text-center">
													<span
														class="inline-flex w-full justify-center font-medium"
														class:text-emerald-600={points > 0}
														class:text-red-600={points < 0}
														class:text-muted-foreground={points === 0}
													>
														{points > 0 ? '+' : ''}{points}
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

			<footer class="bg-muted/30 flex shrink-0 items-center justify-between border-t px-4 py-3">
				<p class="text-muted-foreground text-sm">
					{selectedReport.formattedDate} - Week {selectedReport.weekNumber}
				</p>
				<div class="flex gap-2">
					<Button variant="outline" onclick={exportToExcel} aria-label="Export report to CSV">
						<Download class="mr-2 h-4 w-4" />
						Export CSV
					</Button>
					<Button variant="outline" onclick={closeDetail}>Close</Button>
				</div>
			</footer>
		</div>
	{/if}
</dialog>
