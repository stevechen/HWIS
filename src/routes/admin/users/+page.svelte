<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { CheckCircle2, XCircle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';

	import type { Id } from '$convex/_generated/dataModel';

	const client = useConvexClient();

	const currentUser = useQuery(api.users.viewer, () => ({}));
	const usersQuery = useQuery(api.users.list, () => ({}));

	let updatingId = $state<Id<'users'> | null>(null);
	let roleStates = $state<Record<string, string>>({});

	async function updateUserRole(id: Id<'users'>, role: 'super' | 'admin' | 'teacher' | 'student') {
		updatingId = id;
		try {
			await client.mutation(api.users.update, {
				id,
				role
			});
			roleStates[id as string] = role;
		} catch {
			roleStates[id as string] = usersQuery.data?.find((u) => u._id === id)?.role || 'teacher';
		} finally {
			updatingId = null;
		}
	}

	async function updateUserStatus(id: Id<'users'>, status: 'pending' | 'active') {
		updatingId = id;
		try {
			await client.mutation(api.users.update, {
				id,
				status
			});
		} catch {
			// Error handled silently
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
			default:
				return 'secondary';
		}
	}
</script>

<div class="mx-auto py-8 max-w-6xl container">
	<div class="bg-card shadow-sm border rounded-lg">
		{#if usersQuery.isLoading}
			<div class="flex flex-col justify-center items-center gap-4 p-16 text-muted-foreground">
				<div class="border-3 border-muted border-t-primary rounded-full w-8 h-8 animate-spin"></div>
				<p>Loading user records...</p>
			</div>
		{:else if usersQuery.data}
			<Table.Root aria-label="users">
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
									<Select.Trigger
										class="w-33 h-8 text-sm"
										placeholder="Select role"
										aria-label="Select role for {user.name || 'user'}"
									>
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
											<CheckCircle2 class="w-4 h-4 text-emerald-600" />
										</Button>
									{/if}
									{#if user.status === 'active'}
										<Button
											variant="ghost"
											size="icon"
											onclick={() => updateUserStatus(user._id, 'pending')}
											disabled={updatingId === user._id ||
												user._id === (currentUser.data?._id as Id<'users'> | undefined)}
											title="Remove Access"
										>
											<XCircle class="w-4 h-4 text-red-600" />
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
