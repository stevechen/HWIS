<!--
  PROTOTYPE ONLY: Three ESL Students page layouts, switchable by URL variant.
  Uses in-memory sample data. No real queries or mutations are connected.
-->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		ArrowRight,
		Check,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		ClipboardCheck,
		FileUp,
		MoreHorizontal,
		Search,
		Users,
		UserRoundPlus,
		UserRoundX,
		X
	} from '@lucide/svelte';

	const variants = [
		{ key: 'action-first', label: 'Action first' },
		{ key: 'roster-workflow', label: 'Roster workflow' },
		{ key: 'hybrid', label: 'Hybrid' }
	] as const;
	type Variant = (typeof variants)[number]['key'];
	type RosterState = 'import' | 'confirm' | 'complete';
	type Student = {
		id: string;
		chineseName: string;
		englishName?: string;
		grade: number;
		chineseClass: string;
		eslClass: string;
		status: 'Active' | 'Disabled';
	};

	let students = $state<Student[]>([
		{
			id: '1150001',
			chineseName: '林雨晴',
			englishName: 'Iris Lin',
			grade: 7,
			chineseClass: 'J101',
			eslClass: 'Elementary 1',
			status: 'Active'
		},
		{
			id: '1150002',
			chineseName: '陳柏宇',
			englishName: 'Ethan Chen',
			grade: 7,
			chineseClass: 'J103',
			eslClass: 'Basic 2',
			status: 'Active'
		},
		{
			id: '1140001',
			chineseName: '王子涵',
			englishName: 'Mia Wang',
			grade: 8,
			chineseClass: 'J202',
			eslClass: 'Elementary 1',
			status: 'Active'
		},
		{
			id: '1140002',
			chineseName: '黃品睿',
			grade: 8,
			chineseClass: 'J204',
			eslClass: 'Intermediate 2',
			status: 'Active'
		},
		{
			id: '1130001',
			chineseName: '張語恩',
			englishName: 'Chloe Chang',
			grade: 9,
			chineseClass: 'J301',
			eslClass: 'Basic 2',
			status: 'Active'
		},
		{
			id: '1130002',
			chineseName: '李承翰',
			englishName: 'Noah Lee',
			grade: 9,
			chineseClass: 'J303',
			eslClass: 'Elementary 2',
			status: 'Active'
		},
		{
			id: '511001',
			chineseName: '吳心妤',
			englishName: 'Grace Wu',
			grade: 10,
			chineseClass: 'H102',
			eslClass: 'Intermediate 1',
			status: 'Active'
		},
		{
			id: '1140003',
			chineseName: '周家豪',
			englishName: 'Leo Chou',
			grade: 8,
			chineseClass: 'J201',
			eslClass: 'Elementary 1',
			status: 'Disabled'
		}
	]);
	let searchDraft = $state('');
	let searchedTerm = $state('');
	let hasSearched = $state(false);
	let modal = $state<'enroll' | 'transfer' | 'level' | 'homeroom' | null>(null);
	let selectedStudentId = $state('');
	let formMessage = $state('');
	let transferHistory = $state<{ studentId: string; date: string; reason: string }[]>([]);
	let transferNotice = $state('');
	let studentId = $state('');
	let chineseName = $state('');
	let englishName = $state('');
	let chineseClass = $state('');
	let eslClass = $state('');
	let effectiveDate = $state('2026-10-23');
	let reason = $state('');
	let targetEslClass = $state('Basic 2');
	let targetHomeroom = $state('J102');
	const schoolYear = '2026-2027';
	const rocEntryYear = Number(schoolYear.slice(0, 4)) - 1911;
	const chineseClassesByGrade: Record<string, string[]> = {
		'7': ['J101', 'J102', 'J103', 'J104'],
		'8': ['J201', 'J202', 'J203', 'J204'],
		'9': ['J301', 'J302', 'J303', 'J304'],
		'10': ['H101', 'H102', 'H103', 'H104']
	};
	const eslClassesByChineseClass: Record<string, string[]> = {
		J101: ['Elementary 1', 'Basic 2'],
		J102: ['Elementary 1', 'Basic 2'],
		J103: ['Elementary 2', 'Basic 1'],
		J104: ['Elementary 2', 'Basic 1'],
		J201: ['Elementary 1', 'Basic 1'],
		J202: ['Elementary 1', 'Basic 2'],
		J203: ['Intermediate 1', 'Basic 2'],
		J204: ['Intermediate 2', 'Basic 3'],
		J301: ['Elementary 1', 'Basic 2'],
		J302: ['Elementary 1', 'Basic 3'],
		J303: ['Elementary 2', 'Basic 1'],
		J304: ['Intermediate 1', 'Basic 4'],
		H101: ['Intermediate 1', 'Basic 3'],
		H102: ['Intermediate 1', 'Basic 4'],
		H103: ['Intermediate 2', 'Basic 3'],
		H104: ['Intermediate 2', 'Basic 4']
	};
	const enrollmentGrade = $derived(gradeFromStudentId(studentId));
	const chineseClassOptions = $derived(
		enrollmentGrade === null ? [] : (chineseClassesByGrade[String(enrollmentGrade)] ?? [])
	);
	const eslClassOptions = $derived(eslClassesByChineseClass[chineseClass] ?? []);

	const currentVariant = $derived(
		variants.some((variant) => variant.key === page.url.searchParams.get('variant'))
			? (page.url.searchParams.get('variant') as Variant)
			: 'action-first'
	);
	const rosterState = $derived(
		page.url.searchParams.get('roster') === 'confirm' ||
			page.url.searchParams.get('roster') === 'complete'
			? (page.url.searchParams.get('roster') as RosterState)
			: 'import'
	);
	const visibleStudents = $derived(
		hasSearched && searchedTerm
			? students.filter((student) =>
					`${student.id} ${student.chineseName} ${student.englishName ?? ''} ${student.eslClass}`
						.toLowerCase()
						.includes(searchedTerm.toLowerCase())
				)
			: []
	);
	const selectedStudent = $derived(students.find((student) => student.id === selectedStudentId));
	const selectedEslClassOptions = $derived(
		selectedStudent ? (eslClassesByChineseClass[selectedStudent.chineseClass] ?? []) : []
	);
	const selectedChineseClassOptions = $derived(
		selectedStudent ? (chineseClassesByGrade[String(selectedStudent.grade)] ?? []) : []
	);
	const variantLabel = $derived(
		variants.find((variant) => variant.key === currentVariant)?.label ?? 'Action first'
	);

	function gradeFromStudentId(rawId: string) {
		const id = rawId.trim();
		if (/^\d{6}$/.test(id)) {
			const schoolYearPrefix = String(rocEntryYear).split('').reverse().join('');
			return id.startsWith(schoolYearPrefix) ? 10 : null;
		}
		if (!/^\d{7}$/.test(id)) return null;
		const entryYear = Number(id.slice(0, 3));
		const derivedGrade = 7 + (rocEntryYear - entryYear);
		return derivedGrade >= 7 && derivedGrade <= 9 ? derivedGrade : null;
	}

	function updateEnrollmentStudentId(value: string) {
		if (gradeFromStudentId(value) !== enrollmentGrade) {
			chineseClass = '';
			eslClass = '';
		}
		studentId = value;
	}

	async function updateUrl(next: { variant?: Variant; roster?: RosterState }) {
		const url = new URL(page.url);
		url.searchParams.set('prototype', '1');
		if (next.variant) url.searchParams.set('variant', next.variant);
		if (next.roster) url.searchParams.set('roster', next.roster);
		await goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function cycleVariant(direction: number) {
		const index = variants.findIndex((variant) => variant.key === currentVariant);
		const nextIndex = (index + direction + variants.length) % variants.length;
		void updateUrl({ variant: variants[nextIndex].key });
	}

	function openModal(kind: typeof modal, id?: string) {
		if (id) selectedStudentId = id;
		const student = students.find((row) => row.id === (id ?? selectedStudentId));
		if (kind === 'level' && student) {
			targetEslClass =
				eslClassesByChineseClass[student.chineseClass]?.find((item) => item !== student.eslClass) ??
				student.eslClass;
		}
		if (kind === 'homeroom' && student) {
			targetHomeroom =
				chineseClassesByGrade[String(student.grade)]?.find(
					(item) => item !== student.chineseClass
				) ?? student.chineseClass;
		}
		formMessage = '';
		if (kind === 'transfer') transferNotice = '';
		modal = kind;
	}

	function runSearch(event: SubmitEvent) {
		event.preventDefault();
		searchedTerm = searchDraft.trim();
		hasSearched = searchedTerm.length > 0;
		selectedStudentId = '';
	}

	function submitAction(event: SubmitEvent) {
		event.preventDefault();
		if (modal === 'enroll') {
			if (rosterState !== 'complete') {
				formMessage = 'Confirm roster readiness before enrolling a student.';
				return;
			}
			if (
				!studentId.trim() ||
				enrollmentGrade === null ||
				!chineseName.trim() ||
				!chineseClass ||
				!eslClass
			) {
				formMessage = 'Enter a valid student ID, Chinese name, Chinese class, and ESL class.';
				return;
			}
			students.unshift({
				id: studentId.trim(),
				chineseName: chineseName.trim(),
				englishName: englishName.trim() || undefined,
				grade: enrollmentGrade,
				chineseClass,
				eslClass,
				status: 'Active'
			});
			formMessage = 'Student added to this prototype roster.';
			studentId = '';
			chineseName = '';
			englishName = '';
			chineseClass = '';
			eslClass = '';
		} else if (modal === 'transfer' && selectedStudent) {
			selectedStudent.status = 'Disabled';
			transferHistory.unshift({
				studentId: selectedStudent.id,
				date: effectiveDate,
				reason: reason.trim()
			});
			transferNotice = `${selectedStudent.chineseName} marked as transferred out effective ${effectiveDate}${reason.trim() ? ` — ${reason.trim()}` : ''}.`;
			reason = '';
			formMessage = '';
			modal = null;
		} else if (modal === 'level' && selectedStudent) {
			selectedStudent.eslClass = targetEslClass;
			formMessage = `${selectedStudent.chineseName} moved to ${targetEslClass}.`;
		} else if (modal === 'homeroom' && selectedStudent) {
			selectedStudent.chineseClass = targetHomeroom;
			formMessage = `${selectedStudent.chineseName}'s Chinese class changed to ${targetHomeroom}.`;
		}
	}

	function rosterAction() {
		formMessage = '';
		if (rosterState === 'import') void updateUrl({ roster: 'confirm' });
		else if (rosterState === 'confirm') void updateUrl({ roster: 'complete' });
	}
</script>

<svelte:window
	onkeydown={(event) => {
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		)
			return;
		if (event.key === 'ArrowLeft') cycleVariant(-1);
		if (event.key === 'ArrowRight') cycleVariant(1);
	}}
