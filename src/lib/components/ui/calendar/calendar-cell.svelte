<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CalendarPrimitive.CellProps = $props();
</script>

<CalendarPrimitive.Cell
	bind:ref
	class={cn(
		'[&:has([data-selected])]:bg-accent [&:has([data-selected].day-outside)]:bg-accent/50 relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
		className
	)}
	{...restProps}
/>
