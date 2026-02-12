<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
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
	import * as Card from '$lib/components/ui/card';

	const client = useConvexClient();

	let seeding = $state(false);
	let seedMessage = $state('');
	let showSettings = $state(false);

	async function handleSeed() {
		seeding = true;
		seedMessage = 'Seeding data...';
		try {
			await client.mutation(api.categories.seed, {});
			await client.mutation(api.students.seed, {});
			seedMessage = 'Success! Students and categories seeded.';
		} catch (err) {
			seedMessage = 'Error: ' + (err as Error).message;
		} finally {
			seeding = false;
		}
	}
</script>

<div class="mx-auto p-8 max-w-4xl">
	<div class="gap-6 grid grid-cols-1 md:grid-cols-2">
		<!-- Weekly Reports - Every week -->
		<a href="/admin/weekly-reports" class="block">
			<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
				<Card.Header>
					<div class="flex items-center gap-3 mb-2 text-primary">
						<History class="w-5 h-5" />
						<Card.Title class="text-lg">Weekly Reports</Card.Title>
					</div>
					<Card.Description>Review weekly reports.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>

		<!-- Evaluation Review - A few times a week -->
		<a href="/evaluations" class="block">
			<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
				<Card.Header>
					<div class="flex items-center gap-3 mb-2 text-primary">
						<FileText class="w-5 h-5" />
						<Card.Title class="text-lg">My Evaluation Review</Card.Title>
					</div>
					<Card.Description>View and review evaluation history.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>

		<!-- All Evaluation Review - Admin only -->
		<a href="/admin/evaluations" class="block">
			<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
				<Card.Header>
					<div class="flex items-center gap-3 mb-2 text-primary">
						<FileText class="w-5 h-5" />
						<Card.Title class="text-lg">All Evaluations</Card.Title>
					</div>
					<Card.Description>View all evaluations by all teachers.</Card.Description>
				</Card.Header>
			</Card.Root>
		</a>

		<!-- Student Management - Beginning of year, sporadic -->
		<a href="/admin/students" class="block">
			<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
				<Card.Header>
					<div class="flex items-center gap-3 mb-2 text-primary">
						<GraduationCap class="w-5 h-5" />
						<Card.Title class="text-lg">Student Management</Card.Title>
					</div>
					<Card.Description
						>Manage the student database, promote grades, or archive graduated students.</Card.Description
					>
				</Card.Header>
			</Card.Root>
		</a>

		<!-- User Accounts - Beginning of year, very limited -->
		<a href="/admin/users" class="block">
			<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
				<Card.Header>
					<div class="flex items-center gap-3 mb-2 text-primary">
						<Users class="w-5 h-5" />
						<Card.Title class="text-lg">User Accounts</Card.Title>
					</div>
					<Card.Description
						>Review teacher registrations and assign administrative roles.</Card.Description
					>
				</Card.Header>
			</Card.Root>
		</a>

		<!-- Categories - Beginning of year -->
		<a href="/admin/categories" class="block">
			<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
				<Card.Header>
					<div class="flex items-center gap-3 mb-2 text-primary">
						<Tags class="w-5 h-5" />
						<Card.Title class="text-lg">Categories</Card.Title>
					</div>
					<Card.Description
						>Manage point categories and sub-categories for evaluations.</Card.Description
					>
				</Card.Header>
			</Card.Root>
		</a>
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
				<ChevronDown class="size-4" />
			{:else}
				<ChevronRight class="size-4" />
			{/if}
		</button>

		{#if showSettings}
			<div
				class="gap-6 grid grid-cols-1 md:grid-cols-2 slide-in-from-top-2 animate-in duration-200"
			>
				<!-- Audit Log - A few times a year -->
				<a href="/admin/audit" class="block">
					<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
						<Card.Header>
							<div class="flex items-center gap-3 mb-2 text-primary">
								<ShieldAlert class="w-5 h-5" />
								<Card.Title class="text-lg">Audit Log</Card.Title>
							</div>
							<Card.Description>View system activity, changes, and history.</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>

				<!-- Backup - A few times a year -->
				<a href="/admin/backup" class="block">
					<Card.Root class="hover:shadow-md hover:border-primary/50 transition-all cursor-pointer">
						<Card.Header>
							<div class="flex items-center gap-3 mb-2 text-primary">
								<CloudBackup class="w-5 h-5" />
								<Card.Title class="text-lg">Backup</Card.Title>
							</div>
							<Card.Description>Create backups, restore data, or clear database.</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>

				<!-- Archive & Reset - Once or twice a year -->
				<a href="/admin/academic" class="block">
					<Card.Root
						class="hover:shadow-md border-destructive/50 hover:border-destructive transition-all cursor-pointer"
					>
						<Card.Header>
							<div class="flex items-center gap-3 mb-2 text-destructive">
								<ShieldAlert class="w-5 h-5" />
								<Card.Title class="text-lg">Archive & Reset</Card.Title>
							</div>
							<Card.Description
								>Archive the current academic cycle and reset points for the new year.</Card.Description
							>
						</Card.Header>
					</Card.Root>
				</a>

				<!-- Seed Initial Data - Testing only -->
				<button
					onclick={handleSeed}
					disabled={seeding}
					class="hover:shadow-md rounded-lg w-full text-left transition-all cursor-pointer"
				>
					<Card.Root class="pointer-events-none">
						<Card.Header>
							<div class="flex items-center gap-3 mb-2 text-primary">
								<Database class="w-5 h-5" />
								<Card.Title class="text-lg">Seed Initial Data</Card.Title>
							</div>
							<Card.Description
								>Initialize the system with default categories and mock students.</Card.Description
							>
						</Card.Header>
					</Card.Root>
				</button>
				{#if seedMessage}
					<p
						class="mt-4 text-sm"
						class:text-emerald-600={seedMessage.includes('Success')}
						class:text-muted-foreground={!seedMessage.includes('Success')}
					>
						{seedMessage}
					</p>
				{/if}
			</div>
		{/if}
	</div>
</div>
