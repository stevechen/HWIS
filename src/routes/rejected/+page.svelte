<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let cookieTestMode = $state(false);

	$effect(() => {
		if (!browser) return;
		cookieTestMode =
			document.cookie.split('; ').find((row) => row.startsWith('hwis_test_auth=')) !== undefined;
	});

	async function signOut() {
		if (cookieTestMode) {
			document.cookie = 'hwis_test_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
		}
		void goto('/login');
	}
</script>

<div class="flex h-screen flex-col items-center justify-center bg-gray-50 p-4">
	<div class="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-md">
		<h2 class="mb-2 text-center text-2xl font-bold text-red-600">Access Denied</h2>

		<p class="text-center text-gray-700">
			Your email domain is not authorized to access this system.
		</p>

		<p class="text-center text-sm text-gray-500">
			This system is exclusively for Hong Wen International School (HWIS) staff. Please use your
			school email account (@hwhs.tc.edu.tw) to sign in.
		</p>

		<div class="mt-4 flex flex-col gap-3">
			<button
				onclick={signOut}
				class="flex w-full items-center justify-center rounded-md bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none"
			>
				Sign out
			</button>

			<a
				href="https://hwhs.tc.edu.tw"
				target="_blank"
				rel="noopener noreferrer"
				class="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			>
				Visit HWIS Website
			</a>
		</div>
	</div>
</div>
