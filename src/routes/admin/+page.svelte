<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { Database, GraduationCap, Users, FileText, Tags, ShieldAlert } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Card from '$lib/components/ui/card';

	const user = useQuery(api.users.viewer, {});
	const client = useConvexClient();

	let seeding = $state(false);
	let seedMessage = $state('');

	async function handleSeed() {
		seeding = true;
		seedMessage = 'Seeding data...';
		try {
			await client.mutation(api.categories.seed, {});
			await client.mutation(api.students.seed, {});
			seedMessage = 'Success! Students and categories seeded.';
		} catch (err: any) {
			seedMessage = 'Error: ' + err.message;
		} finally {
			seeding = false;
		}
	}

	$effect(() => {
		if (user.isLoading === false && user.data?.role !== 'admin' && user.data?.role !== 'super') {
			goto('/');
		}
	});
</script>

<div class="mx-auto max-w-4xl p-8">
	<header class="mb-8 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" onclick={() => goto('/')}>← Back</Button>
			<h1 class="text-foreground text-2xl font-semibold">Admin Dashboard</h1>
		</div>
		<ThemeToggle />
	</header>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<div class="text-primary mb-2 flex items-center gap-3">
					<Database class="h-5 w-5" />
					<Card.Title class="text-lg">System Data</Card.Title>
				</div>
				<Card.Description
					>Initialize the system with default categories and mock students.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button class="w-full" onclick={handleSeed} disabled={seeding}>
					{seeding ? 'Seeding...' : 'Seed Initial Data'}
				</Button>
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

		<Card.Root>
			<Card.Header>
				<div class="text-primary mb-2 flex items-center gap-3">
					<GraduationCap class="h-5 w-5" />
					<Card.Title class="text-lg">Student Management</Card.Title>
				</div>
				<Card.Description
					>Manage the student database, promote grades, or archive graduated students.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" disabled>Manage Students (Coming Soon)</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<div class="text-primary mb-2 flex items-center gap-3">
					<Users class="h-5 w-5" />
					<Card.Title class="text-lg">User Accounts</Card.Title>
				</div>
				<Card.Description
					>Review teacher registrations and assign administrative roles.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" onclick={() => goto('/admin/users')}>
					Manage Users
				</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<div class="text-primary mb-2 flex items-center gap-3">
					<FileText class="h-5 w-5" />
					<Card.Title class="text-lg">Audit Log</Card.Title>
				</div>
				<Card.Description>View system activity, changes, and history.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" onclick={() => goto('/admin/audit')}>
					View Audit Log
				</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<div class="text-primary mb-2 flex items-center gap-3">
					<Tags class="h-5 w-5" />
					<Card.Title class="text-lg">Categories</Card.Title>
				</div>
				<Card.Description
					>Manage point categories and sub-categories for evaluations.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" class="w-full" onclick={() => goto('/admin/categories')}>
					Manage Categories
				</Button>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-destructive">
			<Card.Header>
				<div class="text-destructive mb-2 flex items-center gap-3">
					<ShieldAlert class="h-5 w-5" />
					<Card.Title class="text-lg">Archive & Reset</Card.Title>
				</div>
				<Card.Description
					>Archive the current academic cycle and reset points for the new year.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<Button variant="destructive" class="w-full" disabled>New School Year (Coming Soon)</Button>
			</Card.Content>
		</Card.Root>
	</div>
</div>
