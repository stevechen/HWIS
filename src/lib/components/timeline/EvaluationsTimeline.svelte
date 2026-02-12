<script lang="ts">
	import {
		ArrowUp,
		ArrowDown,
		Calendar,
		User,
		Eye,
		EyeOff,
		ListChevronsDownUp,
		ListChevronsUpDown
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import type { EvaluationEntry } from './types.js';

	interface Props {
		evaluations: EvaluationEntry[];
		title?: string;
		showStudentName?: boolean;
		showTeacherFilter?: boolean;
		studentGrade?: number;
		showTeacherName?: boolean;
		enableCardClick?: boolean;
		cardHref?: (entry: EvaluationEntry) => string;
		onCardClick?: (entry: EvaluationEntry) => void;
		sortAscending?: boolean;
		showDetails?: boolean;
		showUnenrolled?: boolean;
		onToggleShowUnenrolled?: () => void;
		enableLongPress?: boolean;
		onLongPress?: (entry: EvaluationEntry) => void;
		canEditEntry?: (entry: EvaluationEntry) => boolean;
		children?: import('svelte').Snippet;
	}

	let {
		evaluations,
		title = undefined,
		showStudentName = false,
		studentGrade,
		showTeacherName = false,
		enableCardClick = false,
		cardHref,
		onCardClick,
		sortAscending: sortAscending = $bindable(false),
		showDetails: showDetails = $bindable(false),
		showUnenrolled: showUnenrolled = false,
		onToggleShowUnenrolled,
		enableLongPress = false,
		onLongPress,
		canEditEntry,
		children
	}: Props = $props();

	// Client-side fallback filter (server handles primary filtering)
	const filteredEvaluations = $derived.by(() => {
		if (showUnenrolled) return evaluations;
		return evaluations.filter((e) => e.status !== 'Not Enrolled');
	});

	let hoveredIndex = $state<number | null>(null);
	let longPressTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	let isLongPress = $state(false);
	const LONG_PRESS_THRESHOLD = 500; // ms

	function handleMouseDown(entry: EvaluationEntry): void {
		if (!enableLongPress || !onLongPress) return;
		if (canEditEntry && !canEditEntry(entry)) return;

		isLongPress = false;
		longPressTimer = setTimeout(() => {
			isLongPress = true;
			onLongPress(entry);
		}, LONG_PRESS_THRESHOLD);
	}

	function handleMouseUp(): void {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleTouchStart(entry: EvaluationEntry): void {
		if (!enableLongPress || !onLongPress) return;
		if (canEditEntry && !canEditEntry(entry)) return;

		isLongPress = false;
		longPressTimer = setTimeout(() => {
			isLongPress = true;
			onLongPress(entry);
		}, LONG_PRESS_THRESHOLD);
	}

	function handleTouchEnd(): void {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function handleCardClick(entry: EvaluationEntry): void {
		// Only navigate if NOT a long-press
		if (!isLongPress && enableCardClick && onCardClick) {
			onCardClick(entry);
		}
	}

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
</script>

<div class="flex flex-wrap md:flex-nowrap justify-between items-center gap-4">
	<div class="flex flex-wrap items-center gap-4">
		{#if title}
			<h2 class="font-semibold text-xl">{title}</h2>
		{/if}
		{#if children}
			<div class="flex flex-wrap items-center gap-2">
				{@render children()}
			</div>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		<Button
			aria-label={sortAscending ? 'Oldest First' : 'Newest First'}
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

		<!-- Toggle show unenrolled students (admin only) -->
		{#if onToggleShowUnenrolled}
			<Button
				aria-label={showUnenrolled ? 'Hide unenrolled students' : 'Show unenrolled students'}
				variant="outline"
				size="sm"
				onclick={() => onToggleShowUnenrolled()}
				title={showUnenrolled ? 'Hide unenrolled students' : 'Show unenrolled students'}
			>
				{#if showUnenrolled}
					<Eye class="size-4" />
				{:else}
					<EyeOff class="size-4" />
				{/if}
			</Button>
		{/if}

		<Button
			aria-label={showDetails ? 'Hide Details' : 'Show Details'}
			variant="outline"
			size="sm"
			onclick={() => (showDetails = !showDetails)}
			title={showDetails ? 'Hide Details' : 'Show Details'}
		>
			{#if showDetails}
				<ListChevronsUpDown class="size-4" />
			{:else}
				<ListChevronsDownUp class="size-4" />
			{/if}
		</Button>
	</div>
</div>

{#if filteredEvaluations.length === 0}
	<Card.Root class="p-8 text-center">
		<Card.Content class="pt-6">
			<p class="mb-6 text-muted-foreground">No evaluations found.</p>
		</Card.Content>
	</Card.Root>
{:else}
	<div
		role="region"
		aria-label="Evaluations"
		class="relative bg-linear-to-b from-white-100/0 via-white/80 to-white-100/0"
	>
		<div
			class="top-0 bottom-0 left-1/2 absolute border-border border-l w-0.5 -translate-x-1/2"
			role="separator"
			aria-label="Timeline divider"
		></div>
		<div class="relative flex flex-col gap-6 py-4 min-h-25">
			{#each filteredEvaluations as entry, idx (entry._id)}
				<div class="items-center gap-2 sm:gap-4 grid grid-cols-[1fr_auto_1fr]">
					<div
						class={[
							idx % 2 === 0 && 'order-1 items-end pr-2 text-right',
							idx % 2 !== 0 && 'order-3 items-start pl-2',
							'text-muted-foreground flex flex-col justify-center self-center sm:w-full sm:min-w-38'
						]}
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

					<div class="z-10 flex justify-center items-center order-2">
						<div
							class="border-background size-3 rounded-full border-2 {getNodeColor(entry.value)}"
						></div>
					</div>

					<svelte:element
						this={entry && cardHref ? 'a' : 'div'}
						href={entry && cardHref ? cardHref(entry) : undefined}
						class={[
							idx % 2 === 0 && 'order-3 justify-start pl-2',
							idx % 2 !== 0 && 'order-1 justify-end pr-2',
							'flex self-center sm:w-full'
						]}
					>
						{@render card(entry, idx)}
					</svelte:element>
				</div>
			{/each}
		</div>
	</div>
{/if}

{#snippet card(entry: EvaluationEntry, idx: number)}
	<div
		class="bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50 {getCardBorderColor(
			entry
		)}"
		role="button"
		aria-label="Evaluation for {showStudentName ? entry.englishName : entry.category}}"
		tabindex="0"
		onmouseenter={() => (hoveredIndex = idx)}
		onmouseleave={() => {
			hoveredIndex = null;
			handleMouseUp();
		}}
		onmousedown={() => handleMouseDown(entry)}
		onmouseup={handleMouseUp}
		ontouchstart={() => handleTouchStart(entry)}
		ontouchend={handleTouchEnd}
		onclick={() => handleCardClick(entry)}
		onkeydown={(e) => {
			if (e.key === 'Enter') handleCardClick(entry);
			if (e.key === 'Escape') handleMouseUp();
		}}
	>
		{#if showStudentName && entry.englishName}
			<div class="flex items-center gap-2 mb-1 text-sm">
				<User class="size-3" />
				<span class="font-semibold">{entry.englishName}</span>
				{#if studentGrade || entry.grade}
					<span class="bg-muted px-2 py-0.5 rounded-full text-xs"
						>G{studentGrade || entry.grade}</span
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
			class="absolute -top-4 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow {getPointsBadgeClasses(
				entry.value
			)}"
		>
			<span>{entry.value > 0 ? '+' : ''}{entry.value}</span>
		</div>
	</div>
{/snippet}
