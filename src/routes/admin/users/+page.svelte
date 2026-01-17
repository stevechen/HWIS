<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { CheckCircle2, XCircle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

	import type { Id } from '$convex/_generated/dataModel';

	const currentUser = useQuery(api.users.viewer, {});
	const usersQuery = useQuery(api.users.list, {});
	const client = useConvexClient();
	const auth = useAuth();

	let isTestMode = $state(false);

	$effect(() => {
		if (!browser) return;
		isTestMode =
			document.cookie.split('; ').find((row) => row.startsWith('hwis_test_auth=')) !== undefined;
	});

	let updatingId = $state<Id<'users'> | null>(null);
	let roleStates = $state<Record<string, string>>({});

	async function updateUserRole(id: Id<'users'>, role: 'super' | 'admin' | 'teacher' | 'student') {
		updatingId = id;
		try {
			await client.mutation(api.users.update, { id, role });
			roleStates[id as string] = role;
		} catch (err) {
			console.error(err);
			roleStates[id as string] = usersQuery.data?.find((u) => u._id === id)?.role || 'teacher';
		} finally {
			updatingId = null;
		}
	}

	async function updateUserStatus(id: Id<'users'>, status: 'pending' | 'active' | 'deactivated') {
		updatingId = id;
		try {
			await client.mutation(api.users.update, { id, status });
		} catch (err) {
			console.error(err);
		} finally {
			updatingId = null;
		}
	}

	const roles = [
		{ value: 'teacher', label: 'Teacher' },
		{ value: 'admin', label: 'Admin' },
		{ value: 'super', label: 'Super User' },
		{ value: 'student', label: 'Student' }
	];

	function getStatusVariant(
		status: string | undefined
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'active':
				return 'default';
			case 'deactivated':
				return 'destructive';
			default:
				return 'secondary';
		}
	}

	$effect(() => {
		if (isTestMode) return;
		if (auth.isLoading) return;

		if (!auth.isAuthenticated) {
			void goto('/');
			return;
		}

		if (
			currentUser.isLoading === false &&
			currentUser.data?.role !== 'admin' &&
			currentUser.data?.role !== 'super'
		) {
			void goto('/');
		}
	});

	function handleBackToAdmin() {
		void goto('/admin');
	}
</script>

<div class="container mx-auto max-w-6xl py-8">
	<header class="mb-8 flex items-start justify-between">
		<div class="flex items-start gap-6">
			<Button variant="outline" onclick={handleBackToAdmin}>← Back to Admin</Button>
			<div>
				<h1 class="text-foreground mb-1 text-2xl font-semibold">Manage Users</h1>
				<p class="text-muted-foreground">Review and manage access levels for teachers and staff.</p>
			</div>
		</div>
		<ThemeToggle />
	</header>

	<div class="bg-card rounded-lg border shadow-sm">
		{#if usersQuery.isLoading}
			<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
				<div class="border-muted border-t-primary h-8 w-8 animate-spin rounded-full border-3"></div>
				<p>Loading user records...</p>
			</div>
		{:else if usersQuery.data}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-50">Name</Table.Head>
						<Table.Head>Role</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each usersQuery.data as user (user._id)}
						<Table.Row>
							<Table.Cell>
								<span class="font-medium">{user.name || 'Unknown'}</span>
							</Table.Cell>
							<Table.Cell>
								<Select.Root
									type="single"
									value={roleStates[user._id] ?? user.role}
									onValueChange={(val) =>
										updateUserRole(user._id, val as 'super' | 'admin' | 'teacher' | 'student')}
									disabled={updatingId === user._id ||
										user._id === (currentUser.data?._id as Id<'users'> | undefined) ||
										user.role === 'super'}
								>
									<Select.Trigger class="h-8 w-33 text-sm" placeholder="Select role">
										{roles.find((r) => r.value === (roleStates[user._id] ?? user.role))?.label ||
											'Select role'}
									</Select.Trigger>
									<Select.Content>
										{#each roles as role (role.value)}
											<Select.Item value={role.value}>{role.label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={getStatusVariant(user.status)} class="capitalize">
									{user.status || 'pending'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-right">
								<div class="flex justify-end gap-2">
									{#if user.status !== 'active'}
										<Button
											variant="ghost"
											size="icon"
											onclick={() => updateUserStatus(user._id, 'active')}
											disabled={updatingId === user._id}
											title="Approve User"
										>
											<CheckCircle2 class="h-4 w-4 text-emerald-600" />
										</Button>
									{/if}
									{#if user.status !== 'deactivated'}
										<Button
											variant="ghost"
											size="icon"
											onclick={() => updateUserStatus(user._id, 'deactivated')}
											disabled={updatingId === user._id ||
												user._id === (currentUser.data?._id as Id<'users'> | undefined)}
											title="Deactivate User"
										>
											<XCircle class="h-4 w-4 text-red-600" />
										</Button>
									{/if}
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</div>
</div>
