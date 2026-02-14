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
		showControls?: boolean;
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
		showControls: showControls = true,
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
</script>

{#if showControls}
	<div
		class="bg-background sticky top-14 z-10 flex flex-wrap items-center justify-between gap-4 border-b pb-4 md:flex-nowrap"
	>
		<div class="flex flex-wrap items-center gap-4">
			{#if title}
				<h2 class="text-xl font-semibold">{title}</h2>
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
{:else if title || children}
	<div
		class="bg-background sticky top-14 z-10 flex flex-wrap items-center justify-between gap-4 border-b pb-4 md:flex-nowrap"
	>
		<div class="flex flex-wrap items-center gap-4">
			{#if title}
				<h2 class="text-xl font-semibold">{title}</h2>
			{/if}
			{#if children}
				<div class="flex flex-wrap items-center gap-2">
					{@render children()}
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if filteredEvaluations.length === 0}
	<Card.Root class="p-8 text-center">
		<Card.Content class="pt-6">
			<p class="text-muted-foreground mb-6">No evaluations found.</p>
		</Card.Content>
	</Card.Root>
{:else}
	<div
		role="region"
		aria-label="Evaluations"
		class="from-background/0 via-background/80 to-background/0 relative bg-linear-to-b"
	>
		<div
			class="border-border absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 border-l"
			role="separator"
			aria-label="Timeline divider"
		></div>
		<div class="relative flex min-h-25 flex-col gap-6 py-4">
			{#each filteredEvaluations as entry, idx (entry._id)}
				{@const isOdd = idx % 2 === 0}
				<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
					<div
						class={[
							(isOdd && 'order-1 items-end pr-2 text-right') || 'order-3 items-start pl-2',
							'text-muted-foreground flex flex-col justify-center self-center sm:w-full sm:min-w-38'
						]}
					>
						<div class="flex items-center gap-1 text-xs">
							<Calendar class="size-3" />
							<span>{formatDate(entry.timestamp)}</span>
						</div>
						{#if showTeacherName && entry.teacherName}
							<div class="mt-1 flex items-center gap-1 text-xs">
								<User class="size-3" />
								<span class="text-muted-foreground">{entry.teacherName}</span>
							</div>
						{/if}
					</div>

					<div class="order-2 flex items-center justify-center">
						<div
							class={[
								(entry.value > 0 && 'bg-emerald-500') || 'bg-red-500',
								'border-background size-3 rounded-full border-2'
							]}
						></div>
					</div>

					<svelte:element
						this={entry && cardHref ? 'a' : 'div'}
						href={entry && cardHref ? cardHref(entry) : undefined}
						class={[
							(isOdd && 'order-3 justify-start pl-2') || 'order-1 justify-end pr-2',
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
	{@const isPlus = entry.value > 0}
	<div
		class={[
			(isPlus && 'border-emerald-200 dark:border-emerald-800') ||
				'border-red-200 dark:border-red-800',
			'bg-card relative max-w-40 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:max-w-full sm:min-w-50'
		]}
		role="button"
		aria-label="Evaluation {showStudentName
			? 'for ' + entry.englishName
			: 'by ' + entry.teacherName}"
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
			<div class="mb-1 flex items-center gap-2 text-sm">
				<User class="size-3 shrink-0" />
				<span class="font-semibold break-words">{entry.englishName}</span>
				{#if studentGrade || entry.grade}
					<span class="bg-muted shrink-0 rounded-full px-2 py-0.5 text-xs"
						>G{studentGrade || entry.grade}</span
					>
				{/if}
			</div>
		{/if}
		<div class="mb-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
			<span class="text-sm font-semibold break-words">{entry.category}</span>
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
			class={[
				(isPlus && 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400') ||
					'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
				'absolute -top-4 -right-2 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold shadow'
			]}
		>
			<span>{(isPlus && '+') || null}{entry.value}</span>
		</div>
	</div>
{/snippet}
