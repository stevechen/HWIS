<script lang="ts">
	interface Props {
		message: string;
	}

	let { message }: Props = $props();
</script>

<div class="bg-card border-destructive rounded-lg border p-8 text-center">
	<p class="text-destructive">Error loading evaluations: {message}</p>
</div>
