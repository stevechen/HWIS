<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import * as Calendar from './index.js';
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import { type DateValue } from '@internationalized/date';

	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		weekdayFormat = 'short',
		class: className,
		locale = 'en-US',
		day,
		...restProps
	}: {
		ref?: CalendarPrimitive.RootProps['ref'];
		value?: DateValue | undefined;
		placeholder?: CalendarPrimitive.RootProps['placeholder'];
		weekdayFormat?: CalendarPrimitive.RootProps['weekdayFormat'];
		class?: string;
		locale?: string;
		day?: Snippet<[{ day: DateValue; outsideMonth: boolean }]>;
		[key: string]: unknown;
	} = $props();
</script>

<CalendarPrimitive.Root
	bind:ref
	bind:value
	bind:placeholder
	type="single"
	{weekdayFormat}
	class={cn(
		'bg-background group/calendar p-3 [--cell-size:2rem] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent',
		className
	)}
	{locale}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<div class="flex flex-wrap justify-center gap-6">
			{#each months as month, monthIndex (month.value.toString())}
				<div class={monthIndex > 0 ? 'hidden md:block' : ''}>
					<div class="relative mb-4 flex h-9 items-center justify-center">
						{#if monthIndex === 0}
							<div class="absolute left-0">
								<Calendar.PrevButton />
							</div>
						{/if}
						<div class="text-sm font-medium" role="heading" aria-level="2">
							{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
								new Date(month.value.year, month.value.month - 1, 1)
							)}
						</div>
						{#if monthIndex === months.length - 1}
							<div class="absolute right-0">
								<Calendar.NextButton />
							</div>
						{/if}
					</div>
					<Calendar.Grid>
						<Calendar.GridHead>
							<Calendar.GridRow class="select-none">
								{#each weekdays as weekday (weekday)}
									<Calendar.HeadCell>
										{weekday.slice(0, 2)}
									</Calendar.HeadCell>
								{/each}
							</Calendar.GridRow>
						</Calendar.GridHead>
						<Calendar.GridBody>
							{#each month.weeks as weekDates (weekDates)}
								<Calendar.GridRow class="mt-2 w-full">
									{#each weekDates as date (date)}
										<Calendar.Cell {date} month={month.value}>
											{#if day}
												{@render day({
													day: date,
													outsideMonth: date.month !== month.value.month
												})}
											{:else}
												<Calendar.Day />
											{/if}
										</Calendar.Cell>
									{/each}
								</Calendar.GridRow>
							{/each}
						</Calendar.GridBody>
					</Calendar.Grid>
				</div>
			{/each}
		</div>
	{/snippet}
</CalendarPrimitive.Root>
