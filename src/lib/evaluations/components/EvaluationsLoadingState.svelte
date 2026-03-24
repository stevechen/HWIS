<script lang="ts">
	import { Loader } from '@lucide/svelte';

	interface Props {
		message?: string;
	}

	let { message = 'Loading evaluations...' }: Props = $props();
</script>

<div class="text-muted-foreground flex items-center justify-center gap-2 py-16 text-center">
	<Loader class="size-5 animate-spin" />
	{message}
</div>
