<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import {
		Database,
		GraduationCap,
		Users,
		FileText,
		Tags,
		ShieldAlert,
		CloudBackup,
		History,
		Settings,
		ChevronDown,
		ChevronRight
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	let {
		data
	}: {
		data: { testRole?: 'teacher' | 'admin' | 'super' };
	} = $props();

	const isTestMode = $derived(!!data.testRole);
	const client = useConvexClient();

	const user = useQuery(api.users.viewer, () => ({
		testToken: isTestMode ? 'test-token-admin-mock' : undefined
	}));

	let seeding = $state(false);
	let seedMessage = $state('');
	let showSettings = $state(false);

	async function handleSeed() {
		seeding = true;
		seedMessage = 'Seeding data...';
		try {
			await client.mutation(api.categories.seed, {
				testToken: isTestMode ? 'test-token-admin-mock' : undefined
			});
			await client.mutation(api.students.seed, {
				testToken: isTestMode ? 'test-token-admin-mock' : undefined
			});
			seedMessage = 'Success! Students and categories seeded.';
		} catch (err) {
			seedMessage = 'Error: ' + (err as Error).message;
		} finally {
			seeding = false;
		}
	}

	$effect(() => {
		if (isTestMode || data?.testRole) return;
		if (user.isLoading === false && user.data?.role !== 'admin' && user.data?.role !== 'super') {
			goto('/');
		}
	});
</script>

<div class="mx-auto p-8 max-w-4xl">
	<header class="flex justify-between items-center mb-8">
		<div class="flex items-center gap-4">
			<h1 class="font-semibold text-foreground text-2xl">Admin Dashboard</h1>
		</div>
		<ThemeToggle />
	</header>

	<div class="gap-6 grid grid-cols-1 md:grid-cols-2">
		<!-- Weekly Reports - Every week -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2 text-primary">
					<History class="w-5 h-5" />
					<Card.Title class="text-lg">Weekly Reports</Card.Title>
				</div>
				<Card.Description>Review weekly reports.</Card.Description>
			</Card.Header>
			<Card.Content>
				<!-- The test expects getByText('Weekly Reports') -->
				<Button variant="outline" class="w-full" href="/admin/weekly-reports">
					View Weekly Reports
				</Button>
			</Card.Content>
		</Card.Root>

		<!-- Evaluation Review - A few times a week -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2 text-primary">
					<FileText class="w-5 h-5" />
					<Card.Title class="text-lg">Evaluation Review</Card.Title>
				</div>
				<Card.Description>View and review evaluation history.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" href="/evaluations">View Evaluations</Button>
			</Card.Content>
		</Card.Root>

		<!-- Student Management - Beginning of year, sporadic -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2 text-primary">
					<GraduationCap class="w-5 h-5" />
					<Card.Title class="text-lg">Student Management</Card.Title>
				</div>
				<Card.Description
					>Manage the student database, promote grades, or archive graduated students.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" href="/admin/students">Manage Students</Button>
			</Card.Content>
		</Card.Root>

		<!-- User Accounts - Beginning of year, very limited -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2 text-primary">
					<Users class="w-5 h-5" />
					<Card.Title class="text-lg">User Accounts</Card.Title>
				</div>
				<Card.Description
					>Review teacher registrations and assign administrative roles.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" href="/admin/users">Manage Users</Button>
			</Card.Content>
		</Card.Root>

		<!-- Categories - Beginning of year -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-3 mb-2 text-primary">
					<Tags class="w-5 h-5" />
					<Card.Title class="text-lg">Categories</Card.Title>
				</div>
				<Card.Description
					>Manage point categories and sub-categories for evaluations.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" href="/admin/categories">Manage Categories</Button>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Settings Section (Collapsible) -->
	<div class="mt-8">
		<button
			class="flex items-center gap-2 mb-4 font-semibold text-muted-foreground hover:text-foreground text-lg transition-colors"
			onclick={() => (showSettings = !showSettings)}
		>
			<Settings class="w-5 h-5" />
			Settings
			{#if showSettings}
				<ChevronDown class="w-4 h-4" />
			{:else}
				<ChevronRight class="w-4 h-4" />
			{/if}
		</button>

		{#if showSettings}
			<div
				class="gap-6 grid grid-cols-1 md:grid-cols-2 slide-in-from-top-2 animate-in duration-200"
			>
				<!-- Audit Log - A few times a year -->
				<Card.Root>
					<Card.Header>
						<div class="flex items-center gap-3 mb-2 text-primary">
							<ShieldAlert class="w-5 h-5" />
							<Card.Title class="text-lg">Audit Log</Card.Title>
						</div>
						<Card.Description>View system activity, changes, and history.</Card.Description>
					</Card.Header>
					<Card.Content>
						<Button variant="outline" class="w-full" href="/admin/audit">View Audit Log</Button>
					</Card.Content>
				</Card.Root>

				<!-- Backup - A few times a year -->
				<Card.Root>
					<Card.Header>
						<div class="flex items-center gap-3 mb-2 text-primary">
							<CloudBackup class="w-5 h-5" />
							<Card.Title class="text-lg">Backup</Card.Title>
						</div>
						<Card.Description>Create backups, restore data, or clear database.</Card.Description>
					</Card.Header>
					<Card.Content>
						<Button variant="outline" class="w-full" href="/admin/backup">Manage Backups</Button>
					</Card.Content>
				</Card.Root>

				<!-- Archive & Reset - Once or twice a year -->
				<Card.Root class="border-destructive">
					<Card.Header>
						<div class="flex items-center gap-3 mb-2 text-destructive">
							<ShieldAlert class="w-5 h-5" />
							<Card.Title class="text-lg">Archive & Reset</Card.Title>
						</div>
						<Card.Description
							>Archive the current academic cycle and reset points for the new year.</Card.Description
						>
					</Card.Header>
					<Card.Content>
						<Button variant="destructive" class="w-full" href="/admin/academic"
							>New School Year</Button
						>
					</Card.Content>
				</Card.Root>

				<!-- System Data - Testing only -->
				<Card.Root>
					<Card.Header>
						<div class="flex items-center gap-3 mb-2 text-primary">
							<Database class="w-5 h-5" />
							<Card.Title class="text-lg">System Data</Card.Title>
						</div>
						<Card.Description
							>Initialize the system with default categories and mock students.</Card.Description
						>
					</Card.Header>
					<Card.Content>
						<Button class="w-full" onclick={handleSeed} disabled={seeding}>Seed Initial Data</Button
						>
						{#if seedMessage}
							<p
								class="mt-4 text-sm"
								class:text-emerald-600={seedMessage.includes('Success')}
								class:text-muted-foreground={!seedMessage.includes('Success')}
							>
								{seedMessage}
							</p>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		{/if}
	</div>
</div>
