<script lang="ts">
	import {
		ArrowUp,
		ArrowDown,
		Award,
		CircleMinus,
		Star,
		Calendar,
		User,
		Eye
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	export interface EvaluationEntry {
		_id: string;
		value: number;
		category: string;
		subCategory?: string;
		details?: string;
		timestamp: number;
		teacherName?: string;
		isAdmin?: boolean;
		englishName?: string;
		grade?: number;
		studentId?: string;
	}

	interface Props {
		evaluations: EvaluationEntry[];
		title: string;
		showStudentName?: boolean;
		studentGrade?: number;
		isAdmin?: boolean;
		showTeacherFilter?: boolean;
		uniqueTeachers?: string[];
		selectedTeacherFilter?: string;
		onTeacherFilterChange?: (value: string) => void;
		showLegend?: boolean;
		showTeacherName?: boolean;
		enableCardClick?: boolean;
		cardHref?: (entry: EvaluationEntry) => string;
		onCardClick?: (entry: EvaluationEntry) => void;
		sortAscending?: boolean;
		showDetails?: boolean;
	}

	let {
		evaluations,
		title,
		showStudentName = false,
		studentGrade,
		isAdmin = false,
		showTeacherFilter = false,
		uniqueTeachers = [],
		selectedTeacherFilter = '',
		onTeacherFilterChange,
		showLegend = false,
		showTeacherName = false,
		enableCardClick = false,
		cardHref,
		onCardClick,
		sortAscending: sortAscending = $bindable(false),
		showDetails: showDetails = $bindable(false)
	}: Props = $props();

	let hoveredIndex = $state<number | null>(null);

	function formatDate(ts: number): string {
		const date = new Date(ts);
		return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
	}

	function getNodeColor(value: number): string {
		return value >= 0 ? 'bg-emerald-500' : 'bg-red-500';
	}

	function getCardBorderColor(entry: EvaluationEntry): string {
		if (entry.isAdmin) return 'border-purple-300 dark:border-purple-600';
		return entry.value >= 0
			? 'border-emerald-200 dark:border-emerald-800'
			: 'border-red-200 dark:border-red-800';
	}

	function getTeacherNameColor(entry: EvaluationEntry): string {
		if (entry.isAdmin) return 'text-purple-600 dark:text-purple-400 font-semibold';
		return 'text-muted-foreground';
	}

	function getPointsBadgeClasses(value: number): string {
		if (value >= 0)
			return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400';
		return 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400';
	}

	function handleCardClick(entry: EvaluationEntry): void {
		if (enableCardClick && onCardClick) {
			onCardClick(entry);
		}
	}
</script>

<div class="mb-6 flex items-center justify-between">
	<h2 class="text-xl font-semibold">{title}</h2>
	<div class="flex items-center gap-2">
		{#if showTeacherFilter}
			<select
				bind:value={selectedTeacherFilter}
				onchange={(e) => onTeacherFilterChange?.((e.target as HTMLSelectElement).value)}
				class="bg-background border-input focus:ring-ring h-9 rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus:ring-1 focus:outline-none"
			>
				<option value="">All Teachers</option>
				{#each uniqueTeachers as teacher (teacher)}
					<option value={teacher}>{teacher}</option>
				{/each}
			</select>
		{/if}

		<Button
			variant="outline"
			size="sm"
			onclick={() => (sortAscending = !sortAscending)}
			title={sortAscending ? 'Oldest First' : 'Newest First'}
		>
			{#if sortAscending}
				<ArrowUp class="size-4" />
			{:else}
				<ArrowDown class="size-4" />
			{/if}
		</Button>

		<Button
			variant="outline"
			size="sm"
			onclick={() => (showDetails = !showDetails)}
			title={showDetails ? 'Hide Details' : 'Show Details'}
		>
			<Eye class="size-4" />
		</Button>
	</div>
</div>

{#if evaluations.length === 0}
	<Card.Root class="p-8 text-center">
		<Card.Content class="pt-6">
			<p class="text-muted-foreground mb-6">No evaluations found.</p>
		</Card.Content>
	</Card.Root>
{:else}
	<div class="bg-background relative">
		<div
			class="border-border absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 border-l"
		></div>

		<div class="relative flex min-h-25 flex-col gap-6 py-4">
			{#each evaluations as entry, idx (entry._id)}
				{#if idx % 2 === 0}
					<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
						<div
							class="text-muted-foreground flex flex-col items-end justify-center self-center pr-2 text-right sm:w-full sm:min-w-38"
						>
							<div class="flex items-center gap-1 text-xs">
								<Calendar class="size-3" />
								<span>{formatDate(entry.timestamp)}</span>
							</div>
							{#if showTeacherName && entry.teacherName}
								<div class="mt-1 flex items-center gap-1 text-xs">
									<User class="size-3" />
									<span class={getTeacherNameColor(entry)}>{entry.teacherName}</span>
								</div>
							{/if}
						</div>

						<div class="z-10 flex items-center justify-center">
							<div
								class="border-background size-3 rounded-full border-2 {getNodeColor(entry.value)}"
							></div>
						</div>

						{#if enableCardClick && cardHref}
							<a href={cardHref(entry)} class="flex justify-start self-center pl-2 sm:w-full">
								<div
									class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										entry
									)}"
									role="button"
									tabindex="0"
									onmouseenter={() => (hoveredIndex = idx)}
									onmouseleave={() => (hoveredIndex = null)}
									onclick={() => handleCardClick(entry)}
									onkeydown={(e) => e.key === 'Enter' && handleCardClick(entry)}
								>
									{@render cardContent(entry, idx)}
								</div>
							</a>
						{:else}
							<div class="flex justify-start self-center pl-2 sm:w-full">
								<div
									class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										entry
									)}"
									role="group"
									onmouseenter={() => (hoveredIndex = idx)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									{@render cardContent(entry, idx)}
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
						{#if enableCardClick && cardHref}
							<a href={cardHref(entry)} class="flex justify-end self-center pr-2 sm:w-full">
								<div
									class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										entry
									)}"
									role="button"
									tabindex="0"
									onmouseenter={() => (hoveredIndex = idx)}
									onmouseleave={() => (hoveredIndex = null)}
									onclick={() => handleCardClick(entry)}
									onkeydown={(e) => e.key === 'Enter' && handleCardClick(entry)}
								>
									{@render cardContent(entry, idx)}
								</div>
							</a>
						{:else}
							<div class="flex justify-end self-center pr-2 sm:w-full">
								<div
									class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
										entry
									)}"
									role="group"
									onmouseenter={() => (hoveredIndex = idx)}
									onmouseleave={() => (hoveredIndex = null)}
								>
									{@render cardContent(entry, idx)}
								</div>
							</div>
						{/if}

						<div class="z-10 flex items-center justify-center">
							<div
								class="border-background size-3 rounded-full border-2 {getNodeColor(entry.value)}"
							></div>
						</div>

						<div
							class="text-muted-foreground flex flex-col items-start justify-center self-center pl-2 sm:w-full sm:min-w-38"
						>
							<div class="flex items-center gap-1 text-xs">
								<Calendar class="size-3" />
								<span>{formatDate(entry.timestamp)}</span>
							</div>
							{#if showTeacherName && entry.teacherName}
								<div class="mt-1 flex items-center gap-1 text-xs">
									<User class="size-3" />
									<span class={getTeacherNameColor(entry)}>{entry.teacherName}</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}

{#if showLegend}
	<div
		class="bg-card text-muted-foreground fixed right-0 bottom-0 left-0 z-50 flex items-center justify-center gap-6 border-t p-3 text-sm shadow-lg"
	>
		<div class="flex items-center gap-2">
			<div class="h-3 w-3 rounded-full bg-emerald-500"></div>
			<span>Positive Points</span>
		</div>
		<div class="flex items-center gap-2">
			<div class="h-3 w-3 rounded-full bg-red-500"></div>
			<span>Negative Points</span>
		</div>
	</div>
	<div class="h-16"></div>
{/if}

{#snippet cardContent(entry: EvaluationEntry, idx: number)}
	{#if showStudentName && entry.englishName}
		<div class="mb-1 flex items-center gap-2 text-sm">
			<User class="size-3" />
			<span class="font-semibold">{entry.englishName}</span>
			{#if studentGrade || entry.grade}
				<span class="bg-muted rounded-full px-2 py-0.5 text-xs">G{studentGrade || entry.grade}</span
				>
			{/if}
		</div>
	{/if}
	<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
		<span class="text-sm font-semibold">{entry.category}</span>
		{#if entry.subCategory}
			<span class="text-muted-foreground hidden text-xs sm:inline">›</span>
			<span class="text-muted-foreground text-xs">{entry.subCategory}</span>
		{/if}
	</div>
	<div
		class="overflow-hidden transition-all duration-300 {showDetails || hoveredIndex === idx
			? 'max-h-50 opacity-100'
			: 'max-h-0 opacity-0'}"
	>
		{#if entry.details}
			<p class="text-muted-foreground text-xs">{entry.details}</p>
		{/if}
	</div>
	<div
		class="absolute -top-2 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
			entry.value
		)}"
	>
		{#if entry.isAdmin}
			<Star class="size-4" />
		{:else if entry.value >= 0}
			<Award class="size-4" />
		{:else}
			<CircleMinus class="size-4" />
		{/if}
		<span>{entry.value > 0 ? '+' : ''}{entry.value}</span>
	</div>
{/snippet}
