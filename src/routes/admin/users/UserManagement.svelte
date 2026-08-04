<script lang="ts">
	import { CheckCircle2, Users, XCircle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import type { Id, Doc } from '$convex/_generated/dataModel';
	import { initials, isNewPending, timeAgo, formatDate, cleanName } from './batch-utils';

	type AdminUser = Doc<'users'> & {
		status: 'pending' | 'active';
		email?: string;
		image?: string | null;
	};
	type Role = 'super' | 'admin' | 'teacher';

	const roles: { value: Role; label: string }[] = [
		{ value: 'teacher', label: 'Teacher' },
		{ value: 'admin', label: 'Admin' },
		{ value: 'super', label: 'Super User' }
	];

	const roleColor: Record<Role, string> = {
		teacher: 'border-sky-300 bg-sky-100 text-sky-700',
		admin: 'border-violet-300 bg-violet-100 text-violet-700',
		super: 'border-amber-300 bg-amber-100 text-amber-700'
	};

	function roleLabel(role: string | null | undefined): string {
		return roles.find((r) => r.value === role)?.label ?? role ?? 'No role';
	}

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

	const newPending = $derived(users.filter((u) => isNewPending(u) && !approvedIds[u._id]));
	const deactivatedPending = $derived(
		users.filter((u) => u.status === 'pending' && !isNewPending(u) && !approvedIds[u._id])
	);
	const activeUsers = $derived(users.filter((u) => approvedIds[u._id] || u.status === 'active'));

	const uncheckedIds = $state<Record<string, boolean>>({});
	const checked = $derived(newPending.filter((u) => !uncheckedIds[u._id]).map((u) => u._id));
	const checkedCount = $derived(checked.length);

	const counts = $derived({
		pending: newPending.length,
		deactivated: deactivatedPending.length,
		active: activeUsers.length
	});
	type TabKey = 'pending' | 'active' | 'deactivated';
	const tabs = $derived(
		(
			[
				{ key: 'pending', label: 'Pending', count: counts.pending, accent: true },
				{ key: 'active', label: 'Active', count: counts.active, accent: false },
				{ key: 'deactivated', label: 'Deactivated', count: counts.deactivated, accent: false }
			] as { key: TabKey; label: string; count: number; accent: boolean }[]
		).filter((t) => t.key !== 'pending' || t.count > 0)
	);
	let tabOverride = $state<TabKey | null>(null);
	const tab = $derived(
		tabOverride === 'pending' && counts.pending === 0
			? 'active'
			: (tabOverride ?? (newPending.length ? 'pending' : 'active'))
	);

	function visible(): AdminUser[] {
		if (tab === 'pending') return newPending;
		if (tab === 'deactivated') return deactivatedPending;
		return activeUsers;
	}

	function toggleChecked(id: string) {
		uncheckedIds[id] = !uncheckedIds[id];
	}
</script>

<div class="space-y-4 px-4 sm:px-6">
	{#if newPending.length}
		<div
			class="mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl border bg-linear-to-r from-indigo-600 to-violet-600 px-5 py-3.5 text-white shadow-sm"
			data-testid="admin-users.hero"
		>
			<div class="flex items-center gap-3">
				<div class="flex size-9 items-center justify-center rounded-full bg-white/15">
					<Users class="size-4" />
				</div>
				<div>
					<p class="text-sm font-semibold">New teacher(s) pending</p>
					<p class="text-xs text-white/80">
						{newPending.length} awaiting access
						{deactivatedPending.length > 0 ? ` · ${deactivatedPending.length} deactivated` : ''}
					</p>
				</div>
			</div>
			{#if checkedCount > 0}
				<Button
					size="sm"
					class="bg-white text-indigo-700 hover:bg-white/90"
					onclick={() => approve(checked)}
					data-testid="admin-users.approve-checked"
				>
					<CheckCircle2 class="size-4" />
					Approve checked ({checkedCount})
				</Button>
			{/if}
		</div>
	{/if}

	<div
		class="flex flex-wrap items-center justify-center gap-1.5"
		role="tablist"
		aria-label="Filter users"
	>
		{#each tabs as t (t.key)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === t.key}
				onclick={() => (tabOverride = t.key)}
				class="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {tab === t.key
					? 'bg-foreground text-background border-foreground'
					: t.accent
						? 'bg-card border-red-300 text-red-600 hover:border-red-500'
						: 'bg-card text-muted-foreground border-border hover:border-foreground/30'}"
			>
				{t.label}
				<span class="ml-1 opacity-70">({t.count})</span>
			</button>
		{/each}
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
		{#if visible().length === 0}
			<div
				class="text-muted-foreground col-span-full rounded-xl border border-dashed py-12 text-center text-sm"
			>
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
				{@const isPending = user.status === 'pending' && !isApproved}
				{@const isActive = isApproved || user.status === 'active'}
				{@const currentRole = (roleStates[user._id] ?? user.role) as Role}
				<div
					class="bg-card relative flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md {isPending &&
					checked.includes(user._id)
						? 'border-primary/70 ring-primary/30 ring-2'
						: isPending
							? 'border-amber-400/60'
							: 'border-border'}"
					data-testid={`admin-users.card-${user._id}`}
				>
					<div class="flex items-start gap-3">
						<div class="relative shrink-0">
							{#if user.image}
								<img
									src={user.image}
									alt={cleanName(user.name) || 'Avatar'}
									class="size-12 rounded-xl object-cover"
									loading="lazy"
								/>
							{:else}
								<div
									class="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl text-base font-semibold"
								>
									{initials(user.name)}
								</div>
							{/if}
							{#if isActive}
								<span
									class="border-card absolute -right-1 -bottom-1 size-3.5 rounded-full border-2 bg-emerald-500"
									title="Active"
								></span>
							{:else}
								<span
									class="border-card absolute -right-1 -bottom-1 size-3.5 rounded-full border-2 bg-amber-500"
									title="Pending approval"
								></span>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold">
								{cleanName(user.name) || 'Unknown'}
							</p>
							<p class="text-muted-foreground truncate text-xs">{user.email || 'No email'}</p>
							<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
								<Badge
									variant="outline"
									class="text-[10px] {user.role ? roleColor[user.role as Role] : ''}"
								>
									{roleLabel(user.role)}
								</Badge>
								{#if isApproved}
									<Badge
										variant="outline"
										class="border-emerald-400/50 text-[10px] text-emerald-600"
									>
										<CheckCircle2 class="size-3" />
										Approved this session
									</Badge>
								{:else if isPending && isNew}
									<Badge variant="outline" class="border-amber-400/50 text-[10px] text-amber-600">
										New · {timeAgo(user.createdAt ?? Date.now())}
									</Badge>
								{:else if isPending}
									<Badge variant="outline" class="border-amber-400/50 text-[10px] text-amber-600">
										Access removed {formatDate(user.deactivatedAt ?? Date.now())}
									</Badge>
								{/if}
							</div>
						</div>
						{#if isPending && isNew}
							<input
								type="checkbox"
								class="accent-primary size-4 shrink-0 cursor-pointer"
								aria-label="Select {cleanName(user.name) || 'user'}"
								checked={checked.includes(user._id)}
								onchange={() => toggleChecked(user._id)}
								data-testid={`admin-users.check-${user._id}`}
							/>
						{:else if isActive}
							<Button
								variant="ghost"
								size="icon"
								class="text-muted-foreground size-8 shrink-0 hover:text-red-600"
								onclick={() => updateStatus(user._id, 'pending')}
								disabled={updatingId === user._id || user._id === currentUserId}
								title="Remove Access"
								data-testid={`admin-users.remove-access-${user._id}`}
							>
								<XCircle class="size-4 text-red-600" />
							</Button>
						{/if}
					</div>

					<div class="mt-4 flex items-center gap-2 border-t pt-3">
						{#if isActive}
							<Select.Root
								type="single"
								value={currentRole}
								onValueChange={(val) => updateRole(user._id, val as Role)}
								disabled={updatingId === user._id ||
									user._id === currentUserId ||
									user.role === 'super'}
							>
								<Select.Trigger
									class="h-8 min-w-0 flex-1 justify-between text-xs"
									placeholder="Select role"
									aria-label="Select role for {cleanName(user.name) || 'user'}"
									testId={`admin-users.role-select-${user._id}`}
								>
									{roleLabel(currentRole)}
								</Select.Trigger>
								<Select.Content>
									{#each roles as role (role.value)}
										{#if role.value !== 'super' || currentUserIsSuper}
											<Select.Item value={role.value}>{role.label}</Select.Item>
										{/if}
									{/each}
								</Select.Content>
							</Select.Root>
						{:else}
							<Button
								size="sm"
								variant="secondary"
								class="w-full"
								onclick={() => approve([user._id])}
								data-testid={`admin-users.approve-${user._id}`}
							>
								{isNew ? 'Approve' : 'Reactivate'}
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
