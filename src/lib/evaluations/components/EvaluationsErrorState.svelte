<script lang="ts">
	interface Props {
		message: string;
	}

	let { message }: Props = $props();
</script>

<div class="bg-card p-8 border border-destructive rounded-lg text-center">
	<p class="text-destructive">Error loading evaluations: {message}</p>
</div>
