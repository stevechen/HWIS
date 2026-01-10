<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { api } from '$convex/_generated/api';
	import { useQuery } from 'convex-svelte';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

	const query = useQuery(api.tasks.get, {});

	let { data } = $props();

	// Auth state store
	const auth = useAuth();
	const isLoading = $derived(auth.isLoading);
	const isAuthenticated = $derived(auth.isAuthenticated);

	const currentUserResponse = useQuery(api.auth.getCurrentUser, () =>
		isAuthenticated ? {} : 'skip'
	);
	let user = $derived(currentUserResponse.data);

	// Sign in/up form state
	let showSignIn = $state(true);
	let name = $state('');
	let email = $state('');
	let password = $state('');

	// Handle form submission
	async function handlePasswordSubmit(event: Event) {
		event.preventDefault();

		try {
			if (showSignIn) {
				await authClient.signIn.email(
					{ email, password },
					{
						onError: (ctx) => {
							alert(ctx.error.message);
						}
					}
				);
			} else {
				await authClient.signUp.email(
					{ name, email, password },
					{
						onError: (ctx) => {
							alert(ctx.error.message);
						}
					}
				);
			}
		} catch (error) {
			console.error('Authentication error:', error);
		}
	}

	// Sign out function
	async function signOut() {
		const result = await authClient.signOut();
		if (result.error) {
			console.error('Sign out error:', result.error);
		}
	}

	// Toggle between sign in and sign up
	function toggleSignMode() {
		showSignIn = !showSignIn;
		// Clear form fields when toggling
		name = '';
		email = '';
		password = '';
	}

	// Demo: Fetch access token
	let accessToken = $state<string | null>(null);
	let tokenLoading = $state(false);

	async function fetchToken() {
		tokenLoading = true;
		try {
			const token = await auth.fetchAccessToken({ forceRefreshToken: true });
			accessToken = token;
		} catch (error) {
			console.error('Error fetching access token:', error);
			accessToken = 'Error fetching token';
		} finally {
			tokenLoading = false;
		}
	}
</script>

<div class="flex h-screen flex-col items-center justify-center bg-gray-50">
	{#if isLoading}
		<div class="text-lg text-gray-600">Loading...</div>
	{:else if !isAuthenticated}
		<!-- Sign In Component -->
		<div class="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-md">
			<h2 class="mb-6 text-center text-2xl font-bold text-gray-800">
				{showSignIn ? 'Sign In' : 'Sign Up'}
			</h2>

			<button
				onclick={() => authClient.signIn.social({ provider: 'google' })}
				class="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24">
					<path
						fill="#4285F4"
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					/>
					<path
						fill="#34A853"
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					/>
					<path
						fill="#FBBC05"
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					/>
					<path
						fill="#EA4335"
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					/>
				</svg>
				Sign in with Google
			</button>

			<div class="relative my-4">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-gray-300"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="bg-white px-2 text-gray-500">Or continue with email</span>
				</div>
			</div>

			<form onsubmit={handlePasswordSubmit} class="flex flex-col gap-4">
				{#if !showSignIn}
					<input
						bind:value={name}
						placeholder="Name"
						required
						class="rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				{/if}
				<input
					type="email"
					bind:value={email}
					placeholder="Email"
					required
					class="rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
				<input
					type="password"
					bind:value={password}
					placeholder="Password"
					required
					class="rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
				<button
					type="submit"
					class="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
				>
					{showSignIn ? 'Sign in' : 'Sign up'}
				</button>
			</form>

			<p class="mt-4 text-center text-gray-600">
				{showSignIn ? "Don't have an account? " : 'Already have an account? '}
				<button
					type="button"
					onclick={toggleSignMode}
					class="cursor-pointer border-none bg-transparent text-blue-600 underline hover:text-blue-800"
				>
					{showSignIn ? 'Sign up' : 'Sign in'}
				</button>
			</p>
		</div>
	{:else if isAuthenticated}
		<!-- Dashboard Component -->
		<div class="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-md">
			<div class="mb-4 text-xl font-semibold text-gray-800">
				Hello {user?.name}!
			</div>

			<!-- Demo: Access Token Section -->
			<div class="mb-4 rounded-md bg-gray-50 p-4">
				<h3 class="mb-2 text-sm font-medium text-gray-700">Access Token Demo</h3>
				<button
					onclick={fetchToken}
					disabled={tokenLoading}
					class="cursor-pointer rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					{tokenLoading ? 'Fetching...' : 'Fetch Access Token'}
				</button>
				{#if accessToken}
					<div class="mt-2 rounded border bg-white p-2 text-xs break-all text-gray-600">
						{accessToken.length > 50 ? accessToken.substring(0, 50) + '...' : accessToken}
					</div>
				{/if}
			</div>

			<button
				onclick={signOut}
				class="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
			>
				Sign out
			</button>
		</div>

		{#if query.isLoading}
			Loading...
		{:else if query.error}
			failed to load: {query.error.toString()}
		{:else}
			<ul>
				{#each query.data as task}
					<li>
						{task.isCompleted ? '☑' : '☐'}
						<span>{task.text}</span>
						<span>assigned by {task.assigner}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
