<script lang="ts">
	import { Loader } from '@lucide/svelte';

	interface Props {
		message?: string;
	}

	let { message = 'Loading evaluations...' }: Props = $props();
</script>

<div class="flex justify-center items-center gap-2 py-16 text-muted-foreground text-center">
	<Loader class="size-5 animate-spin" />
	{message}
</div>
