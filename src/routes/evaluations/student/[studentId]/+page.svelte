<script lang="ts">
	import {
		ArrowLeft,
		ArrowUp,
		ArrowDown,
		Award,
		MinusCircle,
		Star,
		User,
		Calendar,
		Eye
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	// Mock data for visualization
	let { data }: { data: { testRole?: string } } = $props();

	const isTestMode = $derived(!!data.testRole);
	const isAdmin = $derived(data.testRole === 'admin' || data.testRole === 'super');

	// Mock current user (who is viewing this page)
	const currentUserName = $derived(isAdmin ? 'Ms. Johnson' : '');

	// Mock student data
	const student = $state({
		_id: 'mock-student-id',
		englishName: 'John Smith',
		chineseName: '張約翰',
		studentId: 'SE2024001',
		grade: 10,
		classSection: 'A'
	});

	// Mock evaluation data
	const mockEvaluations = $state([
		{
			_id: 'eval-1',
			value: 5,
			category: 'Academic',
			subCategory: 'Homework',
			details: 'Excellent homework submission',
			timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
			teacherName: 'Ms. Johnson',
			isAdmin: false
		},
		{
			_id: 'eval-2',
			value: -3,
			category: 'Behavior',
			subCategory: 'Late Arrival',
			details: 'Arrived 15 minutes late to class',
			timestamp: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
			teacherName: 'Mr. Smith',
			isAdmin: false
		},
		{
			_id: 'eval-3',
			value: 10,
			category: 'Academic',
			subCategory: 'Test Score',
			details: 'Outstanding performance on midterm exam',
			timestamp: Date.now() - 1000 * 60 * 60 * 72, // 3 days ago
			teacherName: 'Ms. Johnson',
			isAdmin: false
		},
		{
			_id: 'eval-4',
			value: 5,
			category: 'Extracurricular',
			subCategory: 'Sports',
			details: 'Participated in basketball tournament',
			timestamp: Date.now() - 1000 * 60 * 60 * 96, // 4 days ago
			teacherName: 'Coach Williams',
			isAdmin: false
		},
		{
			_id: 'eval-5',
			value: 8,
			category: 'Academic',
			subCategory: 'Project',
			details: 'Science fair project - first place',
			timestamp: Date.now() - 1000 * 60 * 60 * 120, // 5 days ago
			teacherName: 'Dr. Brown',
			isAdmin: false
		}
	]);

	// Admin-specific mock evaluations
	const mockAdminEvaluations = $state([
		{
			_id: 'admin-eval-1',
			value: 15,
			category: 'Special',
			subCategory: 'Achievement',
			details: 'Student of the Month Award',
			timestamp: Date.now() - 1000 * 60 * 60 * 6, // 6 hours ago
			teacherName: 'Admin',
			isAdmin: true
		},
		{
			_id: 'admin-eval-2',
			value: -5,
			category: 'Disciplinary',
			subCategory: 'Policy Violation',
			details: 'Late submission of required documents',
			timestamp: Date.now() - 1000 * 60 * 60 * 168, // 7 days ago
			teacherName: 'Admin',
			isAdmin: true
		}
	]);

	// State for sorting and display
	let sortAscending = $state(false);
	let showDetails = $state(false);
	let teacherFilter = $state('');

	// Track hovered card index
	let hoveredIndex = $state<number | null>(null);

	// Get unique teachers
	let uniqueTeachers = $derived(() => {
		let all = isAdmin ? [...mockAdminEvaluations, ...mockEvaluations] : [...mockEvaluations];
		const teachers = [...new Set(all.map((e) => e.teacherName))];
		return teachers.sort();
	});

	// Combined and filtered evaluations
	let filteredEvaluations = $derived(() => {
		let all = isAdmin ? [...mockAdminEvaluations, ...mockEvaluations] : [...mockEvaluations];

		// Apply teacher filter
		if (teacherFilter) {
			all = all.filter((e) => e.teacherName === teacherFilter);
		}

		// Apply sorting
		all.sort((a, b) => {
			return sortAscending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
		});

		return all;
	});

	function formatDate(ts: number) {
		const date = new Date(ts);
		return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
	}

	function toggleSort() {
		sortAscending = !sortAscending;
	}

	function toggleDetails() {
		showDetails = !showDetails;
	}

	// Get node color based on evaluation type (green for positive, red for negative)
	function getNodeColor(eval_: (typeof mockEvaluations)[0]) {
		if (eval_.value >= 0) return 'bg-emerald-500';
		return 'bg-red-500';
	}

	// Get card border color
	function getCardBorderColor(eval_: (typeof mockEvaluations)[0]) {
		if (eval_.value >= 0) return 'border-emerald-200 dark:border-emerald-800';
		return 'border-red-200 dark:border-red-800';
	}

	// Get text color for category
	function getCategoryColor(eval_: (typeof mockEvaluations)[0]) {
		if (eval_.teacherName === currentUserName) return 'text-purple-600 dark:text-purple-400';
		return 'text-foreground';
	}

	// Get text color for teacher name
	function getTeacherNameColor(eval_: (typeof mockEvaluations)[0]) {
		if (eval_.teacherName === currentUserName)
			return 'text-purple-600 dark:text-purple-400 font-semibold';
		return 'text-muted-foreground';
	}

	// Get points badge classes
	function getPointsBadgeClasses(eval_: (typeof mockEvaluations)[0]) {
		if (eval_.value >= 0)
			return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400';
		return 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400';
	}
</script>

<div class="mx-auto max-w-6xl p-8">
	<header class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" onclick={() => void (window.location.href = '/evaluations')}>
				<ArrowLeft class="h-4 w-4" />
				<span class="hidden sm:ml-2 sm:inline">Back to Evaluations</span>
			</Button>
			<h1 class="text-foreground text-lg font-semibold sm:text-2xl">
				<span class="hidden sm:inline">Evaluation History - </span>
				<span>G{student.grade} - {student.englishName}</span>
			</h1>
		</div>
		<ThemeToggle />
	</header>

	<!-- Timeline Controls -->
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-xl font-semibold">
			{isAdmin ? 'Points' : 'Your Assigned Points'}
		</h2>
		<div class="flex items-center gap-2">
			<!-- Sort Toggle -->
			<Button
				variant="outline"
				size="sm"
				onclick={toggleSort}
				title={sortAscending ? 'Oldest First' : 'Newest First'}
			>
				{#if sortAscending}
					<ArrowUp class="h-4 w-4" />
				{:else}
					<ArrowDown class="h-4 w-4" />
				{/if}
			</Button>

			<!-- Teacher Filter (admin only) -->
			{#if isAdmin}
				<select
					bind:value={teacherFilter}
					class="border-input bg-background focus:ring-ring h-9 rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus:ring-1 focus:outline-none"
				>
					<option value="">All Teachers</option>
					{#each uniqueTeachers() as teacher}
						<option value={teacher}>{teacher}</option>
					{/each}
				</select>
			{/if}

			<!-- Show Details Toggle -->
			<Button
				variant="outline"
				size="sm"
				onclick={toggleDetails}
				title={showDetails ? 'Hide Details' : 'Show Details'}
			>
				<Eye class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Timeline Container -->
	<div class="bg-background relative">
		{#if filteredEvaluations().length === 0}
			<div class="text-muted-foreground py-12 text-center">
				No evaluations found for this student.
			</div>
		{:else}
			<!-- Vertical Timeline with CSS Grid -->
			<div class="relative flex min-h-[100px] flex-col gap-6 py-4">
				<!-- Central Line -->
				<div
					class="border-border absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 border-l"
				></div>

				{#each filteredEvaluations() as eval_, index (eval_._id)}
					<!-- Timeline Item -->
					{#if index % 2 === 0}
						<!-- Odd item: Date on LEFT, Node center, Content on RIGHT -->
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
							<!-- Date on Left -->
							<div
								class="text-muted-foreground flex w-28 flex-col items-end justify-center self-center pr-2 text-right sm:w-full sm:min-w-[150px]"
							>
								<div class="flex items-center gap-1 text-xs">
									<Calendar class="h-3 w-3" />
									<span>{formatDate(eval_.timestamp)}</span>
								</div>
								{#if isAdmin}
									<div class="mt-1 flex items-center gap-1 text-xs">
										<User class="h-3 w-3" />
										<span class={getTeacherNameColor(eval_)}>{eval_.teacherName}</span>
									</div>
								{/if}
							</div>

							<!-- Node Center -->
							<div class="z-10 flex items-center justify-center">
								<div
									class="border-background h-3 w-3 rounded-full border-2 {getNodeColor(eval_)}"
								></div>
							</div>

							<!-- Content on Right -->
							<div class="flex justify-start self-center pl-2 sm:w-full">
								<div
									class="bg-card relative max-w-[180px] cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-[200px] {getCardBorderColor(
										eval_
									)}"
									onmouseenter={() => (hoveredIndex = index)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
										<span class="text-sm font-semibold {getCategoryColor(eval_)}"
											>{eval_.category}</span
										>
										<span class="text-muted-foreground hidden text-xs sm:inline">›</span>
										<span class="text-muted-foreground text-xs">{eval_.subCategory}</span>
									</div>
									<div
										class="overflow-hidden transition-all duration-300 {showDetails ||
										hoveredIndex === index
											? 'max-h-[200px] opacity-100'
											: 'max-h-0 opacity-0'}"
									>
										{#if eval_.details}
											<p class="text-muted-foreground text-xs">{eval_.details}</p>
										{/if}
									</div>
									<div
										class="absolute -top-2 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
											eval_
										)}"
									>
										{#if eval_.isAdmin}
											<Star class="h-4 w-4" />
										{:else if eval_.value >= 0}
											<Award class="h-4 w-4" />
										{:else}
											<MinusCircle class="h-4 w-4" />
										{/if}
										<span>{eval_.value > 0 ? '+' : ''}{eval_.value}</span>
									</div>
								</div>
							</div>
						</div>
					{:else}
						<!-- Even item: Content on LEFT, Node center, Date on RIGHT -->
						<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
							<!-- Content on Left -->
							<div class="flex justify-end self-center pr-2 sm:w-full">
								<div
									class="bg-card relative max-w-[180px] cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-[200px] {getCardBorderColor(
										eval_
									)}"
									onmouseenter={() => (hoveredIndex = index)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
										<span class="text-sm font-semibold {getCategoryColor(eval_)}"
											>{eval_.category}</span
										>
										<span class="text-muted-foreground hidden text-xs sm:inline">›</span>
										<span class="text-muted-foreground text-xs">{eval_.subCategory}</span>
									</div>
									<div
										class="overflow-hidden transition-all duration-300 {showDetails ||
										hoveredIndex === index
											? 'max-h-[200px] opacity-100'
											: 'max-h-0 opacity-0'}"
									>
										{#if eval_.details}
											<p class="text-muted-foreground text-xs">{eval_.details}</p>
										{/if}
									</div>
									<div
										class="absolute -top-2 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
											eval_
										)}"
									>
										{#if eval_.isAdmin}
											<Star class="h-4 w-4" />
										{:else if eval_.value >= 0}
											<Award class="h-4 w-4" />
										{:else}
											<MinusCircle class="h-4 w-4" />
										{/if}
										<span>{eval_.value > 0 ? '+' : ''}{eval_.value}</span>
									</div>
								</div>
							</div>

							<!-- Node Center -->
							<div class="z-10 flex items-center justify-center">
								<div
									class="border-background h-3 w-3 rounded-full border-2 {getNodeColor(eval_)}"
								></div>
							</div>

							<!-- Date on Right -->
							<div
								class="text-muted-foreground flex w-28 flex-col items-start justify-center self-center pl-2 text-left sm:w-full sm:min-w-[150px]"
							>
								<div class="flex items-center gap-1 text-xs">
									<Calendar class="h-3 w-3" />
									<span>{formatDate(eval_.timestamp)}</span>
								</div>
								{#if isAdmin}
									<div class="mt-1 flex items-center gap-1 text-xs">
										<User class="h-3 w-3" />
										<span class={getTeacherNameColor(eval_)}>{eval_.teacherName}</span>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Legend -->
	<div
		class="text-muted-foreground bg-card fixed right-0 bottom-0 left-0 z-50 flex items-center justify-center gap-6 border-t p-3 text-sm shadow-lg"
	>
		<div class="flex items-center gap-2">
			<div class="h-3 w-3 rounded-full bg-emerald-500"></div>
			<span>Positive Points</span>
		</div>
		<div class="flex items-center gap-2">
			<div class="h-3 w-3 rounded-full bg-red-500"></div>
			<span>Negative Points</span>
		</div>
	</div>

	<!-- Spacer for fixed legend -->
	<div class="h-16"></div>
</div>
