<script lang="ts">
	import RecentActionsPanel from '$lib/evaluations/components/RecentActionsPanel.svelte';

	interface Props {
		hasRecent: boolean;
	}

	let { hasRecent }: Props = $props();
</script>

<RecentActionsPanel {hasRecent} />
