<script lang="ts">
	import { CheckCircle2, Users, XCircle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import * as Select from '$lib/components/ui/select';
	import type { Id, Doc } from '$convex/_generated/dataModel';
	import { initials, isNewPending, timeAgo, formatDate } from './batch-utils';

	type AdminUser = Doc<'users'> & {
		status: 'pending' | 'active';
	};
	type Role = 'super' | 'admin' | 'teacher';

	const roles: { value: Role; label: string }[] = [
		{ value: 'teacher', label: 'Teacher' },
		{ value: 'admin', label: 'Admin' },
		{ value: 'super', label: 'Super User' }
	];

	let {
		users,
		approvedIds,
		approve,
		updateRole,
		updateStatus,
		updatingId,
		currentUserId,
		currentUserIsSuper,
		roleStates
	}: {
		users: AdminUser[];
		approvedIds: Record<string, boolean>;
		approve: (ids: string[]) => void;
		updateRole: (id: Id<'users'>, role: Role) => void;
		updateStatus: (id: Id<'users'>, status: 'pending' | 'active') => void;
		updatingId: Id<'users'> | null;
		currentUserId?: Id<'users'>;
		currentUserIsSuper: boolean;
		roleStates: Record<string, string>;
	} = $props();

	// New signups vs previously-active-but-access-removed are kept apart.
	const newPending = $derived(users.filter((u) => isNewPending(u) && !approvedIds[u._id]));
	const deactivatedPending = $derived(
		users.filter((u) => u.status === 'pending' && !isNewPending(u) && !approvedIds[u._id])
	);
	const activeUsers = $derived(users.filter((u) => approvedIds[u._id] || u.status === 'active'));

	const eligibleNewIds = $derived(newPending.map((u) => u._id));

	// Landing default: the Active tab, UNLESS new teachers are waiting for approval — then
	// land on Pending so the influx is the first thing the admin sees. The admin's manual
	// tab choice overrides the default for the rest of the session (and takes over once the
	// default has no new-pending reason to flip, e.g. after the last approval lands).
	let tabOverride = $state<'pending' | 'deactivated' | 'active' | null>(null);
	const hasNewPending = $derived(eligibleNewIds.length > 0);
	const tab = $derived(tabOverride ?? (hasNewPending ? 'pending' : 'active'));

	// New teachers are pre-checked; deactivated ones are NOT (they were deactivated for a
	// reason — re-approving them isn't part of the year-start influx). Track the admin's
	// unchecks (new bucket) and extra checks (deactivated bucket). Object-records rather
	// than Sets: a `$state` Set mutated in place does not invalidate the `$derived`s
	// below in this environment.
	const unchecked = $state<Record<string, boolean>>({});
	const extraChecked = $state<Record<string, boolean>>({});

	const checked = $derived([
		...eligibleNewIds.filter((id) => !unchecked[id]),
		...Object.keys(extraChecked).filter((id) => extraChecked[id])
	]);
	const checkedCount = $derived(checked.length);
	const allChecked = $derived(
		Object.keys(extraChecked).filter((id) => extraChecked[id]).length === 0 &&
			eligibleNewIds.length > 0 &&
			eligibleNewIds.every((id) => checked.includes(id))
	);
	const batchLabel = $derived(allChecked ? 'Approve all' : 'Approve checked');
	const batchDisabled = $derived(checkedCount === 0 || eligibleNewIds.length === 0);

	function toggleChecked(id: string, isNew: boolean) {
		if (isNew) unchecked[id] = !unchecked[id];
		else extraChecked[id] = !extraChecked[id];
	}

	function approveChecked() {
		approve([...checked]);
	}

	const counts = $derived({
		pending: newPending.length,
		deactivated: deactivatedPending.length,
		active: activeUsers.length
	});

	function visible(): AdminUser[] {
		if (tab === 'pending') return newPending;
		if (tab === 'deactivated') return deactivatedPending;
		return activeUsers;
	}
</script>

<div class="space-y-4">
	{#if newPending.length}
		<div
			class="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white shadow-sm"
			data-testid="admin-users.hero"
		>
			<div class="flex items-center gap-3">
				<div class="flex size-10 items-center justify-center rounded-full bg-white/15">
					<Users class="size-5" />
				</div>
				<div>
					<p class="text-sm font-semibold">New teacher influx</p>
					<p class="text-xs text-white/80">
						{newPending.length} new awaiting access
						{deactivatedPending.length > 0 ? ` · ${deactivatedPending.length} deactivated` : ''}
					</p>
				</div>
			</div>
			<Button
				size="lg"
				class="bg-white text-indigo-700 hover:bg-white/90"
				onclick={approveChecked}
				disabled={batchDisabled}
				data-testid="admin-users.approve-checked"
			>
				<CheckCircle2 class="size-4" />
				{batchLabel} ({checkedCount})
			</Button>
		</div>
	{/if}

	<div class="bg-muted/50 inline-flex rounded-full border p-1" role="tablist">
		{#each ['pending', 'deactivated', 'active'] as const as key (key)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === key}
				onclick={() => (tabOverride = key)}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors {key === 'pending' &&
				counts.pending > 0
					? 'text-red-600'
					: 'text-muted-foreground'}"
				class:bg-card={tab === key}
				class:shadow-sm={tab === key}
				class:font-semibold={key === 'pending' && counts.pending > 0}
			>
				{key[0]?.toUpperCase() + key.slice(1)} ({counts[key]})
			</button>
		{/each}
	</div>

	<Separator />

	<div class="space-y-3">
		{#if visible().length === 0}
			<div class="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
				{tab === 'pending'
					? 'All new teachers have been approved. Check the Active tab.'
					: tab === 'deactivated'
						? 'No deactivated teachers.'
						: 'No active teachers yet.'}
			</div>
		{:else}
			{#each visible() as user (user._id)}
				{@const isApproved = approvedIds[user._id]}
				{@const isNew = isNewPending(user)}
				<Card.Root
					class={isApproved
						? 'border-emerald-400/50'
						: checked.includes(user._id)
							? 'border-primary/60'
							: ''}
					data-testid={`admin-users.card-${user._id}`}
				>
					<Card.Header class="flex flex-row items-center gap-3">
						{#if !isApproved && user.status !== 'active'}
							<input
								type="checkbox"
								class="accent-primary size-4 shrink-0"
								aria-label="Select {user.name || 'user'}"
								checked={checked.includes(user._id)}
								onchange={() => toggleChecked(user._id, isNew)}
								data-testid={`admin-users.check-${user._id}`}
							/>
						{/if}
						<div
							class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
						>
							{initials(user.name)}
						</div>
						<div class="min-w-0 flex-1">
							<Card.Title class="truncate text-sm">{user.name || 'Unknown'}</Card.Title>
							{#if user.authId}
								<Card.Description class="truncate text-xs">{user.authId}</Card.Description>
							{/if}
						</div>
						<div class="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
							{#if isApproved}
								<span class="text-xs font-medium text-emerald-600">Approved this session</span>
							{:else if user.status === 'pending' && isNew}
								<span class="text-muted-foreground text-xs"
									>New · {timeAgo(user.createdAt ?? Date.now())}</span
								>
							{:else if user.status === 'pending'}
								<span class="text-xs font-medium text-amber-600">
									Access removed {formatDate(user.deactivatedAt ?? Date.now())}
								</span>
							{/if}
							{#if user.status === 'pending' && !isNew && !isApproved}
								<Badge variant="destructive" class="text-[10px]">previously deactivated</Badge>
							{:else if user.status === 'active'}
								<Badge variant="default" class="text-[10px]">active</Badge>
							{/if}
						</div>
						{#if user.status === 'active'}
							<div class="flex shrink-0 items-center gap-1.5">
								<Select.Root
									type="single"
									value={roleStates[user._id] ?? user.role}
									onValueChange={(val) => updateRole(user._id, val as Role)}
									disabled={updatingId === user._id ||
										user._id === currentUserId ||
										user.role === 'super'}
								>
									<Select.Trigger
										class="h-8 w-20 text-sm sm:w-auto"
										placeholder="Select role"
										aria-label="Select role for {user.name || 'user'}"
										testId={`admin-users.role-select-${user._id}`}
									>
										{roles.find((r) => r.value === (roleStates[user._id] ?? user.role))?.label ||
											'Select role'}
									</Select.Trigger>
									<Select.Content>
										{#each roles as role (role.value)}
											{#if role.value !== 'super' || currentUserIsSuper}
												<Select.Item value={role.value}>{role.label}</Select.Item>
											{/if}
										{/each}
									</Select.Content>
								</Select.Root>
								<Button
									variant="ghost"
									size="icon"
									class="size-8"
									onclick={() => updateStatus(user._id, 'pending')}
									disabled={updatingId === user._id || user._id === currentUserId}
									title="Remove Access"
									data-testid={`admin-users.remove-access-${user._id}`}
								>
									<XCircle class="size-4 text-red-600" />
								</Button>
							</div>
						{:else if !isApproved}
							<div class="flex shrink-0 items-center gap-1.5">
								<Button
									size="sm"
									variant="secondary"
									onclick={() => approve([user._id])}
									data-testid={`admin-users.approve-${user._id}`}
								>
									{isNew ? 'Approve' : 'Reactivate'}
								</Button>
							</div>
						{:else}
							<CheckCircle2 class="size-5 shrink-0 text-emerald-600" />
						{/if}
					</Card.Header>
				</Card.Root>
			{/each}
		{/if}
	</div>
</div>
