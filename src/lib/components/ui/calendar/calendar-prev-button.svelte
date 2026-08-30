<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { ChevronLeft } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CalendarPrimitive.PrevButtonProps = $props();
</script>

<CalendarPrimitive.PrevButton
	bind:ref
	class={cn(buttonVariants({ variant: 'ghost' }), 'size-7', className)}
	{...restProps}
>
	<ChevronLeft class="size-4" />
</CalendarPrimitive.PrevButton>
