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
	import type { EvaluationEntry } from './types.js';

	interface Props {
		evaluations: EvaluationEntry[];
		title: string;
		showStudentName?: boolean;
		studentGrade?: number;
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

<div class="flex justify-between items-center mb-6">
	<h2 class="font-semibold text-xl">{title}</h2>
	<div class="flex items-center gap-2">
		{#if showTeacherFilter}
			<select
				bind:value={selectedTeacherFilter}
				onchange={(e) => onTeacherFilterChange?.((e.target as HTMLSelectElement).value)}
				class="bg-background shadow-sm px-3 py-1 border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring h-9 text-sm transition-colors"
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
			<p class="mb-6 text-muted-foreground">No evaluations found.</p>
		</Card.Content>
	</Card.Root>
{:else}
	<div class="relative bg-background">
		<div
			class="top-0 bottom-0 left-1/2 absolute border-border border-l w-0.5 -translate-x-1/2"
			role="separator"
			aria-label="Timeline divider"
		></div>

		<div class="relative flex flex-col gap-6 py-4 min-h-25">
			{#each evaluations as entry, idx (entry._id)}
				{#if idx % 2 === 0}
					<div class="items-center gap-2 sm:gap-4 grid grid-cols-[1fr_auto_1fr]">
						<div
							class="flex flex-col justify-center items-end self-center pr-2 sm:w-full sm:min-w-38 text-muted-foreground text-right"
						>
							<div class="flex items-center gap-1 text-xs">
								<Calendar class="size-3" />
								<span>{formatDate(entry.timestamp)}</span>
							</div>
							{#if showTeacherName && entry.teacherName}
								<div class="flex items-center gap-1 mt-1 text-xs">
									<User class="size-3" />
									<span class={getTeacherNameColor(entry)}>{entry.teacherName}</span>
								</div>
							{/if}
						</div>

						<div class="z-10 flex justify-center items-center">
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
					<div class="items-center gap-2 sm:gap-4 grid grid-cols-[1fr_auto_1fr]">
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

						<div class="z-10 flex justify-center items-center">
							<div
								class="border-background size-3 rounded-full border-2 {getNodeColor(entry.value)}"
							></div>
						</div>

						<div
							class="flex flex-col justify-center items-start self-center pl-2 sm:w-full sm:min-w-38 text-muted-foreground"
						>
							<div class="flex items-center gap-1 text-xs">
								<Calendar class="size-3" />
								<span>{formatDate(entry.timestamp)}</span>
							</div>
							{#if showTeacherName && entry.teacherName}
								<div class="flex items-center gap-1 mt-1 text-xs">
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
		class="right-0 bottom-0 left-0 z-50 fixed flex justify-center items-center gap-6 bg-card shadow-lg p-3 border-t text-muted-foreground text-sm"
	>
		<div class="flex items-center gap-2">
			<div class="bg-emerald-500 rounded-full w-3 h-3"></div>
			<span>Positive Points</span>
		</div>
		<div class="flex items-center gap-2">
			<div class="bg-red-500 rounded-full w-3 h-3"></div>
			<span>Negative Points</span>
		</div>
	</div>
	<div class="h-16"></div>
{/if}

{#snippet cardContent(entry: EvaluationEntry, idx: number)}
	{#if showStudentName && entry.englishName}
		<div class="flex items-center gap-2 mb-1 text-sm">
			<User class="size-3" />
			<span class="font-semibold">{entry.englishName}</span>
			{#if studentGrade || entry.grade}
				<span class="bg-muted px-2 py-0.5 rounded-full text-xs">G{studentGrade || entry.grade}</span
				>
			{/if}
		</div>
	{/if}
	<div class="flex sm:flex-row flex-col sm:items-center gap-0.5 sm:gap-2 mb-1">
		<span class="font-semibold text-sm">{entry.category}</span>
		{#if entry.subCategory}
			<span class="hidden sm:inline text-muted-foreground text-xs">›</span>
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
