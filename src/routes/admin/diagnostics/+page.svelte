<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { useViewer } from '$lib/viewer.svelte';

	const session = useViewer();
	const isSuper = $derived(session.viewer?.role === 'super');

	const status = useQuery(api.students.getSystemStatus, {});
</script>

<div class="mx-auto max-w-5xl p-8">
	<h1 class="text-2xl font-bold">System Diagnostics</h1>
	<p class="text-muted-foreground mt-1 text-sm">
		Technical heartbeat. Super-admin only. Not pretty, just useful.
	</p>

	{#if !isSuper}
		<p class="border-destructive/50 text-destructive mt-8 rounded border p-4">
			Forbidden: Super role required.
		</p>
	{:else if status.error}
		<p class="border-destructive/50 text-destructive mt-8 rounded border p-4">
			Error: {status.error.message}
		</p>
	{:else if !status.data}
		<p class="mt-8 text-sm">Loading status…</p>
	{:else}
		{@const d = status.data}
		<!-- Environment -->
		<section class="mt-8">
			<h2 class="mb-2 text-lg font-semibold">Environment</h2>
			<pre class="bg-muted overflow-x-auto rounded p-3 text-xs">{JSON.stringify(
					d.environment,
					null,
					2
				)}</pre>
		</section>

		<!-- Counts -->
		<section class="mt-8">
			<h2 class="mb-2 text-lg font-semibold">Student counts</h2>
			<pre class="bg-muted overflow-x-auto rounded p-3 text-xs">{JSON.stringify(
					d.counts,
					null,
					2
				)}</pre>
		</section>
	{/if}
</div>
