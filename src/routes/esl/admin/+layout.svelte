<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { setContext, type Snippet } from 'svelte';
	import { useViewer } from '$lib/viewer.svelte';

	let { children }: { children: Snippet } = $props();

	const session = useViewer();

	const loaded = $derived(session.status !== 'loading' && session.status !== 'signedOut');
	// Mirrors the backend's `requireEslAdmin`: an active session holding the
	// department's admin role (Super passes via the shared policy).
	const allowed = $derived(session.status === 'active' && session.isEslAdmin);

	const sections = [
		{ href: '/esl/admin', testId: 'esl-admin.nav.overview', label: 'Overview' },
		{ href: '/esl/admin/classes', testId: 'esl-admin.nav.classes', label: 'Classes' },
		{ href: '/esl/admin/students', testId: 'esl-admin.nav.students', label: 'Students' },
		{ href: '/esl/admin/users', testId: 'esl-admin.nav.users', label: 'Users' }
	] as const;

	setContext('eslAdminAuth', {
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
			aria-label="ESL administration"
			data-testid="esl-admin.nav"
			class="border-b border-emerald-200 bg-white"
		>
			<div class="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4">
				<span
					data-testid="esl-admin.nav-badge"
					class="mr-2 rounded bg-emerald-700 px-2 py-0.5 text-xs font-bold tracking-wide text-white"
					>Admin</span
				>
				{#each sections as section (section.href)}
					{@const active = page.url.pathname === section.href}
					<a
						href={section.href}
						data-testid={section.testId}
						aria-current={active ? 'page' : undefined}
						class="rounded px-3 py-1.5 text-sm font-medium {active
							? 'bg-emerald-100 text-emerald-900'
							: 'text-emerald-800 hover:bg-emerald-50'}">{section.label}</a
					>
				{/each}
				<a
					href="/esl"
					data-testid="esl-admin.nav.back"
					class="ml-auto rounded px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
					>Back to ESL</a
				>
			</div>
		</nav>
		{@render children()}
	</div>
{/if}
