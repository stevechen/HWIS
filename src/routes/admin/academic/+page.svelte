<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { api as apiAny } from '$convex/_generated/api';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { Archive, RotateCcw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { ThemeToggle } from '$lib/components/ui/theme-toggle';
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
	<header class="bg-card shadow-sm border-b">
		<div class="mx-auto px-4 sm:px-6 lg:px-8 py-4 max-w-4xl">
			<div class="flex justify-between items-center">
				<div class="flex items-center gap-4">
					<Button variant="outline" onclick={() => goto('/admin')}>← Back to Admin</Button>
					<h1 class="font-bold text-foreground text-2xl">Archive & Reset</h1>
				</div>
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-4xl">
		<div class="gap-6 grid md:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<div class="flex items-center gap-3 mb-2">
						<div
							class="flex justify-center items-center bg-blue-100 dark:bg-blue-900 rounded-lg w-10 h-10"
						>
							<RotateCcw class="w-5 h-5 text-blue-600 dark:text-blue-400" />
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
						class="bg-blue-50 dark:bg-blue-950 mb-4 p-4 rounded text-blue-700 dark:text-blue-300 text-sm"
					>
						<p class="font-medium">This will:</p>
						<ul class="space-y-1 mt-2 pl-4 list-disc">
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
							class="bg-green-50 dark:bg-green-950 mt-4 p-3 rounded text-green-700 dark:text-green-300 text-sm"
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
					<div class="flex items-center gap-3 mb-2">
						<div
							class="flex justify-center items-center bg-red-100 dark:bg-red-900 rounded-lg w-10 h-10"
						>
							<Archive class="w-5 h-5 text-red-600 dark:text-red-400" />
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
							class="bg-yellow-50 dark:bg-yellow-950 p-4 rounded text-yellow-700 dark:text-yellow-300 text-sm"
						>
							<p class="font-medium">This will permanently delete:</p>
							<p class="mt-1 font-bold text-lg">{new Date().getFullYear() - archiveYears}</p>
							<p class="opacity-80 mt-1 text-xs">
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
								class="bg-green-50 dark:bg-green-950 p-3 rounded text-green-700 dark:text-green-300 text-sm"
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
{#if showAdvanceDialog}
	<div class="z-50 fixed inset-0 flex justify-center items-center" popover="auto">
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showAdvanceDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showAdvanceDialog = false)}
		></div>
		<div class="z-50 relative bg-background shadow-lg border rounded-lg w-full max-w-lg">
			<div class="p-6">
				<h2 class="font-semibold text-lg">Advance Academic Year</h2>
				<div class="py-4">
					<div
						class="bg-yellow-50 dark:bg-yellow-950 p-4 rounded text-yellow-700 dark:text-yellow-300 text-sm"
					>
						<p class="font-medium">This will:</p>
						<ul class="mt-2 pl-4 list-disc">
							<li>Advance all enrolled students to the next grade</li>
							<li>Mark grade 12 students as "Graduated"</li>
							<li>Add graduation year to their notes</li>
						</ul>
					</div>
				</div>
				<div class="flex justify-end gap-2">
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
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Archive Confirmation Dialog -->
{#if showArchiveDialog}
	<div class="z-50 fixed inset-0 flex justify-center items-center" popover="auto">
		<div
			class="fixed inset-0 bg-black/50"
			onclick={() => (showArchiveDialog = false)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Escape' && (showArchiveDialog = false)}
		></div>
		<div class="z-50 relative bg-background shadow-lg border rounded-lg w-full max-w-md">
			<div class="p-6">
				<h2 class="font-semibold text-lg">Archive Old Graduates</h2>
				<div class="py-4">
					<div class="bg-red-50 dark:bg-red-950 p-4 rounded text-red-700 dark:text-red-300 text-sm">
						<p class="font-medium">
							This will permanently delete {graduatesToArchive.length} graduates.
						</p>
						<p class="mt-2">This action cannot be undone.</p>
						<p class="opacity-80 mt-1 text-xs">
							Graduates who graduated before {new Date().getFullYear() - archiveYears} will be deleted.
						</p>
					</div>
					{#if graduatesToArchive.length > 0}
						<div class="mt-4 p-2 border rounded max-h-40 overflow-auto text-sm">
							<p class="mb-2 font-medium">Students to be deleted:</p>
							{#each graduatesToArchive as student}
								<div class="py-1 border-b last:border-b-0">
									{student.englishName} ({student.studentId}) - Graduated
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<div class="flex justify-end gap-2">
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
				</div>
			</div>
		</div>
	</div>
{/if}
