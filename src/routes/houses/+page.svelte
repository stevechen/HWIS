<script lang="ts">
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Plus, Pencil, Trash2, Calendar, Trophy, AlertTriangle, Monitor } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	import { HOUSES, HOUSE_COLORS, type House } from '$lib/constants/houses';

	const eventsQuery = useQuery(api.houseEvents.list, () => ({}));
	const client = useConvexClient();

	// Dialog state
	let eventDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let isEditing = $state(false);
	let isSubmitting = $state(false);
	let isDeleting = $state(false);
	let editingId = $state<Id<'house_events'> | null>(null);
	let deleteTarget = $state<{ _id: Id<'house_events'>; title: string; hasPoints: boolean } | null>(
		null
	);
	let formError = $state('');
	let deleteError = $state('');

	// Form fields
	let title = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let housePoints = $state<Record<House, string>>({
		Heracles: '',
		Wukong: '',
		Ixbalam: '',
		Setna: ''
	});

	// derived: pre-compute display date strings
	const events = $derived.by(() => {
		return (eventsQuery.data ?? []).map((e) => {
			const s = new Date(e.startDate);
			const en = new Date(e.endDate);
			const fmt = (d: Date) =>
				`${d.getDate()} ${s.toLocaleString('en-GB', { month: 'short' })} ${s.getFullYear()}`;
			return { ...e, dateRange: `${fmt(s)} – ${fmt(en)}` };
		});
	});

	function openEdit(event: (typeof events)[number]) {
		isEditing = true;
		editingId = event._id;
		title = event.title;
		startDate = tsToDateStr(event.startDate);
		endDate = tsToDateStr(event.endDate);
		const hp = event.housePoints;
		housePoints = {
			Heracles: hp?.Heracles?.toString() ?? '',
			Wukong: hp?.Wukong?.toString() ?? '',
			Ixbalam: hp?.Ixbalam?.toString() ?? '',
			Setna: hp?.Setna?.toString() ?? ''
		};
		formError = '';
		eventDialogOpen = true;
	}

	function openDelete(event: (typeof events)[number]) {
		const hp = event.housePoints;
		const hasPoints = hp != null && Object.values(hp).some((v) => v !== undefined && v !== 0);
		deleteTarget = { _id: event._id, title: event.title, hasPoints };
		deleteError = '';
		deleteDialogOpen = true;
	}

	function tsToDateStr(ts: number): string {
		const d = new Date(ts);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function toMidnightTimestamp(dateStr: string): number {
		const parts = dateStr.split('-');
		return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
	}

	async function handleEventSubmit() {
		formError = '';

		if (!title.trim()) {
			formError = 'Event title is required';
			return;
		}
		if (!startDate) {
			formError = 'Start date is required';
			return;
		}
		if (!endDate) {
			formError = 'End date is required';
			return;
		}

		const startTs = toMidnightTimestamp(startDate);
		const endTs = toMidnightTimestamp(endDate);

		if (endTs < startTs) {
			formError = 'End date must be on or after the start date';
			return;
		}

		// Build optional housePoints record (only include houses with a value set)
		const hp: Record<House, number> | undefined = (() => {
			const result: Record<string, number> = {};
			for (const h of HOUSES) {
				const raw = housePoints[h];
				const val = typeof raw === 'number' ? String(raw) : raw;
				if (val.trim() !== '') {
					const num = Number(val);
					if (Number.isNaN(num)) {
						formError = `Invalid number for ${h} points`;
						return undefined;
					}
					result[h] = num;
				}
			}
			return Object.keys(result).length > 0 ? (result as Record<House, number>) : undefined;
		})();

		if (formError) return;

		isSubmitting = true;
		try {
			if (isEditing && editingId) {
				await client.mutation(api.houseEvents.update, {
					id: editingId,
					title: title.trim(),
					startDate: startTs,
					endDate: endTs,
					housePoints: hp
				});
			} else {
				await client.mutation(api.houseEvents.create, {
					title: title.trim(),
					startDate: startTs,
					endDate: endTs,
					housePoints: hp
				});
			}
			eventDialogOpen = false;
		} catch (e) {
			formError = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		isDeleting = true;
		deleteError = '';
		try {
			await client.mutation(api.houseEvents.remove, { id: deleteTarget._id });
			deleteDialogOpen = false;
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'An error occurred';
		} finally {
			isDeleting = false;
		}
	}

	function openDisplay() {
		if (browser) {
			window.open('/houses/display', '_blank', 'noopener,noreferrer');
		}
	}
</script>

<svelte:head>
	<title>House Events Management</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold text-gray-900">House Events</h1>
			<p class="mt-1 text-gray-600">Manage house competitions and award event points</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button onclick={() => (eventDialogOpen = true)}>
				<Plus class="mr-2 size-4" />
				New Event
			</Button>
			<Button variant="outline" onclick={openDisplay}>
				<Monitor class="mr-2 size-4" />
				Display House Scores
			</Button>
		</div>
	</div>

	{#if eventsQuery.isLoading}
		<div class="flex items-center justify-center py-20">
			<div class="size-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
		</div>
	{:else if eventsQuery.error}
		<div class="py-20 text-center">
			<p class="text-red-600">Failed to load events</p>
		</div>
	{:else if events.length === 0}
		<Card.Root class="text-center">
			<Card.Content class="py-16">
				<Calendar class="mx-auto mb-4 size-12 text-gray-300" />
				<h3 class="text-lg font-semibold text-gray-700">No Events Yet</h3>
				<p class="mt-2 text-gray-500">Create your first house event to get started.</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4">
			{#each events as event (event._id)}
				{@const hp = event.housePoints}
				{@const hasPoints = hp != null && Object.values(hp).some((v) => v !== undefined && v !== 0)}
				<Card.Root>
					<Card.Header class="flex flex-col gap-1 pb-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<Card.Title class="flex items-center gap-2 text-base sm:text-lg">
									<Trophy class="size-5 shrink-0 text-yellow-600" />
									<span class="break-words">{event.title}</span>
								</Card.Title>
								<p class="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
									<Calendar class="size-4 shrink-0" />
									{event.dateRange}
								</p>
							</div>
							<div class="flex shrink-0 gap-2">
								<Button size="sm" variant="outline" onclick={() => openEdit(event)}>
									<Pencil class="size-3.5" />
									Edit
								</Button>
								<Button size="sm" variant="destructive" onclick={() => openDelete(event)}>
									<Trash2 class="size-3.5" />
									Delete
								</Button>
							</div>
						</div>
					</Card.Header>

					{#if hasPoints}
						<Card.Content class="pt-0">
							<p class="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
								House Points Awarded
							</p>
							<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
								{#each HOUSES as h (h)}
									{@const pts = hp?.[h]}
									{@const colors = HOUSE_COLORS[h]}
									<div
										class="flex items-center justify-between rounded-lg px-3 py-2 {colors.lightBg} {colors.border} border"
									>
										<span class="text-sm font-semibold {colors.text}">{h}</span>
										<span class="text-sm font-bold {colors.text}">{pts ?? 0}</span>
									</div>
								{/each}
							</div>
						</Card.Content>
					{/if}
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<!-- Create / Edit Event Dialog -->
<Dialog.Root bind:open={eventDialogOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{isEditing ? 'Edit Event' : 'New House Event'}</Dialog.Title>
			<Dialog.Description>
				{isEditing
					? 'Update the event details below.'
					: 'Create a new house competition event. Points can be added later via Edit.'}
			</Dialog.Description>
		</Dialog.Header>

		{#if formError}
			<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{formError}
			</div>
		{/if}

		<div class="space-y-4 py-4">
			<div>
				<label for="event-title" class="mb-1.5 block text-sm font-medium text-gray-700"
					>Event Title</label
				>
				<Input id="event-title" bind:value={title} placeholder="e.g. Sports Day" />
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="event-start" class="mb-1.5 block text-sm font-medium text-gray-700"
						>Start Date</label
					>
					<Input id="event-start" type="date" bind:value={startDate} />
				</div>
				<div>
					<label for="event-end" class="mb-1.5 block text-sm font-medium text-gray-700"
						>End Date</label
					>
					<Input id="event-end" type="date" bind:value={endDate} />
				</div>
			</div>

			<fieldset>
				<legend class="mb-1.5 text-sm font-medium text-gray-700">House Points (optional)</legend>
				<p class="mb-2 text-xs text-gray-500">
					Leave blank to create the event and add points later.
				</p>
				<div class="grid grid-cols-2 gap-3">
					{#each HOUSES as h (h)}
						{@const colors = HOUSE_COLORS[h]}
						<div>
							<label for={`points-${h}`} class="mb-1 block text-xs font-semibold {colors.text}">
								{h}
							</label>
							<Input id={`points-${h}`} type="number" bind:value={housePoints[h]} placeholder="0" />
						</div>
					{/each}
				</div>
			</fieldset>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (eventDialogOpen = false)}>Cancel</Button>
			<Button disabled={isSubmitting} onclick={handleEventSubmit}>
				{isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Event'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Event</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete "<strong>{deleteTarget?.title}</strong>"? This action cannot
				be undone.
			</Dialog.Description>
		</Dialog.Header>

		{#if deleteTarget?.hasPoints}
			<div
				class="mb-3 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700"
			>
				<AlertTriangle class="mt-0.5 size-5 shrink-0 text-red-500" />
				<div>
					<p class="font-semibold">Warning</p>
					<p>
						This event has house points data that will be permanently removed from the house
						rankings. Proceed with caution.
					</p>
				</div>
			</div>
			<p class="mb-3 text-xs text-gray-500">This action has been logged for audit purposes.</p>
		{/if}

		{#if deleteError}
			<p class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{deleteError}
			</p>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)} disabled={isDeleting}>
				Cancel
			</Button>
			<Button variant="destructive" disabled={isDeleting} onclick={handleDelete}>
				{isDeleting ? 'Deleting…' : 'Delete Event'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
