<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { ChevronRight } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CalendarPrimitive.NextButtonProps = $props();
</script>

<CalendarPrimitive.NextButton
	bind:ref
	class={cn(buttonVariants({ variant: 'ghost' }), 'size-7', className)}
	{...restProps}
>
	<ChevronRight class="size-4" />
</CalendarPrimitive.NextButton>
