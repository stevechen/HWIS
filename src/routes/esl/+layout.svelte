<script lang="ts">
	import { goto } from '$app/navigation';
	import { setContext, type Snippet } from 'svelte';
	import { useViewer } from '$lib/viewer.svelte';

	let { children }: { children: Snippet } = $props();

	const session = useViewer();

	const loaded = $derived(session.status !== 'loading' && session.status !== 'signedOut');
	const allowed = $derived(session.status === 'active' && session.isEslStaff);

	setContext('eslAuth', {
		get loaded() {
			return loaded;
		},
		get allowed() {
			return allowed;
		}
	});

	$effect(() => {
		if (loaded && !allowed) {
			goto('/');
		}
	});
</script>

{#if !loaded}
	<div class="flex min-h-screen items-center justify-center">
		<div
			class="border-primary/20 border-b-primary size-8 animate-spin rounded-full border-4"
			role="status"
			aria-label="Loading"
		></div>
	</div>
{:else if allowed}
	<div class="min-h-screen bg-emerald-50/60">
		<nav
			aria-label="ESL department"
			data-testid="esl.nav"
			class="border-b border-emerald-900 bg-emerald-700 text-white"
		>
			<div class="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4">
				<span
					data-testid="esl.nav-badge"
					class="mr-2 rounded bg-white px-2 py-0.5 text-xs font-bold tracking-wide text-emerald-900"
					>ESL</span
				>
				<a
					href="/esl/schedule"
					data-testid="esl.nav.schedule"
					class="rounded px-3 py-1.5 text-sm font-medium hover:bg-white/15">Schedule</a
				>
				<a
					href="/esl/schedule/calendar"
					data-testid="esl.nav.calendar"
					class="rounded px-3 py-1.5 text-sm font-medium hover:bg-white/15">Calendar</a
				>
				<a
					href="/esl/slips"
					data-testid="esl.nav.slips"
					class="rounded px-3 py-1.5 text-sm font-medium hover:bg-white/15">Slips</a
				>
				<a
					href="/esl/zipgrade"
					data-testid="esl.nav.zipgrade"
					class="rounded px-3 py-1.5 text-sm font-medium hover:bg-white/15">ZipGrade</a
				>
				{#if session.isEslAdmin}
					<a
						href="/esl/admin"
						data-testid="esl.nav.admin"
						class="rounded px-3 py-1.5 text-sm font-medium hover:bg-white/15">Admin</a
					>
				{/if}
			</div>
		</nav>
		{@render children()}
	</div>
{/if}
