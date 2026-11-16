<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { semesterStatus, semesterSlug } from '$lib/esl-semesters';
	import SemesterStatusChip from '$lib/components/esl/SemesterStatusChip.svelte';
	import { getContext } from 'svelte';

	const semestersQuery = useQuery(api.esl.semesters.list, () => ({}));
	const semesters = $derived(semestersQuery.data ?? []);

	// Lexical `YYYY-MM-DD` compare, the same rule the backend uses — never a
	// wall-clock read inside a query, and the same string on the client.
	// Use context for test determinism (SvelteKit pages can't accept arbitrary props).
	const TODAY_KEY = 'esl-admin.today';
	const today = $state<string>(
		(getContext(TODAY_KEY) as string | undefined) ?? new Date().toISOString().slice(0, 10)
	);

	// The list is the page; the create card appears only when asked for.
	let createOpen = $state(false);
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<div>
		<h1
			data-testid="esl-admin-semesters.title"
			class="text-2xl font-bold text-emerald-900 dark:text-emerald-100"
		>
			Semesters
		</h1>
		<p class="text-muted-foreground mt-2">
			S1 anchors on its start date and S2 can be created any time — early planning is never blocked.
			Each semester's end derives from its final-exam events.
		</p>
	</div>

	{#if semestersQuery.isLoading}
		<p data-testid="esl-admin-semesters.loading" class="text-muted-foreground py-8 text-center">
			Loading semesters…
		</p>
	{:else if semesters.length === 0}
		<p
			data-testid="esl-admin-semesters.empty"
			class="text-muted-foreground bg-card rounded-lg border border-dashed py-12 text-center"
		>
			No semesters yet — create one below.
		</p>
	{:else}
		<ul data-testid="esl-admin-semesters.list" class="space-y-2">
			{#each semesters as semester (semester._id)}
				<li class="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-4 shadow-sm">
					<a
						href={`/esl/admin/semesters/${semesterSlug(semester)}`}
						data-testid="esl-admin-semesters.row"
						class="text-base font-semibold text-emerald-900 hover:underline dark:text-emerald-100"
					>
						{semester.year}
						{semester.term}
					</a>
					<SemesterStatusChip status={semesterStatus(semester, today)} />
					<span class="text-muted-foreground text-sm">
						Starts {semester.startDate} ·
						{semester.derivedEnd === null ? 'Finals TBD' : `Ends ${semester.derivedEnd}`}
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<button
		type="button"
		onclick={() => (createOpen = !createOpen)}
		data-testid="esl-admin-semesters.create-toggle"
		class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
	>
		Create semester
	</button>

	{#if createOpen}
		<!-- Two ways in (ticket #230): the wizard is the primary method. -->
		<section
			data-testid="esl-admin-semesters.create"
			class="bg-card space-y-4 rounded-lg border p-6"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-emerald-900 dark:text-emerald-100">New semester</h2>
				<button
					type="button"
					onclick={() => (createOpen = false)}
					data-testid="esl-admin-semesters.create-close"
					aria-label="Close"
					class="text-muted-foreground hover:text-foreground"
				>
					×
				</button>
			</div>
			<div class="grid gap-4 md:grid-cols-2">
				<div
					class="flex flex-col gap-2 rounded-lg border-2 border-emerald-600 bg-emerald-50 p-6 dark:bg-emerald-950/30"
				>
					<div class="flex items-center justify-between">
						<h3 class="text-base font-semibold text-emerald-900 dark:text-emerald-100">
							Use the setup wizard
						</h3>
						<span class="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
							Recommended
						</span>
					</div>
					<p class="text-foreground text-sm">
						Set the semester start and days off, place exams, then schedule quizzes, dues and checks
						block by block — a live calendar shows every choice.
					</p>
					<a
						href="/esl/admin/semesters/new/wizard"
						data-testid="esl-admin-semesters.wizard-link"
						class="mt-auto inline-flex w-fit items-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
					>
						Continue to wizard →
					</a>
				</div>

				<div class="bg-card flex flex-col gap-2 rounded-lg border p-6">
					<h3 class="text-foreground text-base font-semibold">Import from Excel/CSV</h3>
					<p class="text-foreground text-sm">
						Have a workbook with all the date lists already? Upload it once and the semester is set
						up for you.
					</p>
					<button
						type="button"
						disabled
						data-testid="esl-admin-semesters.import-link"
						title="Not built yet"
						class="text-muted-foreground cursor-default text-sm font-medium"
					>
						Coming soon
					</button>
				</div>
			</div>
		</section>
	{/if}
</div>
