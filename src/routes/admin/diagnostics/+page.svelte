<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { useViewer } from '$lib/viewer.svelte';

	const session = useViewer();
	const isSuper = $derived(session.viewer?.role === 'super');

	const client = useConvexClient();
	const status = useQuery(api.students.getSystemStatus, {});
	const divergences = useQuery(api.students.getCanaryDivergences, {});

	let toggling = $state(false);
	let checking = $state(false);

	async function toggleCanary(next: boolean) {
		toggling = true;
		try {
			await client.mutation(api.students.setShadowCompare, { enabled: next });
		} catch (err) {
			console.error('Failed to toggle shadow canary', err);
		} finally {
			toggling = false;
		}
	}

	async function runCheck() {
		checking = true;
		try {
			await client.mutation(api.students.runCanaryCheckNow, {});
		} catch (err) {
			console.error('Failed to run canary check', err);
		} finally {
			checking = false;
		}
	}
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
			<div class="bg-muted rounded p-4">
				<div class="flex items-center justify-between gap-4">
					<div>
						<div class="text-sm font-medium">Shadow canary (legacy vs index divergence alarm)</div>
						<div class="text-muted-foreground text-xs">
							When on, ~10% of students-list queries are double-checked against the legacy path.
							Divergences appear in the deployment logs as <code>[shadow-compare]</code>.
						</div>
					</div>
					<label class="flex shrink-0 items-center gap-2 text-sm">
						<input
							type="checkbox"
							class="size-4"
							checked={d.environment.canaryEnabled}
							disabled={toggling}
							onchange={(e) => toggleCanary(e.currentTarget.checked)}
						/>
						{d.environment.canaryEnabled ? 'Enabled' : 'Disabled'}
					</label>
				</div>
				{#if d.environment.canaryEnvOverride}
					<p class="mt-2 text-xs text-amber-600">
						Note: CONVEX_SHADOW_COMPARE env is also set — the canary is force-enabled regardless of
						this switch.
					</p>
				{/if}
				<pre class="bg-background mt-3 overflow-x-auto rounded p-3 text-xs">{JSON.stringify(
						d.environment,
						null,
						2
					)}</pre>
			</div>
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

		<!-- Recorded divergences -->
		<section class="mt-8">
			<h2 class="mb-2 text-lg font-semibold">Recorded pagination divergences</h2>
			<p class="text-muted-foreground text-xs">
				A background checker (every 30 min) and the button below run the legacy-vs-index parity
				matrix and record any disagreement here durably — so divergences show even when this page is
				closed.
			</p>
			<button
				class="bg-primary text-primary-foreground mt-3 rounded px-3 py-2 text-sm disabled:opacity-50"
				disabled={checking}
				onclick={runCheck}
			>
				{checking ? 'Running…' : 'Run check now'}
			</button>

			{#if divergences.error}
				<p class="text-destructive mt-3 text-xs">Error: {divergences.error.message}</p>
			{:else if !divergences.data}
				<p class="text-muted-foreground mt-3 text-xs">Loading…</p>
			{:else}
				<p class="text-muted-foreground mt-3 text-xs">
					Last checked: {divergences.data.lastRunAt
						? new Date(divergences.data.lastRunAt).toLocaleString()
						: 'never'}
					· {divergences.data.total} divergence{divergences.data.total === 1 ? '' : 's'} recorded
				</p>
				{#if divergences.data.total === 0}
					<p class="mt-3 text-sm font-medium text-emerald-600">
						No divergences recorded — paths agree.
					</p>
				{:else}
					<table class="mt-3 w-full border-collapse text-xs">
						<thead>
							<tr class="border-b text-left">
								<th class="p-2">Detected</th>
								<th class="p-2">Args</th>
								<th class="p-2">Legacy</th>
								<th class="p-2">Indexed</th>
								<th class="p-2">Note</th>
							</tr>
						</thead>
						<tbody>
							{#each divergences.data.divergences as combo (combo._id)}
								<tr class="border-b">
									<td class="p-2">{new Date(combo.detectedAt).toLocaleString()}</td>
									<td class="p-2 font-mono">{combo.label}</td>
									<td class="p-2">{combo.legacyCount}</td>
									<td class="p-2">{combo.indexedCount}</td>
									<td class="p-2">{combo.note ?? ''}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			{/if}
		</section>
	{/if}
</div>
