<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import UserManagement from './UserManagement.svelte';
	import { useAuthProfile } from '$lib/auth-profile';

	const client = useConvexClient();
	const profile = useAuthProfile();
	const usersQuery = useQuery(api.users.list, () => ({}));

	// Transient per-session record of users approved during this visit. The DB write is
	// what persists; this set drives the "Approved this session" state until Convex
	// reactivity catches up (a refresh reflects only server truth). Object-record rather
	// than a Set: in-place Set mutations don't invalidate `$derived`s in this env.
	const approvedIds = $state<Record<string, boolean>>({});

	let updatingId = $state<Id<'users'> | null>(null);
	let roleStates = $state<Record<string, string>>({});

	async function approve(ids: string[]) {
		await Promise.all(
			ids.map((id) =>
				client.mutation(api.users.update, { id: id as Id<'users'>, status: 'active' })
			)
		);
		for (const id of ids) approvedIds[id] = true;
	}

	async function updateUserRole(id: Id<'users'>, role: 'super' | 'admin' | 'teacher') {
		updatingId = id;
		try {
			await client.mutation(api.users.update, { id, role });
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
			await client.mutation(api.users.update, { id, status });
		} catch {
			// Error handled silently
		} finally {
			updatingId = null;
		}
	}
</script>

<div class="py-6" data-testid="admin-users.root">
	{#if usersQuery.isLoading}
		<div class="text-muted-foreground flex flex-col items-center justify-center gap-4 p-16">
			<div class="border-muted border-t-primary size-8 animate-spin rounded-full border-3"></div>
			<p>Loading user records...</p>
		</div>
	{:else if usersQuery.data}
		<UserManagement
			users={usersQuery.data}
			{approvedIds}
			{approve}
			updateRole={updateUserRole}
			updateStatus={updateUserStatus}
			{updatingId}
			currentUserId={profile?.data?.user?._id as Id<'users'> | undefined}
			currentUserIsSuper={profile?.data?.user?.role === 'super'}
			{roleStates}
		/>
	{/if}
</div>
