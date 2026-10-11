<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { humanConvexErrorMessage } from '$lib/convex-error';
	import { semesterStatus } from '$lib/esl-semesters';
	import SemesterStatusChip from '$lib/components/esl/SemesterStatusChip.svelte';
	import SemesterForm, { type SemesterCreateInput } from '$lib/components/esl/SemesterForm.svelte';

	const client = useConvexClient();

	const semestersQuery = useQuery(api.esl.semesters.list, () => ({}));
	const semesters = $derived(semestersQuery.data ?? []);

	// Lexical `YYYY-MM-DD` compare, the same rule the backend uses — never a
	// wall-clock read inside a query, and the same string on the client.
	const today = new Date().toISOString().slice(0, 10);

	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state('');

	function createSemester(input: SemesterCreateInput) {
		busy = true;
		error = null;
		client
			.mutation(api.esl.semesters.create, input)
			.then(() => {
				notice = `${input.year} ${input.term} created — add its exam days to pin the end.`;
			})
			.catch((cause: unknown) => {
				error = humanConvexErrorMessage(cause);
			})
			.finally(() => {
				busy = false;
			});
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<div>
		<h1 data-testid="esl-admin-semesters.title" class="text-2xl font-bold text-emerald-900">
			Semesters
		</h1>
		<p class="text-muted-foreground mt-2">
			S1 anchors on its start date and S2 can be created any time — early planning is never blocked.
			Each semester's end derives from its final-exam events.
		</p>
	</div>

	<SemesterForm {busy} {error} onsubmit={createSemester} />

	{#if notice}
		<p
			data-testid="esl-admin-semesters.notice"
			class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
		>
			{notice}
		</p>
	{/if}

	{#if semestersQuery.isLoading}
		<p data-testid="esl-admin-semesters.loading" class="text-muted-foreground py-8 text-center">
			Loading semesters…
		</p>
	{:else if semesters.length === 0}
		<p
			data-testid="esl-admin-semesters.empty"
			class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
		>
			No semesters yet. Create S1 above to anchor the term.
		</p>
	{:else}
		<ul data-testid="esl-admin-semesters.list" class="space-y-2">
			{#each semesters as semester (semester._id)}
				<li class="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4 shadow-sm">
					<a
						href={`/esl/admin/semesters/${semester._id}`}
						data-testid="esl-admin-semesters.row"
						class="text-base font-semibold text-emerald-900 hover:underline"
					>
						{semester.year}
						{semester.term}
					</a>
					<SemesterStatusChip status={semesterStatus(semester, today)} />
					<span class="text-sm text-gray-600">
						Starts {semester.startDate} ·
						{semester.derivedEnd === null ? 'Finals TBD' : `Ends ${semester.derivedEnd}`}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
