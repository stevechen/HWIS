<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	// Environment detection
	type Environment = 'local-dev' | 'local-prod' | 'cloud-dev' | 'cloud-prod' | 'unknown';

	function detectEnvironment(): Environment {
		if (!browser) return 'unknown';

		const convexUrl = import.meta.env.PUBLIC_CONVEX_URL || '';
		const hostname = window.location.hostname;

		// Frontend detection
		const isLocalFrontend = hostname === 'localhost';

		// Convex backend detection
		if (convexUrl.includes('127.0.0.1:3210')) return 'local-dev';
		if (convexUrl.includes('127.0.0.1:3211')) return 'local-prod';
		if (convexUrl.includes('cool-buffalo-717')) return 'cloud-dev';
		if (convexUrl.includes('giddy-tapir-550')) return 'cloud-prod';

		return 'unknown';
	}

	function getEnvironmentDisplay(env: Environment) {
		const displays = {
			'local-dev': 'Local Frontend + Local Convex Dev',
			'local-prod': 'Local Frontend + Local Convex Production',
			'cloud-dev': 'Local Frontend + Cloud Convex Development',
			'cloud-prod': 'Vercel Frontend + Cloud Convex Production',
			unknown: 'Unknown Environment'
		};
		return displays[env] || 'Unknown Environment';
	}

	function getEnvironmentColor(env: Environment) {
		const colors = {
			'local-dev': 'text-blue-600',
			'local-prod': 'text-orange-600',
			'cloud-dev': 'text-green-600',
			'cloud-prod': 'text-purple-600',
			unknown: 'text-gray-600'
		};
		return colors[env] || 'text-gray-600';
	}

	// Test results state
	interface TestResult {
		status: 'pending' | 'testing' | 'success' | 'error';
		message: string;
		latency?: number;
	}

	let testResults = $state<{
		connection: TestResult;
		auth: TestResult;
		roleAccess: TestResult;
		overall: 'pending' | 'testing' | 'success' | 'error';
	}>({
		connection: { status: 'pending', message: 'Not tested yet' },
		auth: { status: 'pending', message: 'Not tested yet' },
		roleAccess: { status: 'pending', message: 'Not tested yet' },
		overall: 'pending'
	});

	// Environment info
	let environment: Environment = 'unknown';
	let environmentInfo = $state({
		frontend: '',
		convex: '',
		convexUrl: '',
		siteUrl: '',
		isTestMode: false
	});

	// Test functions
	async function testConnection(): Promise<void> {
		testResults.connection = { status: 'testing', message: 'Testing Convex connection...' };

		try {
			const startTime = Date.now();
			// Try to fetch a simple endpoint to test connection
			const response = await fetch('/api/ping', { method: 'HEAD' });
			const latency = Date.now() - startTime;

			testResults.connection = {
				status: 'success',
				message: `Connected successfully (${latency}ms)`,
				latency
			};
		} catch (error: any) {
			testResults.connection = {
				status: 'error',
				message: `Connection failed: ${error?.message || 'Unknown error'}`
			};
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
		checkOverallStatus();
	}

	async function testAuthEndpoints(): Promise<void> {
		testResults.auth = { status: 'testing', message: 'Testing auth endpoints...' };

		try {
			const response = await fetch('/api/auth/get-session');
			const data = await response.json();

			testResults.auth = {
				status: 'success',
				message: 'Auth endpoint accessible'
			};
		} catch (error: any) {
			testResults.auth = {
				status: 'error',
				message: `Auth endpoint failed: ${error?.message || 'Unknown error'}`
			};
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
		checkOverallStatus();
	}

	async function testRoleBasedAccess(): Promise<void> {
		testResults.roleAccess = { status: 'testing', message: 'Testing role-based access...' };

		try {
			// Test admin access by trying to access users endpoint
			const adminResponse = await fetch('/api/users/viewer');

			if (adminResponse.ok) {
				testResults.roleAccess = {
					status: 'success',
					message: 'Role-based access working'
				};
			} else {
				testResults.roleAccess = {
					status: 'error',
					message: 'Role-based access failed'
				};
			}
		} catch (error: any) {
			testResults.roleAccess = {
				status: 'error',
				message: `Role-based test failed: ${error?.message || 'Unknown error'}`
			};
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
		checkOverallStatus();
	}

	function checkOverallStatus(): void {
		const allTests = [
			testResults.connection.status,
			testResults.auth.status,
			testResults.roleAccess.status
		];

		const successCount = allTests.filter((status) => status === 'success').length;
		const errorCount = allTests.filter((status) => status === 'error').length;

		if (errorCount > 0) {
			testResults.overall = 'error';
		} else if (successCount === allTests.length) {
			testResults.overall = 'success';
		}
	}

	async function runAllTests(): Promise<void> {
		await testConnection();
		await testAuthEndpoints();
		await testRoleBasedAccess();
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'success':
				return 'text-green-600';
			case 'error':
				return 'text-red-600';
			case 'testing':
				return 'text-yellow-600';
			default:
				return 'text-gray-600';
		}
	}

	function getStatusIcon(status: string): string {
		switch (status) {
			case 'success':
				return '✅';
			case 'error':
				return '❌';
			case 'testing':
				return '🔄';
			default:
				return '❓';
		}
	}

	onMount(() => {
		environment = detectEnvironment();

		// Update environment info
		environmentInfo = {
			frontend: window.location.origin,
			convex: environment,
			convexUrl: import.meta.env.PUBLIC_CONVEX_URL || 'Not set',
			siteUrl: import.meta.env.VITE_SITE_URL || 'Not set',
			isTestMode:
				document.cookie.includes('hwis_test_auth') ||
				document.cookie.includes('convex_session_token')
		};
	});
</script>

<div class="mx-auto max-w-6xl p-8">
	<h1 class="mb-8 text-center text-3xl font-bold">🔐 Authentication Testing Dashboard</h1>

	<!-- Environment Status Panel -->
	<div class="mb-8 rounded-lg bg-white p-6 shadow-md">
		<h2 class="mb-4 text-xl font-semibold">Environment Status</h2>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="space-y-2">
				<h3 class="text-lg font-medium text-gray-700">Current Environment</h3>
				<p class="text-2xl font-bold {getEnvironmentColor(environment)}">
					{getEnvironmentDisplay(environment)}
				</p>
			</div>

			<div class="space-y-2">
				<h3 class="text-lg font-medium text-gray-700">Configuration Details</h3>
				<div class="space-y-1 font-mono text-sm">
					<p><strong>Frontend:</strong> {environmentInfo.frontend}</p>
					<p><strong>Convex:</strong> {environmentInfo.convex}</p>
					<p><strong>Convex URL:</strong> {environmentInfo.convexUrl}</p>
					<p><strong>Site URL:</strong> {environmentInfo.siteUrl}</p>
					<p><strong>Test Mode:</strong> {environmentInfo.isTestMode ? 'Active' : 'Inactive'}</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Test Results Panel -->
	<div class="mb-8 rounded-lg bg-white p-6 shadow-md">
		<div class="mb-6 flex items-center justify-between">
			<h2 class="text-xl font-semibold">Authentication Tests</h2>
			<button
				onclick={runAllTests}
				class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
			>
				Run All Tests
			</button>
		</div>

		<div class="space-y-4">
			<!-- Connection Test -->
			<div
				class="rounded-lg border p-4 {testResults.connection.status === 'error'
					? 'border-red-200 bg-red-50'
					: testResults.connection.status === 'success'
						? 'border-green-200 bg-green-50'
						: 'border-gray-200'}"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center space-x-3">
						<span class="text-lg font-medium">Connection Test</span>
						<span class={getStatusColor(testResults.connection.status)}>
							{getStatusIcon(testResults.connection.status)}
						</span>
					</div>
					{#if testResults.connection.latency}
						<span class="text-sm text-gray-600">Latency: {testResults.connection.latency}ms</span>
					{/if}
				</div>
				<p class="mt-2 text-sm {getStatusColor(testResults.connection.status)}">
					{testResults.connection.message}
				</p>
			</div>

			<!-- Auth Endpoint Test -->
			<div
				class="rounded-lg border p-4 {testResults.auth.status === 'error'
					? 'border-red-200 bg-red-50'
					: testResults.auth.status === 'success'
						? 'border-green-200 bg-green-50'
						: 'border-gray-200'}"
			>
				<div class="flex items-center space-x-3">
					<span class="text-lg font-medium">Auth Endpoint Test</span>
					<span class={getStatusColor(testResults.auth.status)}>
						{getStatusIcon(testResults.auth.status)}
					</span>
				</div>
				<p class="mt-2 text-sm {getStatusColor(testResults.auth.status)}">
					{testResults.auth.message}
				</p>
			</div>

			<!-- Role-Based Access Test -->
			<div
				class="rounded-lg border p-4 {testResults.roleAccess.status === 'error'
					? 'border-red-200 bg-red-50'
					: testResults.roleAccess.status === 'success'
						? 'border-green-200 bg-green-50'
						: 'border-gray-200'}"
			>
				<div class="flex items-center space-x-3">
					<span class="text-lg font-medium">Role-Based Access Test</span>
					<span class={getStatusColor(testResults.roleAccess.status)}>
						{getStatusIcon(testResults.roleAccess.status)}
					</span>
				</div>
				<p class="mt-2 text-sm {getStatusColor(testResults.roleAccess.status)}">
					{testResults.roleAccess.message}
				</p>
			</div>
		</div>

		<!-- Overall Status -->
		<div
			class="mt-6 rounded-lg p-4 {testResults.overall === 'error'
				? 'border-red-200 bg-red-50'
				: testResults.overall === 'success'
					? 'border-green-200 bg-green-50'
					: 'border-gray-200'}"
		>
			<div class="flex items-center space-x-3">
				<span class="text-xl font-bold">Overall Status</span>
				<span class="text-2xl {getStatusColor(testResults.overall)}">
					{getStatusIcon(testResults.overall)}
				</span>
			</div>
			{#if testResults.overall === 'success'}
				<p class="mt-2 text-sm text-green-700">✅ All authentication systems working correctly!</p>
			{:else if testResults.overall === 'error'}
				<p class="mt-2 text-sm text-red-700">
					❌ Some authentication tests failed. See details above.
				</p>
			{:else}
				<p class="mt-2 text-sm text-gray-700">Run tests to check authentication system status.</p>
			{/if}
		</div>
	</div>

	<!-- Environment Switching Guide -->
	<div class="rounded-lg bg-white p-6 shadow-md">
		<h2 class="mb-4 text-xl font-semibold">Environment Switching</h2>
		<p class="mb-4 text-gray-700">Use these commands to switch between environments:</p>

		<div class="space-y-2 font-mono text-sm">
			<div class="rounded bg-blue-50 p-3">
				<code>./switch-to-local-dev.sh && ./start-local-convex.sh && bun run dev</code>
				<p class="mt-1 text-xs text-gray-600">Local Frontend + Local Convex Dev</p>
			</div>

			<div class="rounded bg-orange-50 p-3">
				<code>./switch-to-local-prod.sh && ./start-local-convex-prod.sh && bun run dev</code>
				<p class="mt-1 text-xs text-gray-600">Local Frontend + Local Convex Production</p>
			</div>

			<div class="rounded bg-green-50 p-3">
				<code>./switch-to-cloud-dev.sh && bun run dev</code>
				<p class="mt-1 text-xs text-gray-600">Local Frontend + Cloud Convex Development</p>
			</div>

			<div class="rounded bg-purple-50 p-3">
				<code>bun deploy && then visit /test-auth</code>
				<p class="mt-1 text-xs text-gray-600">Vercel Frontend + Cloud Convex Production</p>
			</div>
		</div>
	</div>
</div>
