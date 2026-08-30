<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CalendarPrimitive.DayProps = $props();
</script>

<CalendarPrimitive.Day
	bind:ref
	class={cn(
		buttonVariants({ variant: 'ghost' }),
		'flex size-(--cell-size) flex-col items-center justify-center gap-1 p-0 leading-none font-normal whitespace-nowrap select-none',
		// Today = a ring/outline marker (never a background), so it composes with
		// any cell fill (e.g. a clickable "has data" fill) without conflicting.
		'[&[data-today]:not([data-selected])]:ring-ring [&[data-today]:not([data-selected])]:ring-offset-background [&[data-today][data-disabled]]:text-muted-foreground [&[data-today]:not([data-selected])]:ring-2 [&[data-today]:not([data-selected])]:ring-offset-2',
		'data-disabled:text-muted-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
		'[&[data-outside-month]:not([data-selected])]:text-muted-foreground [&[data-outside-month]:not([data-selected])]:hover:text-accent-foreground',
		'dark:hover:text-accent-foreground',
		'focus:border-ring focus:ring-ring/50 focus:relative',
		'[&>span]:text-xs [&>span]:opacity-70',
		className
	)}
	{...restProps}
/>
