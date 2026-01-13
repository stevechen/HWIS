<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { api as apiAny } from '$convex/_generated/api';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Archive, RotateCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import Label from '$lib/components/ui/label/label.svelte';
	import * as Card from '$lib/components/ui/card';

	let client = useConvexClient();
	let currentUser = useQuery(api.users.viewer, {});
	let refreshTrigger = $state(0);
	let studentsQuery = useQuery(api.students.list, () => ({ _trigger: refreshTrigger }));

	let archiveYears = $state(1);
	let archiveYearsStr = $state('1');
	let isArchiving = $state(false);
	let archiveResult = $state<any>(null);

	let showAdvanceDialog = $state(false);
	let showArchiveDialog = $state(false);
	let isAdvancing = $state(false);
	let advanceResult = $state<any>(null);

	$effect(() => {
		if (browser && currentUser.isLoading === false) {
			if (currentUser.data?.role !== 'admin' && currentUser.data?.role !== 'super') {
				goto('/');
			}
		}
	});

	function refreshStudents() {
		refreshTrigger++;
	}

	async function handleAdvanceYear() {
		isAdvancing = true;
		advanceResult = null;
		try {
			const result = await client.mutation(apiAny.students.advanceGrades, {});
			advanceResult = result;
			refreshStudents();
		} catch (e: any) {
			alert('Failed: ' + e.message);
		} finally {
			isAdvancing = false;
		}
	}

	async function handleArchive() {
		isArchiving = true;
		archiveResult = null;
		try {
			const result = await client.mutation(apiAny.students.archiveOldGraduates, {
				years: archiveYears
			});
			archiveResult = result;
			refreshStudents();
		} catch (e: any) {
			alert('Failed: ' + e.message);
		} finally {
			isArchiving = false;
		}
	}

	const graduatesToArchive = $derived(
		studentsQuery.data?.filter((s) => {
			if (s.status !== 'Graduated') return false;
			const match = s.note?.match(/Graduated (\d{4})/);
			if (!match) return false;
			const gradYear = parseInt(match[1]);
			const cutoffYear = new Date().getFullYear() - archiveYears;
			return gradYear < cutoffYear;
		}) ?? []
	);
</script>

<div class="bg-background min-h-screen">
	<header class="bg-card border-b shadow-sm">
		<div class="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<Button variant="outline" onclick={() => goto('/admin')}>← Back to Admin</Button>
					<h1 class="text-foreground text-2xl font-bold">Archive & Reset</h1>
				</div>
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
		<div class="grid gap-6 md:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900"
						>
							<RotateCcw class="h-5 w-5 text-blue-600 dark:text-blue-400" />
						</div>
						<Card.Title>Advance Academic Year</Card.Title>
					</div>
					<Card.Description>
						Promote all enrolled students to the next grade and mark graduating seniors as
						"Graduated".
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div
						class="mb-4 rounded bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300"
					>
						<p class="font-medium">This will:</p>
						<ul class="mt-2 list-disc space-y-1 pl-4">
							<li>Advance all enrolled students to the next grade</li>
							<li>Mark grade 12 students as "Graduated"</li>
							<li>Add graduation year to their notes</li>
						</ul>
					</div>
					<Button
						variant="default"
						class="w-full"
						onclick={() => (showAdvanceDialog = true)}
						disabled={isAdvancing}
					>
						{isAdvancing ? 'Processing...' : 'Advance Academic Year'}
					</Button>
					{#if advanceResult}
						<div
							class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
						>
							<p class="font-medium">{advanceResult.message}</p>
							{#if advanceResult.updated}
								<p class="mt-1">{advanceResult.updated.length} students affected</p>
							{/if}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<div class="mb-2 flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900"
						>
							<Archive class="h-5 w-5 text-red-600 dark:text-red-400" />
						</div>
						<Card.Title>Archive Old Graduates</Card.Title>
					</div>
					<Card.Description>
						Permanently remove graduates who are older than the retention period.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="archiveYears">Keep graduates from the last N years:</Label>
							<Select.Root
								type="single"
								bind:value={archiveYearsStr}
								onValueChange={(v) => {
									archiveYears = Number(v);
									archiveYearsStr = v;
								}}
							>
								<Select.Trigger id="archiveYears">
									{archiveYears} year{archiveYears > 1 ? 's' : ''}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="1">1 year</Select.Item>
									<Select.Item value="2">2 years</Select.Item>
									<Select.Item value="3">3 years</Select.Item>
									<Select.Item value="5">5 years</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
						<div
							class="rounded bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
						>
							<p class="font-medium">This will permanently delete:</p>
							<p class="mt-1 text-lg font-bold">{new Date().getFullYear() - archiveYears}</p>
							<p class="mt-1 text-xs opacity-80">
								({graduatesToArchive.length} graduates older than {archiveYears} year{archiveYears >
								1
									? 's'
									: ''})
							</p>
						</div>
						<Button
							class="w-full"
							variant="destructive"
							onclick={() => (showArchiveDialog = true)}
							disabled={isArchiving || graduatesToArchive.length === 0}
						>
							{isArchiving ? 'Archiving...' : 'Archive & Delete'}
						</Button>
						{#if archiveResult}
							<div
								class="rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300"
							>
								<p class="font-medium">{archiveResult.message}</p>
								{#if archiveResult.archived && archiveResult.archived.length > 0}
									<p class="mt-1">Archived IDs: {archiveResult.archived.join(', ')}</p>
								{/if}
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</main>
</div>

<!-- Advance Year Confirmation Dialog -->
<Dialog.Root bind:open={showAdvanceDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Advance Academic Year</Dialog.Title>
		</Dialog.Header>
		<div class="py-4">
			<div
				class="rounded bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
			>
				<p class="font-medium">This will:</p>
				<ul class="mt-2 list-disc pl-4">
					<li>Advance all enrolled students to the next grade</li>
					<li>Mark grade 12 students as "Graduated"</li>
					<li>Add graduation year to their notes</li>
				</ul>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showAdvanceDialog = false)}>Cancel</Button>
			<Button
				onclick={() => {
					showAdvanceDialog = false;
					handleAdvanceYear();
				}}
				disabled={isAdvancing}
			>
				{isAdvancing ? 'Processing...' : 'Confirm & Advance'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Archive Confirmation Dialog -->
<Dialog.Root bind:open={showArchiveDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Archive Old Graduates</Dialog.Title>
		</Dialog.Header>
		<div class="py-4">
			<div class="rounded bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
				<p class="font-medium">
					This will permanently delete {graduatesToArchive.length} graduates.
				</p>
				<p class="mt-2">This action cannot be undone.</p>
				<p class="mt-1 text-xs opacity-80">
					Graduates who graduated before {new Date().getFullYear() - archiveYears} will be deleted.
				</p>
			</div>
			{#if graduatesToArchive.length > 0}
				<div class="mt-4 max-h-40 overflow-auto rounded border p-2 text-sm">
					<p class="mb-2 font-medium">Students to be deleted:</p>
					{#each graduatesToArchive as student}
						<div class="border-b py-1 last:border-b-0">
							{student.englishName} ({student.studentId}) - Graduated
						</div>
					{/each}
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showArchiveDialog = false)}>Cancel</Button>
			<Button
				variant="destructive"
				onclick={() => {
					showArchiveDialog = false;
					handleArchive();
				}}
				disabled={isArchiving}
			>
				{isArchiving ? 'Archiving...' : 'Archive & Delete'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