/>

{#snippet primaryActions()}
	<div class="flex flex-wrap items-center gap-2">
		<button
			class="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={rosterState !== 'complete'}
			onclick={() => openModal('enroll')}
			title={rosterState === 'complete'
				? 'Enroll a student'
				: 'Confirm roster readiness to enroll students'}
		>
			<UserRoundPlus class="size-4" /> Enroll student
		</button>
		{#if rosterState !== 'complete'}
			<span class="text-muted-foreground text-xs">Available after roster confirmation</span>
		{/if}
		<button
			class="border-border bg-card text-foreground hover:bg-muted inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition"
			disabled={!selectedStudent || selectedStudent.status !== 'Active'}
			onclick={() => selectedStudent && openModal('transfer', selectedStudent.id)}
		>
			<UserRoundX class="size-4" />
			{selectedStudent?.status === 'Active'
				? `Transfer out · ${selectedStudent.chineseName}`
				: 'Select a student to transfer'}
		</button>
	</div>
	{#if transferNotice}
		<p
			class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
			role="status"
			aria-live="polite"
		>
			{transferNotice}
		</p>
	{/if}
{/snippet}

{#snippet taskCard()}
	{#if rosterState === 'import'}
		<section
			class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm"
			aria-label="Roster task: import due"
		>
			<div class="flex items-start gap-3">
				<div class="rounded-lg bg-amber-100 p-2"><FileUp class="size-5" /></div>
				<div class="min-w-0 flex-1">
					<p class="text-xs font-bold tracking-[0.12em] text-amber-800 uppercase">
						2026–27 school year · roster setup
					</p>
					<h2 class="mt-1 text-base font-semibold">Import this year’s roster</h2>
					<p class="mt-1 text-sm text-amber-900/80">
						Start with the approved roster file. We’ll check student IDs, Chinese classes, and ESL
						class assignments before applying it.
					</p>
					<div class="mt-3 flex flex-wrap items-center gap-3">
						<button
							class="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-950 px-3 text-sm font-semibold text-white hover:bg-amber-900"
							onclick={rosterAction}>Review import <ArrowRight class="size-4" /></button
						>
						<span class="text-xs text-amber-900/70">Last year: 184 students</span>
					</div>
				</div>
				<span class="shrink-0 rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold"
					>Action needed</span
				>
			</div>
		</section>
	{:else if rosterState === 'confirm'}
		<section
			class="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-950 shadow-sm"
			aria-label="Roster task: confirmation due"
		>
			<div class="flex items-start gap-3">
				<div class="rounded-lg bg-sky-100 p-2"><ClipboardCheck class="size-5" /></div>
				<div class="min-w-0 flex-1">
					<p class="text-xs font-bold tracking-[0.12em] text-sky-800 uppercase">
						2026–27 school year · final review
					</p>
					<h2 class="mt-1 text-base font-semibold">Confirm roster readiness</h2>
					<p class="mt-1 text-sm text-sky-900/80">
						Review the imported counts and resolve exceptions before you confirm this year’s roster.
					</p>
					<div class="mt-3 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
						<div class="rounded-lg border border-sky-200 bg-white/70 px-3 py-2">
							<span class="block text-lg font-semibold">184</span><span
								class="text-xs text-sky-900/70">Active students</span
							>
						</div>
						<div class="rounded-lg border border-sky-200 bg-white/70 px-3 py-2">
							<span class="block text-lg font-semibold">12</span><span
								class="text-xs text-sky-900/70">ESL classes</span
							>
						</div>
						<div class="rounded-lg border border-sky-200 bg-white/70 px-3 py-2">
							<span class="block text-lg font-semibold">3</span><span
								class="text-xs text-sky-900/70">Missing English names</span
							>
						</div>
						<div class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
							<span class="block text-lg font-semibold text-rose-800">2</span><span
								class="text-xs text-rose-800/80">Exceptions to resolve</span
							>
						</div>
					</div>
					<div class="mt-3 flex flex-wrap items-center gap-3">
						<button
							class="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-950 px-3 text-sm font-semibold text-white hover:bg-sky-900"
							onclick={rosterAction}><Check class="size-4" /> Confirm roster</button
						>
						<button
							class="text-sm font-medium underline decoration-sky-400 underline-offset-4"
							onclick={() =>
								(formMessage =
									'Prototype exception list: two student records need an ESL class assignment.')}
							>View exceptions</button
						>
					</div>
				</div>
				<span class="shrink-0 rounded-full bg-sky-200 px-2.5 py-1 text-xs font-semibold"
					>Review due</span
				>
			</div>
		</section>
	{/if}
{/snippet}

{#snippet rosterTable(showEslClass = true)}
	<div class="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
		<div
			class="border-border flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"
		>
			<div>
				<h2 class="font-semibold">ESL student roster</h2>
				<p class="text-muted-foreground mt-0.5 text-sm">
					{#if hasSearched}{visibleStudents.length} matching students{:else}Search to load matching
						students{/if}
				</p>
			</div>
			<form class="flex w-full gap-2 sm:max-w-md" onsubmit={runSearch}>
				<label class="relative block min-w-0 flex-1"
					><Search
						class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
					/><span class="sr-only">Search students</span><input
						class="border-input bg-background focus:ring-ring h-10 w-full rounded-lg border pr-3 pl-9 text-sm outline-none focus:ring-2"
						bind:value={searchDraft}
						placeholder="Student ID or name"
					/>
				</label>
				<button
					class="bg-primary text-primary-foreground h-10 rounded-lg px-4 text-sm font-semibold"
					type="submit">Search</button
				>
			</form>
		</div>
		{#if !hasSearched}
			<div class="px-5 py-14 text-center">
				<div class="bg-muted mx-auto flex size-11 items-center justify-center rounded-full">
					<Search class="text-muted-foreground size-5" />
				</div>
				<h3 class="mt-3 font-semibold">Search to find a student</h3>
				<p class="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
					No student records are loaded on this page until you search by student ID or name.
				</p>
			</div>
		{:else if visibleStudents.length === 0}
			<div class="px-5 py-14 text-center">
				<h3 class="font-semibold">No matching students</h3>
				<p class="text-muted-foreground mt-1 text-sm">Try a different name or student ID.</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full min-w-[720px] text-left text-sm">
					<thead class="bg-muted/60 text-muted-foreground text-xs tracking-wide uppercase"
						><tr
							><th class="w-10 px-4 py-3 font-medium"
								><span class="sr-only">Select for transfer</span></th
							><th class="px-4 py-3 font-medium">Student</th><th class="px-4 py-3 font-medium"
								>Student ID</th
							><th class="px-4 py-3 font-medium">Grade</th><th class="px-4 py-3 font-medium"
								>Chinese class</th
							>{#if showEslClass}<th class="px-4 py-3 font-medium">ESL class</th>{/if}<th
								class="px-4 py-3 font-medium">Status</th
							><th class="px-4 py-3 text-right font-medium">Actions</th></tr
						></thead
					>
					<tbody class="divide-border divide-y">
						{#each visibleStudents as student (student.id)}
							<tr class="hover:bg-muted/30 transition">
								<td class="px-4 py-3"
									><input
										type="radio"
										name="transfer-student"
										value={student.id}
										bind:group={selectedStudentId}
										disabled={student.status !== 'Active'}
										aria-label="Select {student.chineseName} for transfer"
									/></td
								>
								<td class="px-4 py-3"
									><div class="font-medium">{student.chineseName}</div>
									<div class="text-muted-foreground text-xs">
										{student.englishName ?? 'English name not set'}
									</div></td
								>
								<td class="text-muted-foreground px-4 py-3 font-mono text-xs">{student.id}</td><td
									class="px-4 py-3">Grade {student.grade}</td
								><td class="px-4 py-3">{student.chineseClass}</td>{#if showEslClass}<td
										class="px-4 py-3"
										><span
											class="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800"
											>{student.eslClass}</span
										></td
									>{/if}<td class="px-4 py-3"
									><span
										class="inline-flex items-center gap-1.5 text-xs {student.status === 'Active'
											? 'text-emerald-700'
											: 'text-muted-foreground'}"
										><span
											class="size-1.5 rounded-full {student.status === 'Active'
												? 'bg-emerald-500'
												: 'bg-muted-foreground'}"
										></span>{student.status}</span
									></td
								>
								<td class="px-4 py-3"
									><details class="group relative ml-auto w-fit">
										<summary
											class="hover:bg-muted flex size-8 cursor-pointer list-none items-center justify-center rounded-md"
											aria-label="Actions for {student.chineseName}"
											><MoreHorizontal class="size-4" /></summary
										>
										<div
											class="border-border bg-popover text-popover-foreground absolute right-0 z-20 mt-1 w-48 rounded-lg border p-1 shadow-lg"
										>
											<button
												class="hover:bg-muted w-full rounded px-3 py-2 text-left text-sm"
												onclick={() => openModal('level', student.id)}>Move ESL class</button
											><button
												class="hover:bg-muted w-full rounded px-3 py-2 text-left text-sm"
												onclick={() => openModal('homeroom', student.id)}>Move Chinese class</button
											><button
												class="hover:bg-muted w-full rounded px-3 py-2 text-left text-sm"
												onclick={() => openModal('transfer', student.id)}>Transfer out</button
											>
										</div>
									</details></td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/snippet}

<div class="bg-background text-foreground min-h-screen pb-24">
	<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		<div
			class="border-border mb-6 flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between"
		>
			<div>
				<p class="text-xs font-semibold tracking-[0.16em] text-violet-700 uppercase">
					ESL · Administration
				</p>
				<h1 class="mt-2 text-3xl font-semibold tracking-tight">Students</h1>
				<p class="text-muted-foreground mt-1 text-sm">
					Manage enrollment, ESL class placement, and this year’s roster.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<label class="text-muted-foreground text-xs font-medium" for="prototype-year"
					>School year</label
				><select
					id="prototype-year"
					class="border-input bg-background h-10 rounded-lg border px-3 text-sm"
					><option>2026–27</option><option>2025–26</option></select
				>
			</div>
		</div>

		{#if currentVariant === 'action-first'}
			<!-- Variant A: frequent one-student actions lead; seasonal roster work stays compact. -->
			<div class="space-y-5">
				<div
					class="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<p class="text-muted-foreground text-sm">Keep everyday roster changes quick.</p>
						<h2 class="mt-1 text-lg font-semibold">Student actions</h2>
					</div>
					{@render primaryActions()}
				</div>
				{@render taskCard()}
				{@render rosterTable()}
				{#if transferHistory.length > 0}
					<details class="border-border bg-card rounded-xl border p-4">
						<summary class="cursor-pointer text-sm font-semibold"
							>Recent transfer records · {transferHistory.length}</summary
						>
						<ul class="mt-3 space-y-2">
							{#each transferHistory as transfer, index (transfer.studentId + transfer.date + index)}
								<li
									class="border-border flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2 text-sm"
								>
									<span class="font-medium"
										>{students.find((student) => student.id === transfer.studentId)?.chineseName ??
											transfer.studentId}
										<span class="text-muted-foreground font-normal">({transfer.studentId})</span
										></span
									>
									<span class="text-muted-foreground"
										>Effective {transfer.date}{transfer.reason ? ` · ${transfer.reason}` : ''}</span
									>
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</div>
		{:else if currentVariant === 'roster-workflow'}
			<!-- Variant B: seasonal checklist owns the left rail; the working roster is beside it. -->
			<div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
				<aside class="border-border bg-card h-fit rounded-xl border p-4 shadow-sm">
					<div class="flex items-center gap-2">
						<ClipboardCheck class="size-4 text-violet-700" />
						<h2 class="font-semibold">Yearly roster setup</h2>
					</div>
					<p class="text-muted-foreground mt-1 text-xs">2026–27 · annual checklist</p>
					<ol class="mt-5 space-y-4">
						<li class="flex gap-3">
							<span
								class="flex size-7 shrink-0 items-center justify-center rounded-full {rosterState ===
								'import'
									? 'bg-amber-100 text-amber-800'
									: 'bg-emerald-100 text-emerald-800'}"
								>{#if rosterState === 'import'}1{:else}<Check class="size-4" />{/if}</span
							>
							<div>
								<p class="text-sm font-medium">Import roster</p>
								<p class="text-muted-foreground text-xs">Add or update student records</p>
							</div>
						</li>
						<li class="flex gap-3">
							<span
								class="flex size-7 shrink-0 items-center justify-center rounded-full {rosterState ===
								'confirm'
									? 'bg-sky-100 text-sky-800'
									: rosterState === 'complete'
										? 'bg-emerald-100 text-emerald-800'
										: 'bg-muted text-muted-foreground'}"
								>{#if rosterState === 'complete'}<Check class="size-4" />{:else}2{/if}</span
							>
							<div>
								<p class="text-sm font-medium">Review & confirm</p>
								<p class="text-muted-foreground text-xs">Counts, exceptions, sign-off</p>
							</div>
						</li>
					</ol>
					<div class="border-border mt-5 border-t pt-4">{@render taskCard()}</div>
					<div class="mt-4">{@render primaryActions()}</div>
				</aside>
				<div class="space-y-4">
					{@render rosterTable()}
					<div
						class="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
					>
						<span class="text-foreground font-medium">Frequent actions:</span> use a student’s row menu
						to move their ESL class, update their Chinese class, or record a transfer.
					</div>
				</div>
			</div>
		{:else}
			<!-- Variant C: compact action toolbar, roster task, and an at-a-glance cohort summary. -->
			<div class="space-y-5">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h2 class="text-lg font-semibold">Roster overview</h2>
						<p class="text-muted-foreground text-sm">
							Enrollment activity and yearly readiness in one place.
						</p>
					</div>
					{@render primaryActions()}
				</div>
				{@render taskCard()}
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="border-border bg-card rounded-xl border p-4">
						<div class="text-muted-foreground flex items-center justify-between text-sm">
							<span>Active students</span><Users class="size-4" />
						</div>
						<p class="mt-2 text-2xl font-semibold">184</p>
						<p class="mt-1 text-xs text-emerald-700">+6 since last year</p>
					</div>
					<div class="border-border bg-card rounded-xl border p-4">
						<div class="text-muted-foreground flex items-center justify-between text-sm">
							<span>ESL classes</span><ChevronDown class="size-4" />
						</div>
						<p class="mt-2 text-2xl font-semibold">12</p>
						<p class="text-muted-foreground mt-1 text-xs">Across grades 7–10</p>
					</div>
					<div class="border-border bg-card rounded-xl border p-4">
						<div class="text-muted-foreground flex items-center justify-between text-sm">
							<span>Roster exceptions</span><ClipboardCheck class="size-4" />
						</div>
						<p class="mt-2 text-2xl font-semibold">{rosterState === 'confirm' ? '2' : '0'}</p>
						<p
							class="mt-1 text-xs {rosterState === 'confirm'
								? 'text-rose-700'
								: 'text-muted-foreground'}"
						>
							{rosterState === 'confirm'
								? 'Need an ESL class assignment'
								: 'No exceptions in current view'}
						</p>
					</div>
				</div>
				{@render rosterTable()}
			</div>
		{/if}

		{#if formMessage}<p
				class="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"
				role="status"
			>
				{formMessage}
			</p>{/if}
		{#if rosterState === 'complete'}
			<details class="border-border bg-card mt-5 rounded-xl border p-4">
				<summary class="cursor-pointer text-sm font-semibold"
					>Roster history · 2026–27 confirmed</summary
				>
				<p class="text-muted-foreground mt-2 text-sm">
					Confirmed by Mei Chen on August 18, 2026. This record remains available after the active
					task is cleared.
				</p>
			</details>
		{/if}
		{#if rosterState === 'complete'}
			<section
				class="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
				aria-label="Roster task completed"
				transition:fly={{ y: 24, duration: 320 }}
			>
				<div class="rounded-full bg-emerald-100 p-2"><Check class="size-5" /></div>
				<div class="min-w-0 flex-1">
					<p class="font-semibold">2026–27 roster confirmed</p>
					<p class="text-sm text-emerald-900/75">
						Confirmed by Mei Chen on August 18, 2026 · 184 active students · 12 ESL classes
					</p>
				</div>
				<span class="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold">Complete</span>
			</section>
		{/if}
	</div>
</div>

{#if modal}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) modal = null;
		}}
	>
		<div
			class="border-border bg-card text-card-foreground w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="prototype-dialog-title"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold tracking-wider text-violet-700 uppercase">
						Prototype interaction
					</p>
					<h2 id="prototype-dialog-title" class="mt-1 text-xl font-semibold">
						{modal === 'enroll'
							? 'Enroll a student'
							: modal === 'transfer'
								? 'Transfer student out'
								: modal === 'level'
									? 'Move ESL class'
									: 'Move Chinese class'}
					</h2>
					<p class="text-muted-foreground mt-1 text-sm">
						{modal === 'enroll'
							? 'Add one student to the current year roster.'
							: `Student: ${selectedStudent?.chineseName ?? ''} · ID ${selectedStudent?.id ?? ''}`}
					</p>
				</div>
				<button
					class="text-muted-foreground hover:bg-muted rounded-md p-2"
					aria-label="Close dialog"
					onclick={() => (modal = null)}><X class="size-4" /></button
				>
			</div>
			<form class="mt-5 space-y-4" onsubmit={submitAction}>
				{#if modal === 'enroll'}
					<div class="grid gap-4 sm:grid-cols-2">
						<label class="space-y-1 text-sm font-medium"
							>Student ID <span class="text-rose-600">*</span><input
								class="border-input bg-background h-10 w-full rounded-lg border px-3 font-normal"
								value={studentId}
								oninput={(event) => updateEnrollmentStudentId(event.currentTarget.value)}
								inputmode="numeric"
								placeholder="e.g. 1150001"
								required
							/></label
						><label class="space-y-1 text-sm font-medium"
							>Chinese name <span class="text-rose-600">*</span><input
								class="border-input bg-background h-10 w-full rounded-lg border px-3 font-normal"
								bind:value={chineseName}
								placeholder="中文姓名"
								required
							/></label
						><label class="space-y-1 text-sm font-medium"
							>English name <span class="text-muted-foreground font-normal">Optional</span><input
								class="border-input bg-background h-10 w-full rounded-lg border px-3 font-normal"
								bind:value={englishName}
								placeholder="Add when available"
							/></label
						>
						<div class="space-y-1 text-sm font-medium">
							<span class="block">Grade</span>
							<div
								class="border-input bg-muted/50 text-muted-foreground flex h-10 items-center rounded-lg border px-3 font-normal"
							>
								{#if enrollmentGrade !== null}
									Grade {enrollmentGrade}
								{:else if studentId.trim()}
									Enter a valid student ID
								{:else}
									Enter student ID first
								{/if}
							</div>
						</div>
						<label class="space-y-1 text-sm font-medium"
							>Chinese class <span class="text-rose-600">*</span><select
								class="border-input bg-background h-10 w-full rounded-lg border px-3 font-normal"
								bind:value={chineseClass}
								onchange={() => (eslClass = '')}
								disabled={enrollmentGrade === null}
								required
							>
								<option value="" disabled
									>{enrollmentGrade === null
										? 'Enter student ID first'
										: 'Select existing class'}</option
								>
								{#each chineseClassOptions as className (className)}
									<option value={className}>{className}</option>
								{/each}
							</select></label
						><label class="space-y-1 text-sm font-medium"
							>ESL class <span class="text-rose-600">*</span><select
								class="border-input bg-background h-10 w-full rounded-lg border px-3 font-normal disabled:cursor-not-allowed disabled:opacity-60"
								bind:value={eslClass}
								disabled={!chineseClass || enrollmentGrade === null}
								required
							>
								<option value="" disabled
									>{chineseClass
										? `Select ESL class for ${chineseClass}`
										: 'Select Chinese class first'}</option
								>
								{#each eslClassOptions as className (className)}
									<option value={className}>{className}</option>
								{/each}
							</select>
							{#if chineseClass}<span class="text-muted-foreground text-xs"
									>Options are limited to the ESL band for {chineseClass}.</span
								>{/if}
						</label>
					</div>
				{:else if modal === 'transfer'}
					<label class="block space-y-1 text-sm font-medium"
						>Effective date<input
							type="date"
							class="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3 font-normal"
							bind:value={effectiveDate}
							required
						/></label
					><label class="block space-y-1 text-sm font-medium"
						>Reason <span class="text-muted-foreground font-normal">Optional · free text</span
						><textarea
							class="border-input bg-background mt-1 min-h-24 w-full rounded-lg border p-3 font-normal"
							bind:value={reason}
							placeholder="Add a note about the transfer"></textarea></label
					>
				{:else if modal === 'level'}
					<p class="bg-muted rounded-lg p-3 text-sm">
						Current ESL class: <strong>{selectedStudent?.eslClass}</strong>. Select another class in
						the band for {selectedStudent?.chineseClass}. Chinese class stays unchanged.
					</p>
					<label class="block space-y-1 text-sm font-medium"
						>New ESL class<select
							class="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3 font-normal"
							bind:value={targetEslClass}
						>
							{#each selectedEslClassOptions as className (className)}
								<option value={className}>{className}</option>
							{/each}
						</select></label
					>
				{:else}
					<p class="bg-muted rounded-lg p-3 text-sm">
						Current Chinese class: <strong>{selectedStudent?.chineseClass}</strong>. ESL class stays
						unchanged.
					</p>
					<label class="block space-y-1 text-sm font-medium"
						>New Chinese class<select
							class="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3 font-normal"
							bind:value={targetHomeroom}
						>
							{#each selectedChineseClassOptions as className (className)}
								<option value={className}>{className}</option>
							{/each}
						</select></label
					>
				{/if}
				{#if formMessage}<p
						class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
						role="status"
					>
						{formMessage}
					</p>{/if}
				<div class="border-border flex justify-end gap-2 border-t pt-4">
					<button
						type="button"
						class="border-border hover:bg-muted h-10 rounded-lg border px-4 text-sm font-medium"
						onclick={() => (modal = null)}>Cancel</button
					><button
						class="bg-primary text-primary-foreground h-10 rounded-lg px-4 text-sm font-semibold hover:opacity-90"
						type="submit"
						>{modal === 'enroll'
							? 'Add student'
							: modal === 'transfer'
								? 'Record transfer'
								: 'Save change'}</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if import.meta.env.DEV}
	<div
		class="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-white shadow-xl"
		aria-label="Prototype controls"
	>
		<button
			class="rounded-full p-2 hover:bg-white/15"
			aria-label="Previous layout"
			onclick={() => cycleVariant(-1)}><ChevronLeft class="size-4" /></button
		>
		<div class="px-1 text-center">
			<p class="text-xs font-semibold">{variantLabel}</p>
			<p class="text-[10px] text-slate-300">
				Layout · {rosterState === 'import'
					? 'Import due'
					: rosterState === 'confirm'
						? 'Confirm due'
						: 'Complete'}
			</p>
		</div>
		<button
			class="rounded-full p-2 hover:bg-white/15"
			aria-label="Next layout"
			onclick={() => cycleVariant(1)}><ChevronRight class="size-4" /></button
		>
		<span class="mx-1 hidden h-6 border-l border-slate-700 sm:block"></span>
		<select
			aria-label="Prototype roster state"
			class="max-w-32 rounded-full border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
			value={rosterState}
			onchange={(event) => updateUrl({ roster: event.currentTarget.value as RosterState })}
			><option value="import">Import due</option><option value="confirm">Confirm due</option><option
				value="complete">Completed</option
			></select
		>
	</div>
{/if}
