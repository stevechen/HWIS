<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { ButtonProps } from './types.js';
	import { buttonVariants } from './types.js';

	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		testId,
		...restProps
	}: ButtonProps & { testId?: string } = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		data-testid={testId}
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		data-testid={testId}
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
