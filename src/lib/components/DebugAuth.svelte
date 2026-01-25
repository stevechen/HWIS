<script lang="ts">
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { onMount } from 'svelte';

	const auth = useAuth();

	let isOpen = $state(false);
	let cookies = $state('');

	onMount(() => {
		cookies = document.cookie;
	});

	function deleteCookie(name: string) {
		document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
	}

	function clearCookies() {
		const cookies = document.cookie.split(';');
		for (let i = 0; i < cookies.length; i++) {
			const cookie = cookies[i];
			const eqPos = cookie.indexOf('=');
			const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
			deleteCookie(name.trim());
		}
		window.location.reload();
	}

	function toggle() {
		isOpen = !isOpen;
	}
</script>

<div class="fixed right-4 bottom-4 z-50 font-mono text-xs">
	{#if isOpen}
		<div class="mb-2 w-96 rounded border border-gray-300 bg-white p-4 shadow-lg">
			<div class="mb-2 flex items-center justify-between border-b pb-2">
				<h3 class="font-bold">Auth Debugger</h3>
				<button onclick={toggle} class="text-gray-500 hover:text-gray-700">✕</button>
			</div>

			<div class="space-y-2">
				<div>
					<span class="font-bold">Loading:</span>
					{auth.isLoading}
				</div>
				<div>
					<span class="font-bold">Authenticated:</span>
					{auth.isAuthenticated}
				</div>
				<div>
					<span class="font-bold">Route:</span>
					{page.url.pathname}
				</div>

				<div class="border-t pt-2">
					<div class="font-bold">Cookies:</div>
					<div class="break-all text-gray-600">{cookies}</div>
				</div>

				<div class="border-t pt-2">
					<div class="font-bold">Environment:</div>
					<div>DEV: {import.meta.env.DEV}</div>
					<div>SSR: {import.meta.env.SSR}</div>
				</div>

				<div class="border-t pt-2">
					<button
						onclick={clearCookies}
						class="w-full rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300"
					>
						Clear Cookies & Reload
					</button>
				</div>
			</div>
		</div>
	{/if}

	<button
		onclick={toggle}
		class="rounded-full bg-red-600 px-3 py-1 text-white shadow hover:bg-red-700"
	>
		{isOpen ? 'Close Debug' : '🐞 Debug Auth'}
	</button>
</div>
