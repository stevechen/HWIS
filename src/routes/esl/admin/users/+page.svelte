<script lang="ts">
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { useViewer } from '$lib/viewer.svelte';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { Badge } from '$lib/components/ui/badge';
	import UserCard from '$lib/components/users/user-card.svelte';
	import { initials } from '$lib/utils/names';

	const client = useConvexClient();
	const session = useViewer();

	const staffQuery = useQuery(api.esl.staff.list, () => ({}));

	const staff = $derived(staffQuery.data ?? []);

	let search = $state('');
	let onlyEsl = $state(false);
	let busyId = $state<string | null>(null);
	let rowError = $state('');
	let notice = $state('');

	/** The ESL role each select shows, so a pending save does not snap back. */
	let overrides = $state<Record<string, 'admin' | 'teacher' | 'none'>>({});

	const visibleStaff = $derived(
		staff
			.filter((person) => {
				if (onlyEsl && person.eslRole === null) return false;
				if (!search.trim()) return true;
				return person.name.toLowerCase().includes(search.trim().toLowerCase());
			})
			.map((person) => ({
				...person,
				selected: overrides[person._id] ?? person.eslRole ?? 'none'
			}))
	);

	const eslCount = $derived(staff.filter((person) => person.eslRole !== null).length);
	const adminCount = $derived(staff.filter((person) => person.eslRole === 'admin').length);

	function roleLabel(role: string): string {
		if (role === 'admin') return 'ESL Admin';
		if (role === 'teacher') return 'ESL Teacher';
		return 'No ESL role';
	}

	function isSelf(id: Id<'users'>): boolean {
		return session.viewer?._id === id;
	}

	function openProfile(id: Id<'users'>) {
		goto(`/esl/admin/users/${id}`);
	}

	function openProfileKey(event: KeyboardEvent, id: Id<'users'>) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openProfile(id);
		}
	}

	function eslBadgeClass(role: string): string {
		if (role === 'admin') return 'border-emerald-300 bg-emerald-100 text-emerald-700';
		if (role === 'teacher') return 'border-sky-300 bg-sky-100 text-sky-700';
		return '';
	}

	function setRole(id: Id<'users'>, name: string, value: string) {
		overrides[id] = value as 'admin' | 'teacher' | 'none';
		busyId = id;
		rowError = '';
		notice = '';
		client
			.mutation(api.esl.staff.setEslRole, {
				userId: id,
				eslRole: value === 'none' ? null : (value as 'admin' | 'teacher')
			})
			.then(() => {
				notice = `${name} is now ${roleLabel(value).toLowerCase()}`;
			})
			.catch((error: unknown) => {
				rowError = error instanceof Error ? error.message : 'Could not save the role';
				delete overrides[id];
			})
			.finally(() => {
				busyId = null;
			});
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-6 p-8">
	<header>
		<h1 data-testid="esl-admin-users.title" class="text-2xl font-bold text-emerald-900">
			ESL Department Users
		</h1>
		<p data-testid="esl-admin-users.summary" class="text-muted-foreground mt-2 text-sm">
			{eslCount} in the department · {adminCount} ESL admin(s) · {staff.length} staff total
		</p>
	</header>

	<div class="flex flex-wrap items-end gap-4">
		<div class="space-y-1">
			<label class="text-sm font-medium" for="esl-users-search">Search staff</label>
			<input
				id="esl-users-search"
				type="search"
				data-testid="esl-admin-users.search"
				placeholder="Search by name…"
				bind:value={search}
				class="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-64 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
			/>
		</div>
		<label class="flex items-center gap-2 pb-2 text-sm">
			<input type="checkbox" data-testid="esl-admin-users.only-esl" bind:checked={onlyEsl} />
			Only ESL staff
		</label>
	</div>

	{#if rowError}
		<p
			data-testid="esl-admin-users.error"
			class="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700"
		>
			{rowError}
		</p>
	{/if}
	{#if notice}
		<p
			data-testid="esl-admin-users.notice"
			class="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
		>
			{notice}
		</p>
	{/if}

	{#if staffQuery.isLoading}
		<p class="text-muted-foreground py-8 text-center" data-testid="esl-admin-users.loading">
			Loading staff…
		</p>
	{:else if visibleStaff.length === 0}
		<p
			class="text-muted-foreground rounded-lg border border-dashed bg-white py-12 text-center"
			data-testid="esl-admin-users.empty"
		>
			No staff match the current filters.
		</p>
	{:else}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each visibleStaff as person (person._id)}
				<div
					role="link"
					tabindex={0}
					aria-label="View profile for {person.name}"
					data-testid="esl-admin-users.profile-link"
					class="cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:outline-none"
					onclick={() => openProfile(person._id)}
					onkeydown={(event) => openProfileKey(event, person._id)}
				>
					<UserCard
						name={person.name}
						subtitle={person.internationalRole
							? `International · ${person.internationalRole}`
							: 'No international role'}
						active={person.status === 'active'}
						initials={initials(person.name)}
						testId="esl-admin-users.row"
					>
						{#snippet titleSuffix()}
							{#if isSelf(person._id)}
								<span class="text-muted-foreground text-xs font-normal">(you)</span>
							{/if}
						{/snippet}
						{#snippet badges()}
							<Badge variant={person.status === 'active' ? 'default' : 'secondary'}>
								{person.status}
							</Badge>
							<Badge variant="outline" class="text-[10px] {eslBadgeClass(person.selected)}">
								{roleLabel(person.selected)}
							</Badge>
						{/snippet}
						{#snippet footer()}
							<div class="w-full [&>div]:w-full">
								<NativeSelect.Root
									aria-label="ESL role for {person.name}"
									data-testid="esl-admin-users.role"
									value={person.selected}
									disabled={busyId === person._id}
									onclick={(event) => event.stopPropagation()}
									onkeydown={(event) => event.stopPropagation()}
									onchange={(event) => setRole(person._id, person.name, event.currentTarget.value)}
								>
									<NativeSelect.Option value="none">No ESL role</NativeSelect.Option>
									<NativeSelect.Option value="teacher">ESL Teacher</NativeSelect.Option>
									<NativeSelect.Option value="admin">ESL Admin</NativeSelect.Option>
								</NativeSelect.Root>
							</div>
						{/snippet}
					</UserCard>
				</div>
			{/each}
		</div>
	{/if}
</div>
