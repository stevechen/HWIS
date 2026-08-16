<script lang="ts">
	import { setAuthProfile } from '$lib/auth-profile';
	import type { AuthProfile } from '$lib/auth-profile';
	import RecentActionsPanel from '$lib/evaluations/components/RecentActionsPanel.svelte';

	interface Props {
		profile: { data: unknown; isLoading: boolean; error: unknown };
	}

	let { profile }: Props = $props();

	function initialProfile(): { data: unknown; isLoading: boolean; error: unknown } {
		return profile;
	}

	setAuthProfile(initialProfile() as unknown as AuthProfile);
</script>

<RecentActionsPanel />
