<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import { api } from '$convex/_generated/api';
	import { useQuery } from 'convex-svelte';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { browser } from '$app/environment';

	const query = useQuery(api.tasks.get, {});

	const auth = useAuth();
	const isLoading = $derived(auth.isLoading);
	const isAuthenticated = $derived(auth.isAuthenticated);
	const authDetermined = $derived(!isLoading);

	$effect(() => {
		if (!browser || !authDetermined) return;

		if (!isAuthenticated) {
			goto('/login', { replaceState: true });
		}
	});

	const currentUserResponse = useQuery(api.auth.getCurrentUser, () =>
		isAuthenticated ? {} : 'skip'
	);
	let user = $derived(currentUserResponse.data);

	async function signOut() {
		const result = await authClient.signOut();
		if (result.error) {
			console.error('Sign out error:', result.error);
		}
	}
</script>

{#if !authDetermined}
	<div class="flex h-screen items-center justify-center bg-gray-50">
		<div class="text-lg text-gray-600">Loading...</div>
	</div>
{:else if !isAuthenticated}
	<div class="flex h-screen items-center justify-center bg-gray-50">
		<div class="text-lg text-gray-600">Redirecting...</div>
	</div>
{:else}
	<div class="flex h-screen flex-col items-center bg-gray-50 p-4">
		<header class="mb-6 flex w-full max-w-2xl items-center justify-between">
			<h1 class="text-2xl font-bold text-gray-800">Homework Tracker</h1>
			<div class="flex items-center gap-4">
				{#if user}
					<span class="text-gray-600">{user.name}</span>
				{/if}
				<button
					onclick={signOut}
					class="rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none"
				>
					Sign out
				</button>
			</div>
		</header>

		<main class="w-full max-w-2xl">
			{#if query.isLoading}
				<div class="text-center text-gray-600">Loading tasks...</div>
			{:else if query.error}
				<div class="rounded-md bg-red-50 p-4 text-red-600">
					Failed to load tasks: {query.error.toString()}
				</div>
			{:else if query.data.length === 0}
				<div class="rounded-lg bg-white p-8 text-center shadow-md">
					<p class="text-gray-600">No tasks yet.</p>
				</div>
			{:else}
				<ul class="space-y-3">
					{#each query.data as task}
						<li class="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
							<span class="text-xl">{task.isCompleted ? '☑' : '☐'}</span>
							<span class="flex-1 text-gray-800">{task.text}</span>
							<span class="text-sm text-gray-500">by {task.assigner}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</main>
	</div>
{/if}
